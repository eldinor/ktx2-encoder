# babylonpress-ktx2-encoder

Lightweight JavaScript utilities for converting images to KTX2 (`.ktx2`) using Basis Universal.

This package is maintained in the `eldinor/ktx2-encoder` fork and builds on the original work by Hu Song.

## Install

```sh
npm install babylonpress-ktx2-encoder
```

## Usage

### Browser

```ts
import { encodeToKTX2 } from "babylonpress-ktx2-encoder";

const png = new Uint8Array(await fetch("/texture.png").then((res) => res.arrayBuffer()));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true
});
```

The browser build now resolves its bundled Basis JS and WASM assets automatically by default.
You can still override `wasmUrl` or `jsUrl` when you need custom hosting.

### Node.js

```ts
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

const png = new Uint8Array(await fs.promises.readFile("./texture.png"));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  imageDecoder
});
```

### glTF-Transform

```ts
import { ktx2 } from "babylonpress-ktx2-encoder/gltf-transform";

await document.transform(
  ktx2({
    isUASTC: true,
    generateMipmap: true
  })
);
```

## Development

```sh
npm run build
npm test
npm run test:gltf
npm run dev
```
