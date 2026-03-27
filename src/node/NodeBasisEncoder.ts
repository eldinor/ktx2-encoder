import { read, write } from "ktx-parse";
import { SourceType } from "../enum.js";
import { CubeBufferData, IEncodeOptions } from "../type.js";
import { applyInputOptions } from "../applyInputOptions.js";
import { loadNodeBasisModule } from "../basis/loadBasisNode.js";
import {
  encodeWithGrowingBuffer,
  getHDRSourceType,
  getInitialEncodeBufferSize,
  normalizeError,
  validateEncodeInput
} from "../encoderShared.js";

class NodeBasisEncoder {
  async encode(bufferOrBufferArray: Uint8Array | CubeBufferData, options: Partial<IEncodeOptions> = {}) {
    validateEncodeInput(bufferOrBufferArray, options, "node");
    const basis = await loadNodeBasisModule();
    const encoder = new basis.BasisEncoder();
    try {
      const bufferArray = Array.isArray(bufferOrBufferArray) ? bufferOrBufferArray : [bufferOrBufferArray];
      applyInputOptions(options, encoder);

      for (let i = 0; i < bufferArray.length; i++) {
        const buffer = bufferArray[i];
        if (options.isHDR) {
          encoder.setSliceSourceImageHDR(i, buffer, 0, 0, getHDRSourceType(options), true);
        } else {
          const imageData = await options.imageDecoder!(buffer);
          encoder.setSliceSourceImage(
            i,
            new Uint8Array(imageData.data),
            imageData.width,
            imageData.height,
            SourceType.RAW
          );
        }
      }

      let result = encodeWithGrowingBuffer(
        encoder,
        getInitialEncodeBufferSize(bufferOrBufferArray, options),
        "NodeBasisEncoder:"
      );

      if (options.kvData) {
        const container = read(result);
        for (const key in options.kvData) {
          container.keyValue[key] = options.kvData[key];
        }
        result = write(container, { keepWriter: true });
      }

      return Buffer.from(result);
    } catch (error) {
      throw normalizeError(error);
    } finally {
      encoder.delete();
    }
  }
}

export const nodeEncoder = new NodeBasisEncoder();
