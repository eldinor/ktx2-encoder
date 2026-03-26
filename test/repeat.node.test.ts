import { readFile } from "fs/promises";
import { read } from "ktx-parse";
import sharp from "sharp";
import { expect, test } from "vitest";
import { encodeToKTX2 } from "../src/node";

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

test("supports repeated encodes with different options", { timeout: Infinity }, async () => {
  const buffer = new Uint8Array(await readFile("./public/tests/DuckCM.png"));

  const uastc = await encodeToKTX2(buffer, {
    isUASTC: true,
    generateMipmap: true,
    imageDecoder
  });

  const etc1s = await encodeToKTX2(buffer, {
    isUASTC: false,
    generateMipmap: true,
    imageDecoder
  });

  expect(uastc).not.toEqual(etc1s);
});

test("does not leak kvData between consecutive encodes", { timeout: Infinity }, async () => {
  const buffer = new Uint8Array(await readFile("./public/tests/DuckCM.png"));

  const withMetadata = await encodeToKTX2(buffer, {
    isUASTC: true,
    imageDecoder,
    kvData: { KTXwriter: "first-pass" }
  });

  const withoutMetadata = await encodeToKTX2(buffer, {
    isUASTC: true,
    imageDecoder
  });

  expect(read(withMetadata).keyValue.KTXwriter).toBe("first-pass");
  expect(read(withoutMetadata).keyValue.KTXwriter).not.toBe("first-pass");
});
