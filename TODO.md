# TODO

- Adaptive pool tuning
  Add an explicit adaptive worker-pool mode, likely `size: "adaptive"`, that calibrates a few pool sizes at startup and picks the best per-texture throughput for the current session.

- Worker and pool cancellation
  Add a cancellable job model for browser workers and worker pools so long-running batch encodes can be aborted cleanly.

- Worker and pool progress events
  Expose lightweight lifecycle/progress signals such as `queued`, `started`, `finished`, `failed`, and `canceled` for batch workflows.

- Deeper browser coverage
  Expand browser tests beyond smoke checks to cover custom `wasmUrl` and `jsUrl`, worker mode, pool mode, invalid inputs, and repeated browser encodes.

- More API examples
  Add focused examples for cubemap encoding, HDR usage, pool batch conversion, and glTF-Transform workflows.

- Benchmark result export
  Let benchmark pages copy or export raw timing results so different machines and pool settings can be compared more easily.
