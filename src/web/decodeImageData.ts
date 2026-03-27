function isWebP(imageBuffer: Uint8Array) {
  return (
    imageBuffer.byteLength >= 12 &&
    imageBuffer[0] === 0x52 &&
    imageBuffer[1] === 0x49 &&
    imageBuffer[2] === 0x46 &&
    imageBuffer[3] === 0x46 &&
    imageBuffer[8] === 0x57 &&
    imageBuffer[9] === 0x45 &&
    imageBuffer[10] === 0x42 &&
    imageBuffer[11] === 0x50
  );
}

async function decodeWebPWithCanvas(imageBuffer: Uint8Array) {
  const blob = new Blob([Uint8Array.from(imageBuffer) as BlobPart], { type: "image/webp" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.decoding = "async";

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode WebP image."));
      image.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Failed to create 2D canvas context for WebP decode.");
    }

    context.clearRect(0, 0, image.width, image.height);
    context.drawImage(image, 0, 0);

    return {
      data: new Uint8Array(context.getImageData(0, 0, image.width, image.height).data),
      width: image.width,
      height: image.height
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const decodeImageBitmap = (function () {
  const getGlContext = (function () {
    let gl: WebGL2RenderingContext | null = null;

    return function () {
      if (!gl) {
        const canvas = new OffscreenCanvas(128, 128);
        gl = canvas.getContext("webgl2", { premultipliedAlpha: false });
      }

      return gl as WebGL2RenderingContext;
    };
  })();

  return async function webglDecode(imageBuffer: Uint8Array) {
    if (typeof document !== "undefined" && typeof Image !== "undefined" && isWebP(imageBuffer)) {
      return decodeWebPWithCanvas(imageBuffer);
    }

    const gl = getGlContext();
    const imageBytes = Uint8Array.from(imageBuffer);
    const imageBitmap = await createImageBitmap(new Blob([imageBytes as BlobPart]));
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);

    const framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const width = imageBitmap.width;
    const height = imageBitmap.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.deleteTexture(texture);
    gl.deleteFramebuffer(framebuffer);

    return {
      data: pixels,
      width,
      height
    };
  };
})();
