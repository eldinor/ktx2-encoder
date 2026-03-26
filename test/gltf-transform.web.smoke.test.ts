import { Document } from "@gltf-transform/core";
import { expect, test } from "vitest";
import { ktx2 } from "../src/gltf-transform";

test("browser gltf-transform path converts PNG textures", async () => {
  const document = new Document();
  const imageBuffer = await fetch("/tests/DuckCM.png").then((res) => res.arrayBuffer());

  const texture = document.createTexture("test")
    .setImage(new Uint8Array(imageBuffer))
    .setMimeType("image/png");

  await document.transform(
    ktx2({
      isUASTC: true,
      enableDebug: false,
      qualityLevel: 230,
      generateMipmap: true
    })
  );

  expect(texture.getMimeType()).toBe("image/ktx2");

  const expected = await fetch("/tests/DuckCM-uastc.ktx2").then((res) => res.arrayBuffer());
  expect(texture.getImage()).toEqual(new Uint8Array(expected));
});
