import { chmod, copyFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";

await mkdir("dist-cli", { recursive: true });
await build({
  entryPoints: ["cli/openpdf.ts"],
  outfile: "dist-cli/openpdf.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["mupdf"],
  sourcemap: true,
});
await chmod("bin/openpdf", 0o755);
await copyFile(
  "node_modules/mupdf/dist/mupdf-wasm.wasm",
  "dist-cli/mupdf-wasm.wasm",
);
