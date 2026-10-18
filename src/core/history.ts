import { create } from "zustand";
import type { DocumentInfo } from "../types";
export type Revision = {
  id: string;
  bytes: Uint8Array;
  info: DocumentInfo;
  label: string;
};
export type DocumentSession = {
  id: string;
  revisions: Revision[];
  cursor: number;
  saved: string | null;
  fileId: string | null;
  name: string;
};
type History = Omit<DocumentSession, "id"> & {
  documents: DocumentSession[];
  activeId: string | null;
  load: (
    bytes: Uint8Array,
    info: DocumentInfo,
    name: string,
    fileId: string | null,
  ) => void;
  commit: (
    bytes: Uint8Array,
    info: DocumentInfo,
    label: string,
    revisionId?: string,
  ) => void;
  undo: () => void;
  redo: () => void;
  activate: (id: string | null) => void;
  close: (id?: string) => void;
  markSaved: (
    revisionId: string,
    name: string,
    fileId: string | null,
    documentId?: string,
  ) => void;
};
const emptyDocument = {
  revisions: [] as Revision[],
  cursor: -1,
  saved: null,
  fileId: null,
  name: "",
};
function project(document?: DocumentSession) {
  if (!document) return emptyDocument;
  const { id: _id, ...fields } = document;
  return fields;
}
function updateActive(
  state: History,
  patch: Partial<Omit<DocumentSession, "id">>,
) {
  if (!state.activeId) return {};
  return {
    ...patch,
    documents: state.documents.map((document) =>
      document.id === state.activeId ? { ...document, ...patch } : document,
    ),
  };
}
export const isDocumentDirty = (
  document: Pick<DocumentSession, "revisions" | "cursor" | "saved">,
) => {
  const revision = document.revisions[document.cursor];
  return !!revision && revision.id !== document.saved;
};
export const useDocument = create<History>((set, get) => ({
  documents: [],
  activeId: null,
  revisions: [],
  cursor: -1,
  saved: null,
  fileId: null,
  name: "",
  load: (bytes, info, name, fileId) => {
    const id = crypto.randomUUID();
    const document: DocumentSession = {
      id: crypto.randomUUID(),
      revisions: [{ id, bytes, info, label: "Open document" }],
      cursor: 0,
      saved: id,
      name,
      fileId,
    };
    set((state) => ({
      ...project(document),
      activeId: document.id,
      documents: [...state.documents, document],
    }));
  },
  commit: (bytes, info, label, revisionId) => {
    const state = get();
    const revisions = [
      ...state.revisions.slice(0, state.cursor + 1),
      { id: revisionId ?? crypto.randomUUID(), bytes, info, label },
    ];
    let memory = revisions.reduce((sum, entry) => sum + entry.bytes.length, 0);
    while (
      revisions.length > 2 &&
      (memory > 96 * 1024 * 1024 || revisions.length > 40)
    )
      memory -= revisions.shift()!.bytes.length;
    set(updateActive(state, { revisions, cursor: revisions.length - 1 }));
  },
  undo: () =>
    set((state) =>
      updateActive(state, { cursor: Math.max(0, state.cursor - 1) }),
    ),
  redo: () =>
    set((state) =>
      updateActive(state, {
        cursor: Math.min(state.revisions.length - 1, state.cursor + 1),
      }),
    ),
  activate: (id) =>
    set((state) => {
      const document = state.documents.find((document) => document.id === id);
      if (id !== null && !document) return {};
      return { ...project(document), activeId: id };
    }),
  close: (id) =>
    set((state) => {
      const target = id ?? state.activeId;
      const index = state.documents.findIndex(
        (document) => document.id === target,
      );
      const documents = state.documents.filter(
        (document) => document.id !== target,
      );
      if (state.activeId !== target) return { documents };
      const next = documents[Math.min(index, documents.length - 1)];
      return { ...project(next), documents, activeId: next?.id ?? null };
    }),
  markSaved: (revisionId, name, fileId, documentId) =>
    set((state) => {
      const target = documentId ?? state.activeId;
      const patch = { saved: revisionId, name, fileId };
      return {
        ...(target === state.activeId ? patch : {}),
        documents: state.documents.map((document) =>
          document.id === target ? { ...document, ...patch } : document,
        ),
      };
    }),
}));
