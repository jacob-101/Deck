import { beforeEach, describe, expect, it } from "vitest";
import { isDocumentDirty, useDocument } from "../src/core/history";
import type { DocumentInfo } from "../src/types";

const info = { pages: [] } as unknown as DocumentInfo;
const first = new Uint8Array([1]);
const edited = new Uint8Array([2]);
beforeEach(() => {
  const store = useDocument.getState();
  for (const document of store.documents) store.close(document.id);
  store.activate(null);
});

describe("PDF document tabs", () => {
  it("keeps bytes, undo branches and save state separate when switching", () => {
    const store = useDocument.getState();
    store.load(first, info, "One.pdf", "one");
    const one = useDocument.getState().activeId!;
    store.commit(edited, info, "Edit one");
    store.load(new Uint8Array([3]), info, "Two.pdf", "two");
    const two = useDocument.getState().activeId!;
    expect(useDocument.getState().documents.map(isDocumentDirty)).toEqual([
      true,
      false,
    ]);
    store.undo();
    expect(useDocument.getState().revisions[0].bytes[0]).toBe(3);
    store.activate(one);
    expect(
      useDocument.getState().revisions[useDocument.getState().cursor].bytes,
    ).toBe(edited);
    store.undo();
    expect(isDocumentDirty(useDocument.getState())).toBe(false);
    store.redo();
    expect(isDocumentDirty(useDocument.getState())).toBe(true);
    store.activate(two);
    expect(useDocument.getState().name).toBe("Two.pdf");
    expect(useDocument.getState().revisions).toHaveLength(1);
  });

  it("retains PDFs on the start page and handles active and background closes", () => {
    const store = useDocument.getState();
    store.load(first, info, "One.pdf", null);
    const one = useDocument.getState().activeId!;
    store.load(edited, info, "Two.pdf", null);
    const two = useDocument.getState().activeId!;
    store.activate(null);
    expect(useDocument.getState().revisions).toHaveLength(0);
    expect(useDocument.getState().documents).toHaveLength(2);
    store.activate(two);
    store.close(one);
    expect(useDocument.getState().activeId).toBe(two);
    store.close(two);
    expect(useDocument.getState().activeId).toBe(null);
    expect(useDocument.getState().documents).toHaveLength(0);
  });

  it("selects the adjacent PDF on closing the active tab", () => {
    const store = useDocument.getState();
    store.load(first, info, "One.pdf", null);
    const one = useDocument.getState().activeId!;
    store.load(first, info, "Two.pdf", null);
    const two = useDocument.getState().activeId!;
    store.load(first, info, "Three.pdf", null);
    const three = useDocument.getState().activeId!;
    store.activate(two);
    store.close(two);
    expect(useDocument.getState().activeId).toBe(three);
    store.close(three);
    expect(useDocument.getState().activeId).toBe(one);
  });

  it("marks the intended background document saved without changing the active PDF", () => {
    const store = useDocument.getState();
    store.load(first, info, "One.pdf", null);
    const one = useDocument.getState().activeId!;
    store.commit(edited, info, "Edit one");
    const revision = useDocument.getState().revisions[1].id;
    store.load(first, info, "Two.pdf", null);
    store.markSaved(revision, "Saved one.pdf", "saved-one", one);
    expect(useDocument.getState().name).toBe("Two.pdf");
    expect(useDocument.getState().fileId).toBe(null);
    expect(useDocument.getState().documents[0].name).toBe("Saved one.pdf");
    expect(useDocument.getState().documents.some(isDocumentDirty)).toBe(false);
  });
});
