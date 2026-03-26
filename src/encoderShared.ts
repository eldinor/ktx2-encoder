import { HDRSourceType } from "./enum.js";
import { CubeBufferData, IBasisEncoder, IEncodeOptions } from "./type.js";

const MB = 1024 * 1024;
const MAX_ENCODE_BUFFER_SIZE = 512 * MB;
type HDRImageType = "hdr" | "exr" | "raster";

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : "Unknown error");
}

export function validateEncodeInput(
  bufferOrBufferArray: Uint8Array | CubeBufferData,
  options: Partial<IEncodeOptions>,
  environment: "browser" | "node"
) {
  if (Array.isArray(bufferOrBufferArray) && bufferOrBufferArray.length !== 6) {
    const faceCount = (bufferOrBufferArray as Uint8Array[]).length;
    throw new Error(`Cubemap encoding requires exactly 6 input images, received ${faceCount}.`);
  }

  if (options.isHDR) {
    if (options.isUASTC === false) {
      throw new Error("HDR encoding requires UASTC output.");
    }

    const imageType = (options as { imageType?: HDRImageType }).imageType;

    if (!imageType) {
      throw new Error('HDR encoding requires "imageType" to be set to "hdr" or "exr".');
    }

    if (imageType === "raster") {
      throw new Error('HDR raster input is not supported by this wrapper. Use "hdr" or "exr" input.');
    }
  }

  if (environment === "node" && !options.isHDR && !options.imageDecoder) {
    throw new Error("imageDecoder is required in Node.js.");
  }
}

export function getHDRSourceType(options: Partial<IEncodeOptions>): HDRSourceType {
  return (options as { imageType?: HDRImageType }).imageType === "hdr" ? HDRSourceType.HDR : HDRSourceType.EXR;
}

export function getInitialEncodeBufferSize(
  bufferOrBufferArray: Uint8Array | CubeBufferData,
  options: Partial<IEncodeOptions>
) {
  const buffers = Array.isArray(bufferOrBufferArray) ? bufferOrBufferArray : [bufferOrBufferArray];
  const totalInputBytes = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const perSliceBaseSize = options.isHDR ? 24 * MB : 10 * MB;
  const growthTarget = Math.max(totalInputBytes * 4, perSliceBaseSize * buffers.length);
  return Math.min(Math.max(perSliceBaseSize, growthTarget), MAX_ENCODE_BUFFER_SIZE);
}

export function encodeWithGrowingBuffer(
  encoder: IBasisEncoder,
  initialSize: number,
  failureContext: string
): Uint8Array {
  let bufferSize = initialSize;

  while (bufferSize <= MAX_ENCODE_BUFFER_SIZE) {
    const output = new Uint8Array(bufferSize);
    const resultSize = encoder.encode(output);
    if (resultSize > 0) {
      return output.subarray(0, resultSize);
    }

    if (bufferSize === MAX_ENCODE_BUFFER_SIZE) {
      break;
    }

    bufferSize = Math.min(bufferSize * 2, MAX_ENCODE_BUFFER_SIZE);
  }

  throw new Error(`${failureContext} Encode failed after exhausting the output buffer.`);
}
