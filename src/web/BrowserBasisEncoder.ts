import { read, write } from "ktx-parse";
import { CubeBufferData, IEncodeOptions } from "../type.js";
import { applyInputOptions } from "../applyInputOptions.js";
import { BasisTextureType, SourceType } from "../enum.js";
import { loadBrowserBasisModule } from "../basis/loadBasisWeb.js";
import {
  encodeWithGrowingBuffer,
  getHDRSourceType,
  getInitialEncodeBufferSize,
  normalizeError,
  validateEncodeInput
} from "../encoderShared.js";

class BrowserBasisEncoder {
  async init(options?: { jsUrl?: string; wasmUrl?: string }) {
    return loadBrowserBasisModule(options);
  }

  /**
   * encode image data to ktx2 file data
   * @param bufferOrBufferArray - image data, can be a single image or an array of images
   * if it's an array, the images will be encoded as a cube map, the order of the images is:
   *  0: Positive X face
   *  1: Negative X face
   *  2: Positive Y face
   *  3: Negative Y face
   *  4: Positive Z face
   *  5: Negative Z face
   * @param options - encode options, see {@link IEncodeOptions}
   * @returns ktx2 file data
   */
  async encode(
    bufferOrBufferArray: Uint8Array | CubeBufferData,
    options: Partial<IEncodeOptions> = {}
  ): Promise<Uint8Array> {
    validateEncodeInput(bufferOrBufferArray, options, "browser");
    const basisModule = await this.init(options);
    const encoder = new basisModule.BasisEncoder();
    try {
      applyInputOptions(options, encoder);
      const isCube = Array.isArray(bufferOrBufferArray) && bufferOrBufferArray.length === 6;
      encoder.setTexType(
        isCube ? BasisTextureType.cBASISTexTypeCubemapArray : BasisTextureType.cBASISTexType2D
      );

      const bufferArray = Array.isArray(bufferOrBufferArray) ? bufferOrBufferArray : [bufferOrBufferArray];

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

      let actualKTX2FileData = encodeWithGrowingBuffer(
        encoder,
        getInitialEncodeBufferSize(bufferOrBufferArray, options),
        "BrowserBasisEncoder:"
      );
      if (options.kvData) {
        const container = read(actualKTX2FileData);
        for (const key in options.kvData) {
          container.keyValue[key] = options.kvData[key];
        }
        actualKTX2FileData = write(container, { keepWriter: true });
      }
      return actualKTX2FileData;
    } catch (error) {
      throw normalizeError(error);
    } finally {
      encoder.delete();
    }
  }
}

export const browserEncoder = new BrowserBasisEncoder();
