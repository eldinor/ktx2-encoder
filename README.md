# ktx2-encoder

Lightweight JavaScript utilities for converting images to KTX2 (`.ktx2`) using Basis Universal.

## Install

```sh
npm install ktx2-encoder
```

## Usage

### Browser

```ts
import { encodeToKTX2 } from "ktx2-encoder";

const png = new Uint8Array(await fetch("/texture.png").then((res) => res.arrayBuffer()));

const ktx2 = await encodeToKTX2(png, {
  isUASTC: true,
  generateMipmap: true,
  wasmUrl: "/basis_encoder.wasm"
});
```

### Node.js

```ts
import sharp from "sharp";
import { encodeToKTX2 } from "ktx2-encoder";

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
import { ktx2 } from "ktx2-encoder/gltf-transform";

await document.transform(
  ktx2({
    isUASTC: true,
    generateMipmap: true,
    wasmUrl: "/basis_encoder.wasm"
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
