import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
// Avoid macOS copyfile/clonefile on cloud-managed Documents folders.
// A byte copy also prevents importing Finder-generated conflict copies.
async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory())
      await copyTree(join(source, entry.name), join(destination, entry.name));
    else if (entry.isFile())
      await writeFile(
        join(destination, entry.name),
        await readFile(join(source, entry.name)),
      );
  }
}
const destination = process.argv[2] ?? "public/pdfjs";
for (const name of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
  await copyTree(`node_modules/pdfjs-dist/${name}`, `${destination}/${name}`);
}
