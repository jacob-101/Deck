import init, { processPdf } from "@firecrawl/pdf-inspector-wasm";
import wasmUrl from "@firecrawl/pdf-inspector-wasm/pdf_inspector_wasm_bg.wasm?url";
import { MAX_FILE_SIZE } from "../types";

self.onmessage = async ({ data }: MessageEvent<Uint8Array>) => {
  try {
    if (!(data instanceof Uint8Array) || data.length > MAX_FILE_SIZE)
      throw new Error("Analysis is limited to PDFs smaller than 50 MB.");
    await init({ module_or_path: wasmUrl });
    const result = processPdf(data, { includePageMarkers: true });
    if ((result.markdown?.length || 0) > 10 * 1024 * 1024)
      throw new Error("Extracted text is too large. Analyze a smaller page range as a separate PDF.");
    self.postMessage({ result });
  } catch (cause) {
    self.postMessage({ error: cause instanceof Error ? cause.message : String(cause) });
  }
};
