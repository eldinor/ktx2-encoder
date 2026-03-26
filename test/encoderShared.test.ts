import { expect, test } from "vitest";
import { HDRSourceType } from "../src/enum";
import {
  encodeWithGrowingBuffer,
  getHDRSourceType,
  getInitialEncodeBufferSize,
  normalizeError,
  validateEncodeInput
} from "../src/encoderShared";
import type { IBasisEncoder } from "../src/type";

test("normalizeError preserves Error instances and converts other values", () => {
  const error = new Error("boom");
  expect(normalizeError(error)).toBe(error);
  expect(normalizeError("boom").message).toBe("boom");
  expect(normalizeError({}).message).toBe("Unknown error");
});

test("getHDRSourceType maps hdr and exr inputs", () => {
  expect(getHDRSourceType({ isHDR: true, imageType: "hdr" })).toBe(HDRSourceType.HDR);
  expect(getHDRSourceType({ isHDR: true, imageType: "exr" })).toBe(HDRSourceType.EXR);
});

test("getInitialEncodeBufferSize scales with input size and slice count", () => {
  const single = getInitialEncodeBufferSize(new Uint8Array(1024), { isHDR: false });
  const cube = getInitialEncodeBufferSize(
    [
      new Uint8Array(1024),
      new Uint8Array(1024),
      new Uint8Array(1024),
      new Uint8Array(1024),
      new Uint8Array(1024),
      new Uint8Array(1024)
    ],
    { isHDR: false }
  );

  expect(single).toBeGreaterThanOrEqual(10 * 1024 * 1024);
  expect(cube).toBeGreaterThan(single);
});

test("validateEncodeInput accepts valid browser and node inputs", () => {
  expect(() =>
    validateEncodeInput(new Uint8Array([1, 2, 3]), { isUASTC: true }, "browser")
  ).not.toThrow();

  expect(() =>
    validateEncodeInput(new Uint8Array([1, 2, 3]), { imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array(4) }) }, "node")
  ).not.toThrow();
});

test("encodeWithGrowingBuffer retries until a buffer is large enough", () => {
  let attempts = 0;
  const encoder = {
    encode(output: Uint8Array) {
      attempts += 1;
      if (output.length < 8) {
        return 0;
      }

      output.set([1, 2, 3, 4], 0);
      return 4;
    }
  } as IBasisEncoder;

  const result = encodeWithGrowingBuffer(encoder, 4, "test:");
  expect(attempts).toBe(2);
  expect(Array.from(result)).toEqual([1, 2, 3, 4]);
});

test("encodeWithGrowingBuffer throws after exhausting the maximum buffer", () => {
  const encoder = {
    encode() {
      return 0;
    }
  } as IBasisEncoder;

  expect(() => encodeWithGrowingBuffer(encoder, 512 * 1024 * 1024, "test:")).toThrow(
    "test: Encode failed after exhausting the output buffer."
  );
});
