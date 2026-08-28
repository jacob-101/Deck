import { create } from 'zustand';
import type { DocumentInfo } from '../types';
export type Revision = { id: string; bytes: Uint8Array; info: DocumentInfo; label: string };
type History = {
  revisions: Revision[]; cursor: number; saved: string | null; fileId: string | null; name: string;
  load: (bytes: Uint8Array, info: DocumentInfo, name: string, fileId: string | null) => void;
  commit: (bytes: Uint8Array, info: DocumentInfo, label: string) => void;
  undo: () => void; redo: () => void; close: () => void;
  markSaved: (revisionId: string, name: string, fileId: string | null) => void;
};
export const useDocument = create<History>((set, get) => ({
  revisions: [], cursor: -1, saved: null, fileId: null, name: '',
  load: (bytes, info, name, fileId) => { const id = crypto.randomUUID(); set({ revisions: [{ id, bytes, info, label: 'Open document' }], cursor: 0, saved: id, name, fileId }); },
  commit: (bytes, info, label) => {
    const state = get(); const revisions = [...state.revisions.slice(0, state.cursor + 1), { id: crypto.randomUUID(), bytes, info, label }];
    let memory = revisions.reduce((sum, entry) => sum + entry.bytes.length, 0);
    while (revisions.length > 2 && (memory > 96 * 1024 * 1024 || revisions.length > 40)) memory -= revisions.shift()!.bytes.length;
    set({ revisions, cursor: revisions.length - 1 });
  },
  undo: () => set(state => ({ cursor: Math.max(0, state.cursor - 1) })),
  redo: () => set(state => ({ cursor: Math.min(state.revisions.length - 1, state.cursor + 1) })),
  close: () => set({ revisions: [], cursor: -1, saved: null, fileId: null, name: '' }),
  markSaved: (revisionId, name, fileId) => set({ saved: revisionId, name, fileId }),
}));
