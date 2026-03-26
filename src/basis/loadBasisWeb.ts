import type { IBasisModule } from "../type.js";
import BASIS from "./basis_encoder.js";

const modulePromises = new Map<string, Promise<IBasisModule>>();

export const DEFAULT_BASIS_JS_URL = new URL("./basis_encoder.js", import.meta.url).href;
export const DEFAULT_BASIS_WASM_URL = new URL("./basis_encoder.wasm", import.meta.url).href;

export async function loadBrowserBasisModule(options?: {
  jsUrl?: string;
  wasmUrl?: string;
}): Promise<IBasisModule> {
  const wasmUrl = options?.wasmUrl ?? DEFAULT_BASIS_WASM_URL;
  const jsUrl = options?.jsUrl ?? DEFAULT_BASIS_JS_URL;
  const cacheKey = `${jsUrl}::${wasmUrl}`;

  if (!modulePromises.has(cacheKey)) {
    const modulePromise = (async () => {
      const [basisFactory, wasmBinary] = await Promise.all([
        jsUrl === DEFAULT_BASIS_JS_URL ? Promise.resolve(BASIS) : import(/* @vite-ignore */ jsUrl).then((module) => module.default),
        fetch(wasmUrl).then(async (response) => {
          if (!response.ok) {
            throw new Error(`Failed to fetch wasm binary from "${wasmUrl}" (${response.status}).`);
          }
          return response.arrayBuffer();
        })
      ]);

      const basisModule = (await basisFactory({ wasmBinary })) as IBasisModule;
      basisModule.initializeBasis();
      return basisModule;
    })().catch((error) => {
      modulePromises.delete(cacheKey);
      throw error;
    });

    modulePromises.set(cacheKey, modulePromise);
  }

  return modulePromises.get(cacheKey)!;
}
