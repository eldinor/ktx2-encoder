import type { CubeBufferData, IEncodeOptions, IEncodeWorkerClient } from "../type.js";
import {
  getTransferList,
  type WorkerEncodeFailure,
  type WorkerEncodeRequest,
  type WorkerEncodeResponse,
  type WorkerEncodeSuccess
} from "./workerShared.js";

export interface KTX2WorkerClient extends IEncodeWorkerClient {
  encode(
    imageBuffer: Uint8Array | CubeBufferData,
    options: Omit<IEncodeOptions, "imageDecoder" | "worker">
  ): Promise<Uint8Array>;
  terminate(): void;
  readonly worker: Worker;
}

export interface KTX2WorkerOptions extends WorkerOptions {
  workerUrl?: string | URL;
}

const DEFAULT_WORKER_URL = new URL("./worker-entry.js", import.meta.url);

function createWorker(workerUrl: string | URL, options: WorkerOptions): Worker {
  return new Worker(workerUrl, { ...options, type: "module" });
}

export function createKTX2Worker(options: KTX2WorkerOptions = {}): KTX2WorkerClient {
  const worker = createWorker(options.workerUrl ?? DEFAULT_WORKER_URL, options);
  let nextRequestId = 0;
  const pending = new Map<
    number,
    {
      resolve: (result: Uint8Array) => void;
      reject: (error: Error) => void;
    }
  >();

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      request.reject(error);
    }
    pending.clear();
  };

  worker.addEventListener("message", (event: MessageEvent<WorkerEncodeResponse>) => {
    if (!event.data || typeof event.data.id !== "number" || typeof event.data.ok !== "boolean") {
      return;
    }

    const request = pending.get(event.data.id);
    if (!request) {
      return;
    }

    pending.delete(event.data.id);

    if (event.data.ok) {
      request.resolve((event.data as WorkerEncodeSuccess).result);
      return;
    }

    request.reject(new Error((event.data as WorkerEncodeFailure).error));
  });

  worker.addEventListener("error", (event) => {
    rejectPending(event.error instanceof Error ? event.error : new Error(event.message));
  });

  worker.addEventListener("messageerror", () => {
    rejectPending(new Error("KTX2 worker could not deserialize a message."));
  });

  return {
    worker,
    encode(imageBuffer: Uint8Array | CubeBufferData, encodeOptions: Omit<IEncodeOptions, "imageDecoder" | "worker">) {
      const requestId = nextRequestId++;
      const payload: WorkerEncodeRequest = {
        id: requestId,
        imageBuffer,
        options: { ...encodeOptions }
      };

      return new Promise<Uint8Array>((resolve, reject) => {
        pending.set(requestId, { resolve, reject });
        worker.postMessage(payload, getTransferList(imageBuffer));
      });
    },
    terminate() {
      rejectPending(new Error("KTX2 worker terminated."));
      worker.terminate();
    }
  };
}
