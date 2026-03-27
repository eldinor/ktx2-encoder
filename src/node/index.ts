import { IEncodeOptions } from "../type.js";
import { validateEncodeInput } from "../encoderShared.js";
import { nodeEncoder } from "./NodeBasisEncoder.js";

export function encodeToKTX2(imageBuffer: Uint8Array, options: Partial<IEncodeOptions> = {}): Promise<Uint8Array> {
  validateEncodeInput(imageBuffer, options, "node");
  globalThis.__KTX2_DEBUG__ = options.enableDebug ?? false;
  return nodeEncoder.encode(imageBuffer, options);
}
