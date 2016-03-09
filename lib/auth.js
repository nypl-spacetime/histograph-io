var bcrypt = require('bcrypt')
var basicAuth = require('basic-auth')
var db = require('./db')

function send401 (res) {
  res.status(401).send({
    message: 'Authorization required'
  })
}

function checkOwner (req, owner) {
  var user = basicAuth(req)
  return user && (owner.name === user.name) && bcrypt.compareSync(user.pass, owner.password)
}

module.exports.owner = function (req, res, next) {
  var user = basicAuth(req)
  if (user) {
    db.getOwner(user.name, function (err, owner) {
      if (!err && owner && checkOwner(req, owner)) {
        next()
      } else {
        send401(res)
      }
    })
  } else {
    return send401(res)
  }
}

module.exports.ownerForDataset = function (req, res, next) {
  db.getOwnerForDataset(req.params.dataset, function (err, owner) {
    if (!err && owner && checkOwner(req, owner)) {
      next()
    } else {
      send401(res)
    }
  })
}
