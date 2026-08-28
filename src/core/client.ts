import type { DocumentInfo, EditCommand } from '../types';
export type PDFResult = { bytes: Uint8Array; info: DocumentInfo };
let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
function reset(message: string) {
  worker?.terminate(); worker = null;
  for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error(message)); }
  pending.clear();
}
function call<T>(payload: object): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id); if (!request) return;
      clearTimeout(request.timer); pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
    };
    worker.onerror = () => reset('The PDF worker stopped. Your last successful revision is safe. Please try again.');
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reset('This PDF took too long to process. Try a smaller or repaired copy.'), 60000);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    worker!.postMessage({ ...payload, id });
  });
}
export const pdfEngine = {
  inspect: (bytes: Uint8Array) => call<PDFResult>({ action: 'inspect', bytes }),
  edit: (bytes: Uint8Array, command: EditCommand) => call<PDFResult>({ action: 'edit', bytes, command }),
  sample: () => call<PDFResult>({ action: 'sample' }),
  extract: (bytes: Uint8Array, pages: number[]) => call<Uint8Array>({ action: 'extract', bytes, pages }),
};
