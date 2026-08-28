import { beforeAll, describe, expect, it } from 'vitest';
import * as mupdf from 'mupdf';
import { createSample, edit, extract, inspect, parsePageRange } from '../src/core/pdf';
import { useDocument } from '../src/core/history';
import type { AnnotationInput } from '../src/types';
let sample: Uint8Array;
beforeAll(() => { sample = createSample(); });
function pageText(bytes: Uint8Array, index = 0) {
  const doc = new mupdf.PDFDocument(bytes); const page = doc.loadPage(index); const text = page.toStructuredText();
  try { return text.asText(); } finally { text.destroy(); page.destroy(); doc.destroy(); }
}
const note: AnnotationInput = { type: 'Text', rect: [50, 50, 74, 74], color: [1, .7, .1], width: 2, contents: 'Keep this thought.' };
describe('actual PDF operations', () => {
  it('creates a real searchable four-page document', () => { expect(inspect(sample).pages).toHaveLength(4); expect(pageText(sample)).toContain('A little less friction.'); });
  it('rotates and independently duplicates pages', () => {
    const duplicated = edit(sample, { type: 'duplicate', page: 0 });
    const rotated = edit(duplicated, { type: 'rotate', page: 1, angle: 90 });
    const pages = inspect(rotated).pages;
    expect(pages).toHaveLength(5); expect(pages[0].rotation).toBe(0); expect(pages[1].rotation).toBe(90); expect(pages[1].width).toBe(792);
    expect(pageText(rotated, 1)).toContain('A little less friction.');
  });
  it('reorders, deletes and extracts without changing the source', () => {
    const reordered = edit(sample, { type: 'reorder', order: [3, 0, 1, 2] });
    expect(pageText(reordered)).toContain('Yours to keep.');
    const deleted = edit(reordered, { type: 'delete', page: 0 });
    expect(inspect(deleted).pages).toHaveLength(3); expect(pageText(deleted)).toContain('A little less friction.');
    const output = extract(sample, [2, 0]);
    expect(inspect(output).pages).toHaveLength(2); expect(pageText(output)).toContain('Put every page'); expect(inspect(sample).pages).toHaveLength(4);
  });
  it('rejects deleting the final page, invalid page orders and invalid inputs', () => {
    expect(() => edit(extract(sample, [0]), { type: 'delete', page: 0 })).toThrow('at least one');
    expect(() => edit(sample, { type: 'reorder', order: [0, 0, 2, 3] })).toThrow('Invalid');
    expect(() => extract(sample, [8])).toThrow('Page');
    expect(() => inspect(new TextEncoder().encode('not a PDF'))).toThrow('valid PDF');
  });
  it('preserves annotations through save, duplication, merge, and removal', () => {
    const annotated = edit(sample, { type: 'annotate', page: 0, annotation: note });
    expect(inspect(annotated).pages[0].annotations[0].contents).toBe(note.contents);
    const copied = edit(annotated, { type: 'duplicate', page: 0 });
    expect(inspect(copied).pages[1].annotations[0].contents).toBe(note.contents);
    const merged = edit(sample, { type: 'merge', bytes: annotated });
    expect(inspect(merged).pages).toHaveLength(8); expect(inspect(merged).pages[4].annotations[0].contents).toBe(note.contents);
    const removed = edit(copied, { type: 'remove-annotation', page: 1, id: 0 });
    expect(inspect(removed).pages[1].annotations).toHaveLength(0); expect(inspect(removed).pages[0].annotations).toHaveLength(1);
  });
  it.each(['Highlight', 'Underline', 'StrikeOut', 'Square', 'Circle', 'Line', 'Ink', 'FreeText'] as const)('saves %s as a standard PDF annotation', type => {
    const bytes = edit(sample, { type: 'annotate', page: 0, annotation: { ...note, type, rect: [50, 100, 200, 140], points: [[50, 100], [100, 110], [200, 140]] } });
    expect(inspect(bytes).pages[0].annotations[0].type).toBe(type);
    const doc = new mupdf.PDFDocument(bytes); const page = doc.loadPage(0); const pixmap = page.toPixmap([.2, 0, 0, .2, 0, 0], mupdf.ColorSpace.DeviceRGB, false, true);
    try { expect(pixmap.getWidth()).toBeGreaterThan(0); } finally { pixmap.destroy(); page.destroy(); doc.destroy(); }
  });
  it('round trips annotations on a rotated page at the requested coordinates', () => {
    const rotated = edit(sample, { type: 'rotate', page: 0, angle: 90 });
    const annotated = edit(rotated, { type: 'annotate', page: 0, annotation: { ...note, type: 'Square', rect: [200, 100, 350, 160] } });
    const doc = new mupdf.PDFDocument(annotated); const page = doc.loadPage(0); const annotations = page.getAnnotations();
    try { const rect = annotations[0].getRect(); expect(rect[0]).toBeCloseTo(200); expect(rect[1]).toBeCloseTo(100); } finally { annotations.forEach(a => a.destroy()); page.destroy(); doc.destroy(); }
  });
  it('rejects encrypted documents without changing their bytes', () => {
    const doc = new mupdf.PDFDocument(sample); const buffer = doc.saveToBuffer('encrypt=aes-256,user-password=secret,owner-password=owner');
    try { expect(() => inspect(buffer.asUint8Array().slice())).toThrow('Password-protected'); } finally { buffer.destroy(); doc.destroy(); }
  });
});
describe('page ranges and command history', () => {
  it('parses ranges and rejects invalid selections', () => { expect(parsePageRange('1, 3-4, 3', 4)).toEqual([0, 2, 3]); expect(() => parsePageRange('0', 4)).toThrow(); expect(() => parsePageRange('4-2', 4)).toThrow(); expect(() => parsePageRange('', 4)).toThrow(); });
  it('restores real bytes and keeps save state correct across undo, redo and a new branch', () => {
    const store = useDocument.getState(); store.load(sample, inspect(sample), 'test.pdf', null);
    const original = useDocument.getState().saved;
    const rotated = edit(sample, { type: 'rotate', page: 0, angle: 90 });
    store.commit(rotated, inspect(rotated), 'Rotate'); store.undo();
    let current = useDocument.getState(); expect(current.revisions[current.cursor].id).toBe(original); expect(current.revisions[current.cursor].bytes).toBe(sample);
    store.redo(); current = useDocument.getState(); store.markSaved(current.revisions[current.cursor].id, 'test.pdf', 'handle');
    store.undo(); store.commit(sample, inspect(sample), 'New branch'); current = useDocument.getState();
    expect(current.revisions).toHaveLength(2); expect(current.saved).not.toBe(current.revisions[current.cursor].id); store.close();
  });
});
