export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export type OpenFile = { id: string | null; name: string; bytes: Uint8Array };
export type ImageFile = { name: string; bytes: Uint8Array };
export type ImageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ImagePDFInput = ImageFile & {
  crop?: ImageCrop;
  rotation?: 0 | 90 | 180 | 270;
};
export type RecentFile = { id: string; name: string; date: number };
export type SaveResult = { id: string; name: string } | null;
export type OCRResult = {
  pages: { page: number; text: string; confidence: number }[];
  markdown: string;
  processingTimeMs: number;
  engine: string;
};
export type DesktopAPI = {
  copyText(value: string): Promise<void>;
  open(): Promise<OpenFile | null>;
  openRecent(id: string): Promise<OpenFile>;
  openImages(): Promise<ImageFile[] | null>;
  convertWord(): Promise<(OpenFile & { engine: string }) | null>;
  recents(): Promise<RecentFile[]>;
  clearRecents(): Promise<void>;
  save(
    bytes: Uint8Array,
    id: string | null,
    name: string,
    saveAs: boolean,
  ): Promise<SaveResult>;
  exportFiles(files: { name: string; bytes: Uint8Array }[]): Promise<boolean>;
  exportMarkdown(markdown: string, name: string): Promise<boolean>;
  runOCR(
    bytes: Uint8Array,
    pages: number[],
    language: string,
  ): Promise<OCRResult>;
  cancelOCR(): void;
  setDirty(value: boolean): void;
  confirmClose(): Promise<"save" | "discard" | "cancel">;
  closeWindow(): void;
  fullscreen(): void;
  print(): void;
  ready(): void;
  onCommand(cb: (command: string) => void): () => void;
  onFile(cb: (file: OpenFile) => void): () => void;
};
declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
export type Tool =
  | "select"
  | "Highlight"
  | "Underline"
  | "StrikeOut"
  | "Ink"
  | "Square"
  | "Circle"
  | "Line"
  | "FreeText"
  | "Text"
  | "Stamp";
export type AnnotationInput = {
  type: Exclude<Tool, "select">;
  rect: number[];
  color: number[];
  width: number;
  contents?: string;
  points?: number[][];
  quads?: number[][];
  fontSize?: number;
  font?: string;
  imageBytes?: Uint8Array;
};
export type AnnotationInfo = {
  id: number;
  type: string;
  contents: string;
  color: number[];
  width: number | null;
  editable: boolean;
  locked: boolean;
  fontSize?: number | null;
  font?: string | null;
  rect?: number[];
};
export type AnnotationPatch = {
  contents?: string;
  color?: number[];
  width?: number;
  fontSize?: number;
  font?: string;
  rect?: number[];
};
export type PageInfo = {
  width: number;
  height: number;
  rotation: number;
  annotations: AnnotationInfo[];
};
export type OutlineEntry = {
  id: string;
  title: string;
  page: number | null;
  open: boolean;
  children: OutlineEntry[];
};
export type DocumentInfo = {
  pages: PageInfo[];
  title: string;
  author: string;
  subject: string;
  creator: string;
  producer: string;
  format: string;
  outline: OutlineEntry[];
  outlineNotice: string | null;
};
export type EditCommand =
  | { type: "rotate"; page: number; angle: number }
  | { type: "reorder"; order: number[] }
  | { type: "duplicate"; page: number }
  | { type: "delete"; page: number }
  | { type: "merge"; bytes: Uint8Array }
  | { type: "annotate"; page: number; annotation: AnnotationInput }
  | {
      type: "update-annotation";
      page: number;
      id: number;
      patch: AnnotationPatch;
    }
  | { type: "remove-annotation"; page: number; id: number };
