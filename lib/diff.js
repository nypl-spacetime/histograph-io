var fs = require('fs')
var diff = require('diff-utility')
var current = require('./current')
var queue = require('./queue')
var H = require('highland')
var config = require('spacetime-config')

var types = {
  pits: 'pit',
  relations: 'relation'
}

function intoRedis () {
  return function (err, x, push, next) {
    // pass errors along the stream and consume next value
    if (err) {
      push(err)
      next()
      return
    }

    // pass nil (end event) along the stream, don't call next
    if (x === H.nil) {
      push(null, x)
      return
    }

    // OK, process the thing, wait until it's done to call next()
    queue.add(x, function (err, queueSize) {
      if (err) {
        push(err)
      } else {
        // just report on the queue size
        push(null, {
          data: x,
          queueSize: queueSize
        })
        next()
      }
    })
  }
}

module.exports.fileChanged = function (dataset, type, force, callback) {
  // takes diffs and turns them into change-messages,
  // objects with: type, action, payload and meta properties
  //
  // if specified, it runs callback when done processing the whole diff
  var diffsToChangeMessages = function () {
    var previousMessage
    var previousLine

    return function (err, line, push, next) {
      // pass errors along the stream and consume next value
      if (err) {
        push(err)
        next()
        return
      }

      // end of stream
      if (line === H.nil) {
        // add to queue
        if (previousMessage) {
          push(null, previousMessage)
        }

        // pass nil (end event) along the stream
        push(null, H.nil)

        // done with this event
        return
      }

      // OK, we have a line
      var message = {
        type: types[type],
        action: (line.type === 'in') ? 'create' : 'delete',
        payload: JSON.parse(line.str),
        meta: {
          dataset: dataset
        }
      }

      // this bit of magic detects if we are dealing with an update
      if (previousMessage &&
        message.type === 'pit' &&
        ((message.payload.id && message.payload.id === previousMessage.payload.id) ||
        (message.payload.uri && message.payload.uri === previousMessage.payload.uri)) &&
        line.change === 'change' &&
        line.change === previousLine.change &&
        line.line === previousLine.line) {
        // mark it as update
        message.action = 'update'
      } else {
        // not an update, emit it
        if (previousMessage) {
          push(null, previousMessage)
        }
      }

      previousMessage = message
      previousLine = line

      // and done with this event
      next()
    }
  }

  var filePath = current.getFilename(dataset, type)

  var s
  if (!force) {
    // force === false
    // Run diff, compare with current version of file
    // (Skip empty lines, `.str` property === '')
    // s = diff(config.import.diffTool, current.getCurrent(filePath), filePath, {stream: true})
    //   .filter(H.get('str'))
    //   .consume(diffsToChangeMessages())

    s = H(diff(config.import.diffTool, current.getCurrent(filePath), filePath, {stream: true}))
      .filter(H.get('str'))
      .consume(diffsToChangeMessages())

  } else {
    // force === true
    // Don't run diff, but write each line
    // to the queue directly!

    s = H(fs.createReadStream(filePath))
      .split()
      .compact()
      .map(JSON.parse)
      .map((payload) => {
        return {
          type: types[type],
          action: 'create',
          payload: payload,
          meta: {
            dataset: dataset
          }
        }
      })
  }

  s.consume(intoRedis()).done(() => {
    queue.add({
      type: 'dataset-done',
      payload: {
        dataset: dataset,
        type: type,
        date: new Date().toISOString()
      }
    })

    current.setCurrent(filePath)
    if (callback) {
      callback()
    }
  })
}
