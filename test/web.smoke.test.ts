import { expect, test } from "vitest";
import { read } from "ktx-parse";
import { createKTX2Worker, createKTX2WorkerPool, encodeToKTX2 } from "../src/web";
import { decodeImageBitmap } from "../src/web/decodeImageData";

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

test("browser worker pool emits queued and started lifecycle events", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());
  const pool = createKTX2WorkerPool({ size: 1 });
  const events: string[] = [];

  try {
    await pool.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true,
      onProgress(event) {
        events.push(event.state);
      }
    });

    expect(events).toEqual(["queued", "started", "finished"]);
  } finally {
    pool.terminate();
  }
});

test("browser image decoder handles uploaded non-power-of-two images", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 3;
  canvas.height = 5;
  const context = canvas.getContext("2d");
  expect(context).toBeTruthy();

  context!.fillStyle = "#000000";
  context!.fillRect(0, 0, canvas.width, canvas.height);
  context!.fillStyle = "#ff3b30";
  context!.fillRect(0, 0, 1, 1);
  context!.fillStyle = "#34c759";
  context!.fillRect(2, 4, 1, 1);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }

      reject(new Error("Failed to create PNG test blob."));
    }, "image/png");
  });

  const decoded = await decodeImageBitmap(new Uint8Array(await blob.arrayBuffer()));

  expect(decoded.width).toBe(3);
  expect(decoded.height).toBe(5);
  expect(Array.from(decoded.data.slice(0, 4))).toEqual([255, 59, 48, 255]);

  const lastPixelIndex = (decoded.width * decoded.height - 1) * 4;
  expect(Array.from(decoded.data.slice(lastPixelIndex, lastPixelIndex + 4))).toEqual([52, 199, 89, 255]);
});

test("browser encodeToKTX2 supports WebP input", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 4;
  const context = canvas.getContext("2d");
  expect(context).toBeTruthy();

  context!.fillStyle = "#1f5aa6";
  context!.fillRect(0, 0, 4, 4);
  context!.fillStyle = "#f4b400";
  context!.fillRect(1, 1, 2, 2);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) {
        resolve(value);
        return;
      }

      reject(new Error("Failed to create WebP test blob."));
    }, "image/webp", 1);
  });

  const webpBytes = new Uint8Array(await blob.arrayBuffer());
  const decoded = await decodeImageBitmap(webpBytes);
  expect(decoded.width).toBe(4);
  expect(decoded.height).toBe(4);
  expect(Array.from(decoded.data.slice(0, 4))).not.toEqual([0, 0, 0, 255]);

  const result = await encodeToKTX2(webpBytes, {
    isUASTC: true,
    enableDebug: false,
    qualityLevel: 230,
    generateMipmap: true
  });

  const container = read(result);
  expect(result.byteLength).toBeGreaterThan(0);
  expect(container.pixelWidth).toBe(4);
  expect(container.pixelHeight).toBe(4);
});

test("browser worker encode supports AbortSignal cancellation", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());
  const worker = createKTX2Worker();
  const controller = new AbortController();

  try {
    const promise = worker.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true,
      signal: controller.signal
    });

    controller.abort();

    await expect(promise).rejects.toMatchObject({
      name: "AbortError"
    });

    const expected = new Uint8Array(await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer()));
    const nextResult = await worker.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true
    });

    expect(nextResult).toEqual(expected);
  } finally {
    worker.terminate();
  }
});

test("browser worker pool cancels queued jobs with AbortSignal", async () => {
  const buffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());
  const expected = new Uint8Array(await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer()));
  const pool = createKTX2WorkerPool({ size: 1 });
  const queuedController = new AbortController();

  try {
    const firstJob = pool.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true
    });

    const queuedJob = pool.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true,
      signal: queuedController.signal
    });

    queuedController.abort();

    await expect(queuedJob).rejects.toMatchObject({
      name: "AbortError"
    });

    const firstResult = await firstJob;
    expect(firstResult).toEqual(expected);

    const nextResult = await pool.encode(new Uint8Array(buffer.slice(0)), {
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true
    });
    expect(nextResult).toEqual(expected);
  } finally {
    pool.terminate();
  }
});
