# babylonpress-ktx2-encoder

KTX2 (`.ktx2`) encoding utilities for browser and Node.js applications, built on Basis Universal.

This package is maintained in the `eldinor/ktx2-encoder` fork and builds on the original work by Hu Song.

## Install

```sh
npm install babylonpress-ktx2-encoder
```

## What It Supports

- browser encoding
- browser worker encoding
- browser worker pool encoding for batch jobs
- Node.js encoding
- glTF-Transform integration

## Browser

### Direct encode

```ts
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";

const png = new Uint8Array(await fetch("/texture.png").then((res) => res.arrayBuffer()));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true
});
```

By default, the browser build resolves its bundled Basis JS and WASM assets automatically.

### Single worker

Use `worker: true` when you want background encoding without changing the main API:

```ts
const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  worker: true
});
```

This is mainly about keeping the UI responsive. It usually does not make a single encode much faster.

### Worker pool

Use a pool for batch conversion:

```ts
import { createKTX2WorkerPool, encodeToKTX2 } from "babylonpress-ktx2-encoder";

const pool = createKTX2WorkerPool({ size: 4 });

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  worker: pool
});

const results = await pool.encodeMany([
  {
    imageBuffer: textureA,
    options: { isUASTC: true, generateMipmap: true }
  },
  {
    imageBuffer: textureB,
    options: { isUASTC: true, generateMipmap: true }
  }
]);

pool.terminate();
```

Pool size can be:

- omitted, which defaults to `2`
- a number like `1`, `2`, `4`
- `"auto"`, which uses a conservative `hardwareConcurrency` heuristic

```ts
const pool = createKTX2WorkerPool({ size: "auto" });
```

### Browser notes

- `worker: true` uses a shared default worker client
- worker encoding does not support a custom `imageDecoder` function
- `wasmUrl` and `jsUrl` can still be overridden when custom hosting is needed

## Node.js

Node requires an `imageDecoder` for LDR inputs.

```ts
import fs from "node:fs/promises";
import sharp from "sharp";
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";

async function imageDecoder(buffer: Uint8Array) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const rawBuffer = await image.ensureAlpha().raw().toBuffer();

  return {
    width: metadata.width!,
    height: metadata.height!,
    data: new Uint8Array(rawBuffer)
  };
}

const png = new Uint8Array(await fs.readFile("./texture.png"));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  imageDecoder
});
```

## glTF-Transform

```ts
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";

await document.transform(
  ktx2({
    isUASTC: true,
    generateMipmap: true
  })
);
```

## Benchmark

A local benchmark page is included for comparing:

- main-thread encode
- single worker encode
- worker pool batch encode

Run it with:

```sh
npm run benchmark
```

The page is served from `/benchmark/`.

## API

See [API.md](./API.md) for a focused API reference.

## Development

```sh
npm run build
npm test
npm run test:web
npm run test:gltf
npm run test:gltf:web
npm run test:coverage
npm run dev
```
