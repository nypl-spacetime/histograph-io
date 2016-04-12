var schemas = require('spacetime-schemas')
var validator = require('is-my-json-valid')

function createValidator (schema) {
  return validator(schema, {
    verbose: true
  })
}

module.exports = {
  dataset: createValidator(schemas.dataset),
  pits: createValidator(schemas.pits),
  relations: createValidator(schemas.relations)
}
