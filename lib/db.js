var path = require('path')
var config = require('histograph-config')
var bcrypt = require('bcrypt')
var levelup = require('level')
var H = require('highland')

var dbDir = path.join(config.api.dataDir, 'api')

var db = levelup(dbDir, {
  keyEncoding: 'json',
  valueEncoding: 'json'
})

function getKey (type, id) {
  return `${type}/${id}`
}

function keyType (key) {
  return key.split('/')[0]
}

function utcNow () {
  // returns '2016-03-08T18:43:11'
  return new Date().toISOString().slice(0, 19)
}

module.exports.initAdmin = function () {
  // Create admin owner (overwrite if already exists)
  var name = config.api.admin.name
  var password = config.api.admin.password

  var data = {
    meta: {
      dateCreated: utcNow()
    },
    owner: {
      name: name,
      password: bcrypt.hashSync(password, 8)
    }
  }

  db.put(getKey('owner', name), data, (err) => {
    if (err) {
      console.error('Error creating admin owner...', err.message)
    }
  })
}

module.exports.createDataset = function (dataset, ownerName, callback) {
  var data = {
    meta: {
      owner: ownerName,
      dateCreated: utcNow()
    },
    dataset: dataset
  }

  db.put(getKey('dataset', dataset.id), data, callback)
}

module.exports.deleteDataset = function (dataset, callback) {
  db.del(getKey('dataset', dataset), callback)
}

module.exports.updateDataset = function (dataset, callback) {
  this.getDataset(dataset.id, (err, dataset, meta) => {
    if (err) {
      callback(err)
    } else {
      this.createDataset(dataset, meta.owner, callback)
    }
  })
}

module.exports.getDataset = function (datasetId, callback) {
  db.get(getKey('dataset', datasetId), (err, data) => {
    if (err) {
      callback(err)
    } else {
      callback(null, data.dataset, data.meta)
    }
  })
}

module.exports.getDatasets = function (callback) {
  H(db.createReadStream())
    .stopOnError((err) => callback(err))
    .filter((d) => keyType(d.key) === 'dataset')
    .pluck('value')
    .pluck('dataset')
    .toArray((datasets) => callback(null, datasets))
}

module.exports.getOwner = function (name, callback) {
  db.get(getKey('owner', name), (err, data) => {
    if (err) {
      callback(err)
    } else {
      callback(null, data.owner, data.meta)
    }
  })
}

module.exports.getOwnerForDataset = function (datasetId, callback) {
  this.getDataset(datasetId, (err, dataset, meta) => {
    if (err) {
      callback(err)
    } else {
      this.getOwner(meta.owner, callback)
    }
  })
}
