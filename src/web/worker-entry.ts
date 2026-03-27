import { encodeToKTX2 } from "./index.js";
import type { IEncodeOptions } from "../type.js";
import type { WorkerEncodeFailure, WorkerEncodeRequest, WorkerEncodeSuccess } from "./workerShared.js";

type WorkerScope = typeof globalThis & {
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const workerScope = self as WorkerScope;

function normalizeWorkerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "Unknown KTX2 worker error";
}

workerScope.addEventListener("message", async (event: MessageEvent<WorkerEncodeRequest>) => {
  try {
    const result = await encodeToKTX2(event.data.imageBuffer, event.data.options as IEncodeOptions);
    const response: WorkerEncodeSuccess = {
      id: event.data.id,
      ok: true,
      result
    };

    workerScope.postMessage(response, [result.buffer as ArrayBuffer]);
  } catch (error) {
    const response: WorkerEncodeFailure = {
      id: event.data.id,
      ok: false,
      error: normalizeWorkerError(error)
    };

    workerScope.postMessage(response);
  }
});
