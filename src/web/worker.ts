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
  let nextRequestId = 0;
  const pending = new Map<
    number,
    {
      resolve: (result: Uint8Array) => void;
      reject: (error: Error) => void;
      cleanupAbort?: () => void;
    }
  >();
  let worker = createWorker(options.workerUrl ?? DEFAULT_WORKER_URL, options);

  const rejectPending = (error: Error) => {
    for (const request of pending.values()) {
      request.cleanupAbort?.();
      request.reject(error);
    }
    pending.clear();
  };

  const attachWorkerListeners = (target: Worker) => {
    target.addEventListener("message", (event: MessageEvent<WorkerEncodeResponse>) => {
      if (!event.data || typeof event.data.id !== "number" || typeof event.data.ok !== "boolean") {
        return;
      }

      const request = pending.get(event.data.id);
      if (!request) {
        return;
      }

      pending.delete(event.data.id);
      request.cleanupAbort?.();

      if (event.data.ok) {
        request.resolve((event.data as WorkerEncodeSuccess).result);
        return;
      }

      request.reject(new Error((event.data as WorkerEncodeFailure).error));
    });

    target.addEventListener("error", (event) => {
      if (target !== worker) {
        return;
      }

      rejectPending(event.error instanceof Error ? event.error : new Error(event.message));
    });

    target.addEventListener("messageerror", () => {
      if (target !== worker) {
        return;
      }

      rejectPending(new Error("KTX2 worker could not deserialize a message."));
    });
  };

  const restartWorker = (error: Error) => {
    const previousWorker = worker;
    worker = createWorker(options.workerUrl ?? DEFAULT_WORKER_URL, options);
    attachWorkerListeners(worker);
    previousWorker.terminate();
    rejectPending(error);
  };

  attachWorkerListeners(worker);

  return {
    get worker() {
      return worker;
    },
    encode(imageBuffer: Uint8Array | CubeBufferData, encodeOptions: Omit<IEncodeOptions, "imageDecoder" | "worker">) {
      if (encodeOptions.signal?.aborted) {
        encodeOptions.onProgress?.({ state: "canceled" });
        return Promise.reject(new DOMException("The encode operation was aborted.", "AbortError"));
      }

      const requestId = nextRequestId++;
      const { signal, onProgress, ...requestOptions } = encodeOptions;
      const payload: WorkerEncodeRequest = {
        id: requestId,
        imageBuffer,
        options: { ...requestOptions }
      };

      return new Promise<Uint8Array>((resolve, reject) => {
        const abort = () => {
          if (!pending.has(requestId)) {
            return;
          }

          onProgress?.({ state: "canceled" });
          restartWorker(new DOMException("The encode operation was aborted.", "AbortError"));
        };

        const cleanupAbort = signal
          ? () => signal.removeEventListener("abort", abort)
          : undefined;

        pending.set(requestId, {
          resolve: (result) => {
            onProgress?.({ state: "finished" });
            resolve(result);
          },
          reject: (error) => {
            if (error.name !== "AbortError") {
              onProgress?.({ state: "failed" });
            }
            reject(error);
          },
          cleanupAbort
        });
        if (signal) {
          signal.addEventListener("abort", abort, { once: true });
        }
        onProgress?.({ state: "started" });
        worker.postMessage(payload, getTransferList(imageBuffer));
      });
    },
    terminate() {
      rejectPending(new Error("KTX2 worker terminated."));
      worker.terminate();
    }
  };
}
