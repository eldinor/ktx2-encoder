import { expect, test } from "vitest";
import { encodeToKTX2 } from "../src/node";
import { readFile } from "fs/promises";
import { read } from "ktx-parse";
import sharp from "sharp";

async function imageDecoder(buffer: Uint8Array) {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  const { width, height } = metadata;
  const rawBuffer = await image.ensureAlpha().raw().toBuffer();
  const data = new Uint8Array(rawBuffer);

  // 创建 imageData 对象
  const imageData = {
    width: width!,
    height: height!,
    data
  };

  return imageData;
}

test("uastc", { timeout: Infinity }, async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");
  const result = await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: true,
    enableDebug: false,
    qualityLevel: 230,
    generateMipmap: true,
    imageDecoder
  });

  const resultBuffer = await readFile("./public/tests/DuckCM-uastc.ktx2");
  const testArray = Array.from(new Uint8Array(resultBuffer));
  const resultArray = Array.from(result);
  expect(testArray).toEqual(resultArray);
});

test("requires imageDecoder for node LDR input", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");

  await expect(async () => encodeToKTX2(new Uint8Array(buffer), {})).rejects.toThrow(
    "imageDecoder is required in Node.js."
  );
});

test("rejects worker option in node", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      worker: true,
      imageDecoder
    })
  ).rejects.toThrow("worker is only supported in the browser runtime.");
});

test("rejects invalid HDR options", async () => {
  const buffer = await readFile("./public/tests/pretoria_gardens_1k.hdr");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isHDR: true,
      isUASTC: false,
      imageDecoder
    })
  ).rejects.toThrow("HDR encoding requires UASTC output.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isHDR: true,
      imageDecoder
    })
  ).rejects.toThrow('HDR encoding requires "imageType" to be set to "hdr" or "exr".');

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isHDR: true,
      imageType: "raster",
      imageDecoder
    })
  ).rejects.toThrow('HDR raster input is not supported by this wrapper. Use "hdr" or "exr" input.');
});

test("rejects invalid quality ranges", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      qualityLevel: 0,
      imageDecoder
    })
  ).rejects.toThrow("qualityLevel must be an integer between 1 and 255.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      compressionLevel: 7,
      imageDecoder
    })
  ).rejects.toThrow("compressionLevel must be an integer between 0 and 6.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      uastcLDRQualityLevel: 5,
      imageDecoder
    })
  ).rejects.toThrow("uastcLDRQualityLevel must be an integer between 0 and 4.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      rdoQualityLevel: 0,
      imageDecoder
    })
  ).rejects.toThrow("rdoQualityLevel must be a number between 0.001 and 10.");
});

test("rejects invalid option combinations", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isUASTC: false,
      enableRDO: true,
      imageDecoder
    })
  ).rejects.toThrow("enableRDO is only supported with UASTC encoding.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isUASTC: false,
      needSupercompression: true,
      imageDecoder
    })
  ).rejects.toThrow("needSupercompression is only supported with UASTC encoding.");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isNormalMap: true,
      isPerceptual: true,
      imageDecoder
    })
  ).rejects.toThrow("Normal maps cannot be encoded as perceptual textures.");
});

test("rejects invalid HDR quality ranges", async () => {
  const buffer = await readFile("./public/tests/pretoria_gardens_1k.hdr");

  await expect(async () =>
    encodeToKTX2(new Uint8Array(buffer), {
      isHDR: true,
      imageType: "hdr",
      hdrQualityLevel: 5,
      imageDecoder
    })
  ).rejects.toThrow("hdrQualityLevel must be an integer between 0 and 4.");
});

test("rejects cubemap input with invalid face count", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");

  await expect(async () =>
    encodeToKTX2([new Uint8Array(buffer)] as unknown as Parameters<typeof encodeToKTX2>[0], {
      imageDecoder
    })
  ).rejects.toThrow("Cubemap encoding requires exactly 6 input images");
});

test("writes kvData into the generated container", { timeout: Infinity }, async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");
  const result = await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: true,
    generateMipmap: true,
    imageDecoder,
    kvData: {
      KTXwriter: "babylonpress-ktx2-encoder"
    }
  });

  const container = read(result);
  expect(container.keyValue.KTXwriter).toBe("babylonpress-ktx2-encoder");
});

test("supports WebP input in node with a custom decoder", async () => {
  const pngBuffer = await readFile("./public/tests/DuckCM.png");
  const webpBuffer = await sharp(pngBuffer).webp({ lossless: true }).toBuffer();

  const result = await encodeToKTX2(new Uint8Array(webpBuffer), {
    isUASTC: true,
    generateMipmap: true,
    imageDecoder
  });

  const container = read(result);
  expect(result.byteLength).toBeGreaterThan(0);
  expect(container.pixelWidth).toBeGreaterThan(0);
  expect(container.pixelHeight).toBeGreaterThan(0);
});

test("emits progress lifecycle events in node direct mode", async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");
  const events: string[] = [];

  await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: false,
    qualityLevel: 230,
    generateMipmap: true,
    imageDecoder,
    onProgress(event) {
      events.push(event.state);
    }
  });

  expect(events).toEqual(["started", "finished"]);
});

test("etc1s", { timeout: Infinity }, async () => {
  const buffer = await readFile("./public/tests/DuckCM.png");
  const result = await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: false,
    enableDebug: false,
    qualityLevel: 230,
    generateMipmap: true,
    imageDecoder
  });

  const resultBuffer = await readFile("./public/tests/DuckCM-etc1s.ktx2");
  const testArray = Array.from(new Uint8Array(resultBuffer));
  const resultArray = Array.from(result);
  expect(testArray).toEqual(resultArray);
});
