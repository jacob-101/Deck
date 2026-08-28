export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export type OpenFile = { id: string | null; name: string; bytes: Uint8Array };
export type RecentFile = { id: string; name: string; date: number };
export type SaveResult = { id: string; name: string } | null;
export type DesktopAPI = {
  open(): Promise<OpenFile | null>;
  openRecent(id: string): Promise<OpenFile>;
  recents(): Promise<RecentFile[]>;
  save(bytes: Uint8Array, id: string | null, name: string, saveAs: boolean): Promise<SaveResult>;
  exportFiles(files: { name: string; bytes: Uint8Array }[]): Promise<boolean>;
  setDirty(value: boolean): void;
  confirmClose(): Promise<'save' | 'discard' | 'cancel'>;
  closeWindow(): void;
  fullscreen(): void;
  print(): void;
  ready(): void;
  onCommand(cb: (command: string) => void): () => void;
  onFile(cb: (file: OpenFile) => void): () => void;
};
declare global { interface Window { desktop?: DesktopAPI } }
export type Tool = 'select' | 'Highlight' | 'Underline' | 'StrikeOut' | 'Ink' | 'Square' | 'Circle' | 'Line' | 'FreeText' | 'Text';
export type AnnotationInput = { type: Exclude<Tool, 'select'>; rect: number[]; color: number[]; width: number; contents?: string; points?: number[][]; quads?: number[][] };
export type AnnotationInfo = { id: number; type: string; contents: string; color: number[] };
export type PageInfo = { width: number; height: number; rotation: number; annotations: AnnotationInfo[] };
export type DocumentInfo = { pages: PageInfo[]; title: string };
export type EditCommand =
  | { type: 'rotate'; page: number; angle: number }
  | { type: 'reorder'; order: number[] }
  | { type: 'duplicate'; page: number }
  | { type: 'delete'; page: number }
  | { type: 'merge'; bytes: Uint8Array }
  | { type: 'annotate'; page: number; annotation: AnnotationInput }
  | { type: 'remove-annotation'; page: number; id: number };
