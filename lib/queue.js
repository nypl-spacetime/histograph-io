var redis = require('redis')
var config = require('histograph-config')
var client = redis.createClient(config.redis.port, config.redis.host)
var coreQueue = config.redis.queue

// ensure we don't grow redis queue too much
// will only call `callback` when queue size < config.redis.maxQueueSize
function waitDone (pollDelayMs, callback) {
  setTimeout(function () {
    // get the queue size from redis
    client.llen(coreQueue, function (err, queueSize) {
      if (err) {
        callback(err)
        return
      }

      // there is space, report done right away
      if (queueSize < config.redis.maxQueueSize) {
        callback(queueSize)
      } else {
        // try again in due time
        waitDone(pollDelayMs, callback)
      }
    })
  }, pollDelayMs)
}

// done callback is called when queue is empty enough
module.exports.add = function (message, callback) {
  // push it onto the queue, but wait with callback until there is space
  client.lpush(coreQueue, JSON.stringify(message), function (err, queueSize) {
    // no callback, no bother
    if (!callback) {
      return
    }

    if (err) {
      callback(err)
      return
    }

    // check again in 3 seconds, and keep checking, until queue has space
    if (queueSize >= config.redis.maxQueueSize) {
      waitDone(3000, callback)
    } else {
      callback(null, queueSize)
    }
  })
}
