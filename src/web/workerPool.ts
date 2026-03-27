import type { CubeBufferData, IEncodeOptions, IEncodeWorkerClient } from "../type.js";
import { createKTX2Worker, type KTX2WorkerClient, type KTX2WorkerOptions } from "./worker.js";

export interface KTX2WorkerPoolOptions extends KTX2WorkerOptions {
  size?: number | "auto";
}

export interface KTX2WorkerPoolJob {
  imageBuffer: Uint8Array | CubeBufferData;
  options: Omit<IEncodeOptions, "imageDecoder" | "worker">;
}

export interface KTX2WorkerPool extends IEncodeWorkerClient {
  readonly size: number;
  readonly workers: readonly Worker[];
  encode(
    imageBuffer: Uint8Array | CubeBufferData,
    options: Omit<IEncodeOptions, "imageDecoder" | "worker">
  ): Promise<Uint8Array>;
  encodeMany(jobs: readonly KTX2WorkerPoolJob[]): Promise<Uint8Array[]>;
  terminate(): void;
}

interface QueueEntry {
  imageBuffer: Uint8Array | CubeBufferData;
  options: Omit<IEncodeOptions, "imageDecoder" | "worker">;
  resolve: (result: Uint8Array) => void;
  reject: (error: Error) => void;
}

interface PoolSlot {
  client: KTX2WorkerClient;
  busy: boolean;
}

const DEFAULT_POOL_SIZE = 2;
const MAX_AUTO_POOL_SIZE = 4;

function resolveAutoPoolSize() {
  const hardwareConcurrency =
    typeof navigator === "object" && typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : DEFAULT_POOL_SIZE * 2;

  return Math.min(MAX_AUTO_POOL_SIZE, Math.max(DEFAULT_POOL_SIZE, Math.floor(hardwareConcurrency / 2)));
}

function normalizePoolSize(size: number | "auto" | undefined) {
  if (size === undefined) {
    return DEFAULT_POOL_SIZE;
  }

  if (size === "auto") {
    return resolveAutoPoolSize();
  }

  if (!Number.isInteger(size) || size < 1) {
    throw new Error("KTX2 worker pool size must be an integer greater than or equal to 1.");
  }

  return size;
}

export function createKTX2WorkerPool(options: KTX2WorkerPoolOptions = {}): KTX2WorkerPool {
  const size = normalizePoolSize(options.size);
  const slots: PoolSlot[] = Array.from({ length: size }, () => ({
    client: createKTX2Worker(options),
    busy: false
  }));
  const queue: QueueEntry[] = [];
  let terminated = false;

  const rejectQueued = (error: Error) => {
    while (queue.length > 0) {
      queue.shift()!.reject(error);
    }
  };

  const runNext = () => {
    if (terminated || queue.length === 0) {
      return;
    }

    const freeSlot = slots.find((slot) => !slot.busy);
    if (!freeSlot) {
      return;
    }

    const job = queue.shift()!;
    freeSlot.busy = true;

    void freeSlot.client
      .encode(job.imageBuffer, job.options)
      .then(job.resolve, job.reject)
      .finally(() => {
        freeSlot.busy = false;
        runNext();
      });
  };

  const encode = (
    imageBuffer: Uint8Array | CubeBufferData,
    encodeOptions: Omit<IEncodeOptions, "imageDecoder" | "worker">
  ) => {
    if (terminated) {
      return Promise.reject(new Error("KTX2 worker pool terminated."));
    }

    return new Promise<Uint8Array>((resolve, reject) => {
      queue.push({
        imageBuffer,
        options: encodeOptions,
        resolve,
        reject
      });
      runNext();
    });
  };

  return {
    size,
    workers: slots.map((slot) => slot.client.worker),
    encode,
    encodeMany(jobs: readonly KTX2WorkerPoolJob[]) {
      return Promise.all(jobs.map((job) => encode(job.imageBuffer, job.options)));
    },
    terminate() {
      if (terminated) {
        return;
      }

      terminated = true;
      rejectQueued(new Error("KTX2 worker pool terminated."));
      for (const slot of slots) {
        slot.client.terminate();
      }
    }
  };
}
