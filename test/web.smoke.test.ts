import { expect, test } from "vitest";
import { createKTX2WorkerPool, encodeToKTX2 } from "../src/web";

test("browser encodeToKTX2 uses bundled runtime assets by default", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());

  const result = await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: true,
    enableDebug: false,
    qualityLevel: 230,
    generateMipmap: true
  });

  const resultBuffer = await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer());
  expect(result).toEqual(new Uint8Array(resultBuffer));
});

test("browser encodeToKTX2 supports worker option", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());

  const result = await encodeToKTX2(new Uint8Array(buffer), {
    isUASTC: true,
    enableDebug: false,
    qualityLevel: 230,
    generateMipmap: true,
    worker: true
  });

  const resultBuffer = await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer());
  expect(result).toEqual(new Uint8Array(resultBuffer));
});

test("browser worker pool supports batch encodes", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());
  const expected = new Uint8Array(await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer()));
  const pool = createKTX2WorkerPool({ size: 2 });

  try {
    const [first, second] = await pool.encodeMany([
      {
        imageBuffer: new Uint8Array(buffer.slice(0)),
        options: {
          isUASTC: true,
          enableDebug: false,
          qualityLevel: 230,
          generateMipmap: true
        }
      },
      {
        imageBuffer: new Uint8Array(buffer.slice(0)),
        options: {
          isUASTC: true,
          enableDebug: false,
          qualityLevel: 230,
          generateMipmap: true
        }
      }
    ]);

    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
  } finally {
    pool.terminate();
  }
});

test("browser worker pool supports auto size", async () => {
  const pool = createKTX2WorkerPool({ size: "auto" });

  try {
    expect(pool.size).toBeGreaterThanOrEqual(2);
    expect(pool.size).toBeLessThanOrEqual(4);
  } finally {
    pool.terminate();
  }
});
