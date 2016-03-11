function createMessage (type, action, payload, meta) {
  var message = {
    type: type,
    action: action,
    payload: payload
  }

  if (meta) {
    message.meta = meta
  }

  return message
}

module.exports.createDataset = function (dataset, owner) {
  return createMessage('dataset', 'create', dataset, {owner: owner})
}

module.exports.deleteDataset = function (datasetId) {
  return createMessage('dataset', 'delete', {id: datasetId})
}

module.exports.updateDataset = function (dataset) {
  return createMessage('dataset', 'update', dataset)
}
