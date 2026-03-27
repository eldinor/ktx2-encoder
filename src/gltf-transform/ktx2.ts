import { Document, Texture, Transform } from "@gltf-transform/core";
import { KHRTextureBasisu } from "@gltf-transform/extensions";
import { normalizeError } from "../encoderShared.js";
import { IEncodeOptions } from "../type.js";

const NAME = "ktx2";
const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

function listTextureSlots(texture: Texture): string[] {
  const document = Document.fromGraph(texture.getGraph())!;
  const root = document.getRoot();
  const slots = texture
    .getGraph()
    .listParentEdges(texture)
    .filter((edge) => edge.getParent() !== root)
    .map((edge) => edge.getName());
  return Array.from(new Set(slots));
}

function createTransform(name: string, fn: Transform): Transform {
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

function testPattern(pattern: RegExp, value: string | null): boolean {
  if (!value) {
    return false;
  }

  pattern.lastIndex = 0;
  return pattern.test(value);
}

export type KTX2Options = IEncodeOptions & {
  /** Pattern identifying textures to compress, matched to name or URI */
  pattern?: RegExp | null;
  /** Pattern matching the material texture slots to be compressed */
  slots?: RegExp | null;
};

/**
 * Transforms compatible textures in a glTF asset to KTX2 format.
 * @param options KTX2 compression options
 * @returns Transform
 */
export function ktx2(options: Partial<KTX2Options> = {}): Transform {
  const patternRe = options.pattern;
  const slotsRe = options.slots;

  return createTransform(NAME, async (document: Document): Promise<void> => {
    const { encodeToKTX2 } =
      typeof window !== "undefined" ? await import("../web/index.js") : await import("../node/index.js");

    const logger = document.getLogger();
    const textures = document.getRoot().listTextures();

    let isKHRTextureBasisu = false;

    await Promise.all(
      textures.map(async (texture, textureIndex) => {
        const textureLabel = texture.getURI() || texture.getName() || `${textureIndex + 1}/${textures.length}`;
        const prefix = `${NAME}(${textureLabel})`;
        const slots = listTextureSlots(texture);

        if (texture.getMimeType() === "image/ktx2") {
          logger.debug(`${prefix}: Skipping, already KTX2`);
          return;
        }

        if (!SUPPORTED_MIME_TYPES.includes(texture.getMimeType())) {
          logger.debug(`${prefix}: Skipping, unsupported texture type "${texture.getMimeType()}"`);
          return;
        }

        if (patternRe && !testPattern(patternRe, texture.getName()) && !testPattern(patternRe, texture.getURI())) {
          logger.debug(`${prefix}: Skipping, excluded by "pattern" parameter`);
          return;
        }

        if (slotsRe && slots.length && !slots.some((slot) => testPattern(slotsRe, slot))) {
          logger.debug(`${prefix}: Skipping, [${slots.join(", ")}] excluded by "slots" parameter`);
          return;
        }

        try {
          const image = texture.getImage();
          if (!image) {
            logger.warn(`${prefix}: Skipping, no image data`);
            return;
          }

          const srcByteLength = image.byteLength;
          const ktx2Data = await encodeToKTX2(image, { ...options });

          texture.setImage(ktx2Data);
          texture.setMimeType("image/ktx2");

          isKHRTextureBasisu = true;

          const dstByteLength = ktx2Data.byteLength;
          logger.debug(`${prefix}: Size = ${srcByteLength} -> ${dstByteLength} bytes`);
        } catch (error) {
          logger.warn(`${prefix}: Failed to convert texture: ${normalizeError(error).message}`);
        }
      })
    );

    logger.debug(`${NAME}: Complete.`);

    if (isKHRTextureBasisu) {
      document.createExtension(KHRTextureBasisu).setRequired(true);
    }
  });
}
