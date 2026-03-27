import { CubeBufferData, IEncodeOptions, IEncodeWorkerClient } from "../type.js";
import { validateEncodeInput } from "../encoderShared.js";
import { browserEncoder } from "./BrowserBasisEncoder.js";
import { decodeImageBitmap } from "./decodeImageData.js";
import { createKTX2Worker } from "./worker.js";
import { createKTX2WorkerPool } from "./workerPool.js";
export { createKTX2Worker } from "./worker.js";
export { createKTX2WorkerPool } from "./workerPool.js";

export * from "../enum.js";
export * from "../type.js";

let defaultWorkerClient: IEncodeWorkerClient | null = null;

function getDefaultWorkerClient(): IEncodeWorkerClient {
  if (!defaultWorkerClient) {
    defaultWorkerClient = createKTX2Worker();
  }

  return defaultWorkerClient;
}

export function encodeToKTX2(imageBuffer: Uint8Array | CubeBufferData, options: IEncodeOptions): Promise<Uint8Array> {
  validateEncodeInput(imageBuffer, options, "browser");
  if (options.worker) {
    if (options.imageDecoder) {
      return Promise.reject(new Error("worker encoding does not support custom imageDecoder functions."));
    }

    const workerClient = options.worker === true ? getDefaultWorkerClient() : options.worker;
    const { worker, imageDecoder, ...workerOptions } = options;
    return workerClient.encode(imageBuffer, workerOptions);
  }

  options.imageDecoder ??= decodeImageBitmap;
  globalThis.__KTX2_DEBUG__ = options.enableDebug ?? false;
  options.onProgress?.({ state: "started" });
  return browserEncoder.encode(imageBuffer, options).then(
    (result) => {
      options.onProgress?.({ state: "finished" });
      return result;
    },
    (error) => {
      options.onProgress?.({ state: options.signal?.aborted ? "canceled" : "failed" });
      throw error;
    }
  );
}
