var fs = require('fs-extra')
var path = require('path')
var express = require('express')
var Busboy = require('busboy')
var bodyParser = require('body-parser')
var cors = require('cors')
var crypto = require('crypto')
var basicAuth = require('basic-auth')
var app = express()
var diff = require('./lib/diff')
var auth = require('./lib/auth')
var db = require('./lib/db')
var current = require('./lib/current')
var messages = require('./lib/messages')
var queue = require('./lib/queue')
var initialize = require('./lib/initialize')
var validators = require('./lib/validators')
var uploadedFile = require('./lib/uploaded-file')
var config = require('histograph-config')

initialize()

// If uploaded files are larger than 500MB, return directly and check file later
//   Currently, when errors are encountered in such files, the API provides no
//   way of letting users know...
var maxRealTimeCheckFileSize = 500000000

app.use(bodyParser.json({
  type: 'application/json'
}))

app.use(bodyParser.text({
  type: 'application/x-ndjson'
}))

app.use(cors())

function send200 (res) {
  res.status(200).send({
    message: 'ok'
  })
}

function send201 (res) {
  res.status(201).send({
    message: 'ok'
  })
}

function send404 (res, type, id) {
  res.status(404).send({
    message: type + " '" + id + "' not found"
  })
}

function send409 (res, type, id) {
  res.status(409).send({
    message: type + " '" + id + "' already exists"
  })
}

function send500 (res, message) {
  res.status(500).send({
    message: message
  })
}

app.get('/datasets', function (req, res) {
  db.getDatasets(function (err, datasets) {
    if (err) {
      send500(err.message)
    } else {
      res.send(datasets)
    }
  })
})

app.post('/datasets',
  auth.owner,
  function (req, res) {
    var dataset = req.body
    if (validators.dataset(dataset)) {
      db.getDataset(dataset.id, function (err, data) {
        if (err && err.status === 404) {
          var owner = basicAuth(req)
          db.createDataset(dataset, owner.name, function (err) {
            if (err) {
              send500(res, err.message)
            } else {
              // Add createDataset message to queue
              var message = messages.createDataset(dataset, owner.name)
              queue.add(message)

              current.createDir(dataset.id)
              send201(res)
            }
          })
        } else if (data) {
          send409(res, 'Dataset', dataset.id)
        } else if (err) {
          send500(res, err.message)
        } else {
          send500(res, 'unknown error')
        }
      })
    } else {
      res.status(422).send({
        message: validators.dataset.errors
      })
    }
  }
)

function datasetExists (req, res, next) {
  var dataset = req.params.dataset

  db.getDataset(dataset, function (err) {
    if (err) {
      send404(res, 'Dataset', req.params.dataset)
    } else {
      next()
    }
  })
}

app.patch('/datasets/:dataset',
  datasetExists,
  auth.ownerForDataset,
  function (req, res) {
    var dataset = req.body

    if (dataset.id === req.params.dataset || dataset.id === undefined) {
      if (validators.dataset(dataset)) {
        db.updateDataset(dataset, function (err) {
          if (err) {
            send500(err.message)
          } else {
            // Add updateDataset message to queue
            var message = messages.updateDataset(dataset)
            queue.add(message)

            send200(res)
          }
        })
      } else {
        res.status(422).send({
          message: validators.dataset.errors
        })
      }
    } else {
      res.status(422).send({
        message: 'Dataset ID in URL must match dataset ID in JSON body'
      })
    }
  }
)

app.delete('/datasets/:dataset',
  datasetExists,
  auth.ownerForDataset,
  function (req, res) {
    db.deleteDataset(req.params.dataset, function (err) {
      if (err) {
        send500(err.message)
      } else {
        send200(res)

        var message = messages.deleteDataset(req.params.dataset)
        queue.add(message)

        fs.closeSync(fs.openSync(current.getFilename(req.params.dataset, 'pits'), 'w'))
        fs.closeSync(fs.openSync(current.getFilename(req.params.dataset, 'relations'), 'w'))

        diff.fileChanged(req.params.dataset, 'pits', false, function () {
          diff.fileChanged(req.params.dataset, 'relations', false, function () {
            fs.removeSync(path.join(config.api.dataDir, 'datasets', req.params.dataset))
          })
        })
      }
    })
  }
)

app.get('/datasets/:dataset', function (req, res) {
  db.getDataset(req.params.dataset, function (err, data) {
    if (err || !data) {
      send404(res, 'Dataset', req.params.dataset)
    } else {
      res.send(data)
    }
  })
})

app.get('/datasets/:dataset/:file(pits|relations)',
  datasetExists,
  function (req, res) {
    var filename = current.getCurrentFilename(req.params.dataset, req.params.file)
    fs.exists(filename, function (exists) {
      if (exists) {
        var stat = fs.statSync(filename)

        res.writeHead(200, {
          'Content-Type': 'text/plain',
          'Content-Length': stat.size
        })
        fs.createReadStream(filename).pipe(res)
      } else {
        res.send('')
      }
    })
  }
)

app.put('/datasets/:dataset/:file(pits|relations)',
  datasetExists,
  auth.ownerForDataset,
  function (req, res) {
    // when force header is specified, NDJSON files are _not_ diffed,
    // but directly pushed to Redis
    var force = req.headers['x-histograph-force'] === 'true'

    // TODO this path should fail when content-type is different
    req.accepts('application/x-ndjson')

    var currentDate = (new Date()).valueOf().toString()
    var random = Math.random().toString()

    var uploadedFilename = path.join(
      config.api.dataDir,
      'uploads',
      crypto.createHash('sha1').update(currentDate + random).digest('hex') + '.ndjson'
    )

    var busboy
    try {
      busboy = new Busboy({
        headers: req.headers
      })
    } catch (e) {
      // No multi-part data to parse!
    }

    if (busboy) {
      // multipart/form-data file upload, use Busboy!

      busboy.on('file', function (fieldname, file) {
        file.pipe(fs.createWriteStream(uploadedFilename))
      })

      busboy.on('finish', function () {
        fs.stat(uploadedFilename, function (err, stat) {
          if (err || !stat) {
            var message
            if (err && err.error) {
              message = err.error
            } else {
              message = 'Error reading uploaded file'
            }

            res.status(409).send({
              message: message
            })

            return
          }

          if (stat.size <= maxRealTimeCheckFileSize) {
            uploadedFile.process(res, req.params.dataset, req.params.file, uploadedFilename, force)
          } else {
            send200(res)
            uploadedFile.process(null, req.params.dataset, req.params.file, uploadedFilename, force)
          }
        })
      })

      return req.pipe(busboy)
    } else {
      // JSON POST data in req.body
      var contents

      // Apparently, req.body === {} when JSON POST data is empty
      if (typeof req.body === 'object' && Object.keys(req.body).length === 0) {
        contents = ''
      } else {
        contents = req.body
      }

      fs.writeFile(uploadedFilename, contents, function (err) {
        if (err) {
          res.status(409).send({
            message: err.error
          })
        } else {
          uploadedFile.process(res, req.params.dataset, req.params.file, uploadedFilename, force)
        }
      })
    }
  }
)

module.exports = app
