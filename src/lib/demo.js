'use strict'

const path = require('path')
const randomgraph = require('randomgraph')

const traderNames = [
  'mark', 'mary', 'martin', 'millie',
  'mia', 'mike', 'mesrop', 'michelle',
  'milo', 'miles', 'michael', 'micah', 'max'
]

const currencies = [
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP',
  'HKD', 'HRK', 'HUF', 'IDR', 'ILS', 'INR', 'JPY', 'KRW', 'MXN', 'MYR',
  'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'RUB', 'SEK', 'SGD', 'THB', 'TRY',
  'USD', 'ZAR'
]

class Demo {
  constructor (opts) {
    const _this = this

    this.numLedgers = opts.numLedgers
    this.numTraders = opts.numTraders
    this.barabasiAlbertConnectedCore = opts.barabasiAlbertConnectedCore || 2
    this.barabasiAlbertConnectionsPerNewNode = opts.barabasiAlbertConnectionsPerNewNode || 2

    // Trader graph
    // Barabási–Albert (N, m0, M)
    //
    // N .. number of nodes
    // m0 .. size of connected core (m0 <= N)
    // M .. (M <= m0)
    this.graph = randomgraph.BarabasiAlbert(
      this.numLedgers,
      this.barabasiAlbertConnectedCore,
      this.barabasiAlbertConnectionsPerNewNode)
    this.traderEdges = new Array(this.numTraders)
    for (let i = 0; i < this.numTraders; i++) {
      this.traderEdges[i] = []
    }
    this.graph.edges.forEach(function (edge, i) {
      edge.source_currency = currencies[edge.source % currencies.length]
      edge.target_currency = currencies[edge.target % currencies.length]
      edge.source = 'http://localhost:' + (3001 + edge.source)
      edge.target = 'http://localhost:' + (3001 + edge.target)
      _this.traderEdges[i % _this.numTraders].push(edge)
    })
  }

  createLedger (name, port) {
    const dbPath = path.resolve(__dirname, '../../data/' + name + '.sqlite')
    return {
      env: {
        PATH: process.env.PATH,
        LEDGER_DB_URI: 'sqlite://' + dbPath,
        LEDGER_DB_SYNC: true,
        LEDGER_HOSTNAME: 'localhost',
        LEDGER_PORT: port
      },
      cwd: './node_modules/@ripple/five-bells-ledger',
      cmd: 'npm start -- --color',
      waitFor: 'listening',
      alias: 'ledger-' + name
    }
  }

  static makeCredentials (ledger, name) {
    return {
      account_uri: ledger + '/accounts/' + encodeURIComponent(name),
      username: name,
      password: name
    }
  }

  createTrader (name, port, edges) {
    let creds = {}
    let pairs = []
    for (let edge of edges) {
      creds[edge.source] = Demo.makeCredentials(edge.source, name)
      creds[edge.target] = Demo.makeCredentials(edge.target, name)
      pairs.push([
        edge.source_currency + '@' + edge.source,
        edge.target_currency + '@' + edge.target
      ])
      pairs.push([
        edge.target_currency + '@' + edge.target,
        edge.source_currency + '@' + edge.source
      ])
    }

    return {
      env: {
        TRADER_CREDENTIALS: JSON.stringify(creds),
        TRADER_DEBUG_AUTOFUND: '1',
        TRADING_PAIRS: JSON.stringify(pairs),
        TRADER_MAX_HOLD_TIME: 60,
        PATH: process.env.PATH,
        TRADER_HOSTNAME: 'localhost',
        TRADER_PORT: port
      },
      cwd: './node_modules/@ripple/five-bells-trader',
      cmd: 'npm start -- --color',
      alias: 'trader-' + name
    }
  }

  createVisualization (port, ledger) {
    return {
      env: {
        PATH: process.env.PATH,
        CRAWLER_INITIAL_LEDGERS: ledger,
        VISUALIZATION_RECRAWL_INTERVAL: 30000,
        HOSTNAME: 'localhost',
        PORT: port
      },
      cwd: './node_modules/@ripple/five-bells-visualization',
      cmd: 'npm start -- --color',
      alias: 'visualization'
    }
  }

  createAccount (ledger, name) {
    return {
      env: {
        PATH: process.env.PATH,
        LEDGER: ledger,
        USERNAME: name
      },
      cwd: './',
      cmd: './scripts/create-account.js',
      alias: 'create-account-' + name
    }
  }

  start () {
    const multiplexer = require('multiplexer')
    const processes = []
    const accounts = []
    for (let i = 0; i < this.numLedgers; i++) {
      let port = 3001 + i
      processes.push(this.createLedger('ledger' + i, port))
      accounts.push(this.createAccount('http://localhost:' + port, 'alice'))
      accounts.push(this.createAccount('http://localhost:' + port, 'bob'))
    }

    for (let i = 0; i < this.numTraders; i++) {
      processes.push(this.createTrader(traderNames[i] || 'trader' + i, 4001 + i, this.traderEdges[i]))
    }

    multiplexer(processes.concat([
      this.createVisualization(5001, 'http://localhost:3001')
    ], accounts))
  }
}

exports.Demo = Demo