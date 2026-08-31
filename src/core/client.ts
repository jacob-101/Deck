import type {
  DocumentInfo,
  EditCommand,
  FormField,
  MetadataInput,
} from "../types";
export type PDFResult = { bytes: Uint8Array; info: DocumentInfo };
let worker: Worker | null = null;
let ready = false;
let queue: object[] = [];
let sequence = 0;
const pending = new Map<
  number,
  {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function reset(message: string) {
  worker?.terminate();
  worker = null;
  ready = false;
  queue = [];
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(new Error(message));
  }
  pending.clear();
}
function call<T>(payload: object): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (data.ready) {
        ready = true;
        for (const payload of queue) worker!.postMessage(payload);
        queue = [];
        return;
      }
      const request = pending.get(data.id);
      if (!request) return;
      clearTimeout(request.timer);
      pending.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    };
    worker.onerror = () =>
      reset(
        "The PDF worker stopped. Your last successful revision is safe. Please try again.",
      );
  }
  return new Promise<T>((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(
      () =>
        reset(
          "This PDF took too long to process. Try a smaller or repaired copy.",
        ),
      60000,
    );
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    if (ready) worker!.postMessage({ ...payload, id });
    else queue.push({ ...payload, id });
  });
}
export const pdfEngine = {
  inspect: (bytes: Uint8Array) => call<PDFResult>({ action: "inspect", bytes }),
  edit: (bytes: Uint8Array, command: EditCommand) =>
    call<PDFResult>({ action: "edit", bytes, command }),
  editSession: (
    bytes: Uint8Array,
    command: EditCommand,
    baseRevisionId: string,
    nextRevisionId = crypto.randomUUID(),
  ) =>
    call<PDFResult>({
      action: "edit-session",
      bytes,
      command,
      baseRevisionId,
      nextRevisionId,
    }).then((result) => ({ ...result, revisionId: nextRevisionId })),
  sample: () => call<PDFResult>({ action: "sample" }),
  extract: (bytes: Uint8Array, pages: number[]) =>
    call<Uint8Array>({ action: "extract", bytes, pages }),
  images: (images: import("../types").ImagePDFInput[]) =>
    call<PDFResult>({ action: "images", images }),
  metadata: (bytes: Uint8Array, values: MetadataInput) =>
    call<PDFResult>({ action: "metadata", bytes, values }),
  formFields: (bytes: Uint8Array) =>
    call<FormField[]>({ action: "form-fields", bytes }),
  fillForm: (bytes: Uint8Array, values: Record<string, string>) =>
    call<PDFResult>({ action: "fill-form", bytes, values }),
  bates: (bytes: Uint8Array, options: object) =>
    call<PDFResult>({ action: "bates", bytes, options }),
  mix: (bytes: Uint8Array, secondBytes: Uint8Array, firstOrder: boolean) =>
    call<PDFResult>({ action: "mix", bytes, secondBytes, firstOrder }),
  mirror: (bytes: Uint8Array, direction: "horizontal" | "vertical" | "both") =>
    call<PDFResult>({ action: "mirror", bytes, direction }),
  pagesPerSheet: (bytes: Uint8Array, perSheet: 2 | 4 | 6 | 9) =>
    call<PDFResult>({ action: "pages-per-sheet", bytes, perSheet }),
  split: (
    bytes: Uint8Array,
    name: string,
    mode: "pages" | "size" | "half" | "chapter" | "text",
    value: string,
  ) =>
    call<import("../types").ExportedFile[]>({
      action: "split-tools",
      bytes,
      name,
      mode,
      value,
    }),
  extractImages: (bytes: Uint8Array, name: string) =>
    call<import("../types").ExportedFile[]>({
      action: "extract-images",
      bytes,
      name,
    }),
  unlock: (bytes: Uint8Array, password: string) =>
    call<PDFResult>({ action: "unlock", bytes, password }),
  docxPages: (bytes: Uint8Array, mode: "layout" | "editable") =>
    call<
      { image?: Uint8Array; text?: string; width: number; height: number }[]
    >({ action: "docx-pages", bytes, mode }),
  optimize: (bytes: Uint8Array) =>
    call<PDFResult>({ action: "optimize", bytes }),
  renderImages: (
    bytes: Uint8Array,
    name: string,
    format: "png" | "jpg",
    dpi: number,
    quality: number,
  ) =>
    call<import("../types").ExportedFile[]>({
      action: "render-images",
      bytes,
      name,
      format,
      dpi,
      quality,
    }),
  encrypt: (bytes: Uint8Array, password: string) =>
    call<Uint8Array>({ action: "encrypt", bytes, password }),
  flatten: (bytes: Uint8Array) => call<PDFResult>({ action: "flatten", bytes }),
  cropResize: (
    bytes: Uint8Array,
    marginPercent: number,
    size: "keep" | "a4" | "letter",
  ) =>
    call<PDFResult>({
      action: "crop-resize",
      bytes,
      marginPercent,
      size,
    }),
  scanPrivacy: (bytes: Uint8Array) =>
    call<import("../types").PrivacyReport>({ action: "privacy-scan", bytes }),
  cleanPrivacy: (bytes: Uint8Array) =>
    call<PDFResult>({ action: "privacy-clean", bytes }),
};
