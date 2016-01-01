var test = require('tape')
var hyperkv = require('../')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var sub = require('subleveldown')
var collect = require('collect-stream')

test('del stream', function (t) {
  t.plan(15)
  var db = memdb()
  var kv = hyperkv({
    log: hyperlog(sub(db, 'log'), { valueEncoding: 'json' }),
    db: sub(db, 'kv')
  })
  var docs = {
    A: { links: [], key: 'X', value: 555 },
    B: { links: ['A'], key: 'X', value: 333 },
    C: { links: [], key: 'Z', value: 1000 },
    D: { links: ['B'], key: 'X', value: 222 },
    E: { links: ['B'], key: 'X', value: 400 },
    F: { links: [], key: 'Y', value: 999 },
    G: { links: ['C'], key: 'Z', value: 2000 },
    H: { links: ['C'], key: 'Z', value: 2500 },
    I: { links: ['G','H'], key: 'Z', value: 3000 },
  }

  var nodes = []
  var keys = Object.keys(docs).sort()
  ;(function next () {
    if (keys.length === 0) {
      return kv.del('X', function (err, node) {
        t.ifError(err)
        done()
      })
    }
    var key = keys.shift()
    var doc = docs[key]
    var opts = {
      links: doc.links.map(function (link) {
        return nodes[link].key
      })
    }
    kv.put(doc.key, doc.value, opts, function (err, node) {
      t.ifError(err)
      nodes[key] = node
      next()
    })
  })()

  function done () {
    collect(kv.createReadStream(), function (err, rows) {
      t.ifError(err)
      var expected = []
      expected[0].values[nodes.D.key] = 222
      expected[0].values[nodes.E.key] = 400
      expected.push({
        key: 'Y',
        links: [ nodes.F.key ],
        values: {}
      })
      expected[1].values[nodes.F.key] = 999
      expected.push({
        key: 'Z',
        links: [ nodes.I.key ],
        values: {}
      })
      expected[2].values[nodes.I.key] = 3000
      t.deepEqual(rows, expected, 'stream {}')
    })
    collect(kv.createReadStream({ values: false }), function (err, rows) {
      t.ifError(err)
      var expected = []
      expected.push({
        key: 'Y',
        links: [ nodes.F.key ]
      })
      expected.push({
        key: 'Z',
        links: [ nodes.I.key ]
      })
      t.deepEqual(rows, expected, 'stream { values: false }')
    })
    collect(kv.createReadStream({ gt: 'X' }), function (err, rows) {
      t.ifError(err)
      var expected = []
      expected.push({
        key: 'Y',
        links: [ nodes.F.key ],
        values: {}
      })
      expected[0].values[nodes.F.key] = 999
      expected.push({
        key: 'Z',
        links: [ nodes.I.key ],
        values: {}
      })
      expected[1].values[nodes.I.key] = 3000
      t.deepEqual(rows, expected, 'stream { gt: "X" }')
    })
  }
})