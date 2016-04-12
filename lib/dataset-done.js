var H = require('highland')
var config = require('spacetime-config')
var Redis = require('redis')
var redisClient = Redis.createClient(config.redis.port, config.redis.host)
var db = require('./db')

function pop() {
  redisClient.rpop(`${config.redis.queue}-dataset-done`, function(err, data) {
    if (err) {
      console.error(err.message)
      return
    }
    if (data) {
      try {
        data = JSON.parse(data)
        db.getDataset(data.dataset, function (err, dataset, meta) {
          var dateUpdated = {}
          dateUpdated[data.type] = data.date
          dateUpdated = Object.assign(meta.dateUpdated || {}, dateUpdated)
          db.createDataset(dataset, meta)
        })
      } catch (err) {
        console.error(err)
      }
    }
  })
}

setInterval(pop, 1000)
