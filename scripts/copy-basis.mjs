import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/basis", { recursive: true });
await cp("src/basis/basis_encoder.d.ts", "dist/basis/basis_encoder.d.ts");
await cp("src/basis/basis_encoder.js", "dist/basis/basis_encoder.js");
await cp("src/basis/basis_encoder.wasm", "dist/basis/basis_encoder.wasm");
