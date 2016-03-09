var path = require('path')
var fs = require('fs-extra')
var db = require('./db')
var config = require('histograph-config')

module.exports = () => {
  fs.mkdirsSync(path.join(config.api.dataDir, 'datasets'))
  fs.mkdirsSync(path.join(config.api.dataDir, 'uploads'))

  db.initAdmin()
}
