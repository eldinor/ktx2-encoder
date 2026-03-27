# API

## Main export

The package exports different runtime implementations under the same main entry:

- browser import resolves to the web build
- Node.js import resolves to the Node build

## `encodeToKTX2`

### Browser

```ts
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
```

```ts
encodeToKTX2(
  imageBuffer: Uint8Array | CubeBufferData,
  options: IEncodeOptions
): Promise<Uint8Array>
```

Behavior:

- encodes a single texture or cubemap to KTX2
- uses the built-in browser decoder by default
- supports worker and pool-backed encoding through `options.worker`

Common options:

- `isUASTC?: boolean`
- `generateMipmap?: boolean`
- `qualityLevel?: number`
- `compressionLevel?: number`
- `enableRDO?: boolean`
- `uastcLDRQualityLevel?: number`
- `needSupercompression?: boolean`
- `isNormalMap?: boolean`
- `isPerceptual?: boolean`
- `kvData?: Record<string, string | Uint8Array>`
- `jsUrl?: string`
- `wasmUrl?: string`
- `worker?: boolean | IEncodeWorkerClient`

Worker behavior:

- `worker: true`
  uses the package default shared worker
- `worker: createKTX2Worker()`
  uses a dedicated worker client
- `worker: createKTX2WorkerPool(...)`
  uses a pool client

Notes:

- worker mode does not support a custom `imageDecoder`
- cubemaps require exactly 6 faces

### Node.js

```ts
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";
```

```ts
encodeToKTX2(
  imageBuffer: Uint8Array,
  options?: Partial<IEncodeOptions>
): Promise<Uint8Array>
```

Node-specific note:

- LDR input requires `imageDecoder`
- `worker` is not supported in Node.js

## `createKTX2Worker`

```ts
import { createKTX2Worker } from "babylonpress-ktx2-encoder";
```

```ts
const worker = createKTX2Worker(options?)
```

Returns a client with:

- `encode(imageBuffer, options): Promise<Uint8Array>`
- `terminate(): void`
- `worker: Worker`

Use this when you want explicit control over a single browser worker instance.

## `createKTX2WorkerPool`

```ts
import { createKTX2WorkerPool } from "babylonpress-ktx2-encoder";
```

```ts
const pool = createKTX2WorkerPool({
  size?: number | "auto"
})
```

Options:

- `size`
  omitted defaults to `2`
- numeric values like `1`, `2`, `4`
- `"auto"`
  uses a conservative `navigator.hardwareConcurrency` heuristic capped between `2` and `4`

Returns a pool client with:

- `size: number`
- `workers: readonly Worker[]`
- `encode(imageBuffer, options): Promise<Uint8Array>`
- `encodeMany(jobs): Promise<Uint8Array[]>`
- `terminate(): void`

Use this for batch conversion and worker reuse.

## `ktx2` glTF-Transform export

```ts
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";
```

Use it as a glTF-Transform function for converting texture images to KTX2 during document transforms.

## Important constraints

- browser worker mode is for responsiveness and batching
- single worker mode is usually not much faster than direct encode for one texture
- worker pools improve batch throughput, especially with tuned pool sizes
- Node.js uses the Node encoder path and requires an image decoder for LDR input
