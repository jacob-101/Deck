import { chmod, copyFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
await mkdir("build/native", { recursive: true });
await new Promise((resolve, reject) => {
  const child = spawn(
    "xcrun",
    [
      "clang",
      "native/OpenPDFOCR.m",
      "-fobjc-arc",
      "-fmodules-cache-path=build/native/module-cache",
      "-O2",
      "-framework",
      "PDFKit",
      "-framework",
      "Vision",
      "-framework",
      "AppKit",
      "-framework",
      "Foundation",
      "-o",
      "build/native/openpdf-ocr",
    ],
    { stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`Native OCR build failed (${code}).`)),
  );
});
await new Promise((resolve, reject) => {
  const child = spawn(
    "cargo",
    ["build", "--manifest-path", "native-rust/Cargo.toml", "--release"],
    { stdio: "inherit" },
  );
  child.on("error", reject);
  child.on("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error(`Rust native build failed (${code}).`)),
  );
});
await copyFile(
  "native-rust/target/release/openpdf-native",
  "build/native/openpdf-native",
);
await chmod("build/native/openpdf-native", 0o755);
