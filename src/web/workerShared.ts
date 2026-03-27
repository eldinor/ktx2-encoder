import type { CubeBufferData, IEncodeOptions } from "../type.js";

export type WorkerEncodeInput = Uint8Array | CubeBufferData;

export interface WorkerEncodeRequest {
  id: number;
  imageBuffer: Uint8Array | CubeBufferData;
  options: Omit<IEncodeOptions, "imageDecoder" | "worker">;
}

export interface WorkerEncodeSuccess {
  id: number;
  ok: true;
  result: Uint8Array;
}

export interface WorkerEncodeFailure {
  id: number;
  ok: false;
  error: string;
}

export type WorkerEncodeResponse = WorkerEncodeSuccess | WorkerEncodeFailure;

export function isCubeBufferData(imageBuffer: WorkerEncodeInput): imageBuffer is CubeBufferData {
  return Array.isArray(imageBuffer);
}

export function getTransferList(imageBuffer: WorkerEncodeInput): Transferable[] {
  if (isCubeBufferData(imageBuffer)) {
    return imageBuffer.map((face) => face.buffer);
  }

  return [imageBuffer.buffer];
}
