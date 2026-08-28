import type { PdfProcessResult } from "@firecrawl/pdf-inspector-wasm";

// Each analysis owns its worker. Closing the dialog or timing out releases WASM memory.
export function analyzePDF(bytes: Uint8Array, signal: AbortSignal): Promise<PdfProcessResult> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Analysis cancelled."));
    const worker = new Worker(new URL("./inspector-worker.ts", import.meta.url), { type: "module" });
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
    };
    const abort = () => { finish(); reject(new Error("Analysis cancelled.")); };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("Analysis exceeded 60 seconds. Try a smaller PDF."));
    }, 60000);
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = () => {
      finish();
      reject(new Error("Document analysis could not complete. Your PDF has not been changed."));
    };
    worker.postMessage(bytes);
  });
}
