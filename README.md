# Histograph IO

Express routing middleware for [Histograph API](https://github.com/histograph/api). IO is automatically loaded by the API. Alternatively, you can start a standalone version by running `server.js`.

With Histograph IO, you can:

- import [Newline delimited JSON](http://ndjson.org/) files into [Histograph](http://histograph.io),
- add/update/view datasets & metadata.

## Queue format

IO adds dataset, PIT and relation changes onto Histograph's Redis queue.

IO uses the adds messages of the following form, as stringified JSON objects:

```js
{
  "type": "dataset|pit|relation",
  "action": "create|update|delete",
  "payload": {
    // dataset/PIT/relation data
  },
  "meta": {
    // message metadata
  }
}
```

The `payload` field contains dataset, PIT or relation data, conforming to the [Histograph JSON schemas](https://github.com/histograph/schemas/tree/master/json).

Copyright (C) 2015 [Waag Society](http://waag.org).
