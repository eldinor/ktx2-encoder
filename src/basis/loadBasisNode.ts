import type { IBasisModule } from "../type.js";
import BASIS from "./basis_encoder.js";

let basisModulePromise: Promise<IBasisModule> | null = null;

export function loadNodeBasisModule(): Promise<IBasisModule> {
  if (!basisModulePromise) {
    basisModulePromise = BASIS().then((basisModule: IBasisModule) => {
      basisModule.initializeBasis();
      return basisModule;
    });
  }

  return basisModulePromise;
}
