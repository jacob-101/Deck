import * as mupdf from 'mupdf';
import { MAX_FILE_SIZE, type DocumentInfo, type EditCommand, type AnnotationInput } from '../types';

function open(bytes: Uint8Array) {
  if (bytes.byteLength > MAX_FILE_SIZE) throw new Error('This release supports PDFs up to 50 MB.');
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('This is not a valid PDF file.');
  const doc = new mupdf.PDFDocument(bytes);
  if (doc.needsPassword()) { doc.destroy(); throw new Error('Password-protected PDFs are not supported yet. Open an unlocked copy.'); }
  doc.disableJS();
  if (doc.countPages() === 0 || doc.countPages() > 500) { doc.destroy(); throw new Error('Choose a PDF with 1–500 pages.'); }
  return doc;
}
function serialize(doc: mupdf.PDFDocument) {
  const buffer = doc.saveToBuffer('garbage=4,compress');
  try {
    const bytes = buffer.asUint8Array().slice();
    if (bytes.length > MAX_FILE_SIZE) throw new Error('The result exceeds the 50 MB limit. Try a smaller document.');
    return bytes;
  } finally { buffer.destroy(); }
}
function checkPage(doc: mupdf.PDFDocument, index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= doc.countPages()) throw new Error('Page no longer exists.');
}
export function inspect(bytes: Uint8Array): DocumentInfo {
  const doc = open(bytes);
  try {
    return { title: doc.getMetaData('info:Title') ?? '', pages: Array.from({ length: doc.countPages() }, (_, index) => {
      const page = doc.loadPage(index);
      const object = page.getObject();
      const rotate = object.getInheritable('Rotate');
      const annots = page.getAnnotations();
      try {
        const bounds = page.getBounds();
        return { width: bounds[2] - bounds[0], height: bounds[3] - bounds[1], rotation: rotate.asNumber() || 0, annotations: annots.map((annotation, id) => ({ id, type: annotation.getType(), contents: annotation.getContents(), color: annotation.getColor() })) };
      } finally { for (const annotation of annots) annotation.destroy(); rotate.destroy(); object.destroy(); page.destroy(); }
    }) };
  } finally { doc.destroy(); }
}
function addAnnotation(page: mupdf.PDFPage, input: AnnotationInput) {
  if (input.rect.length !== 4 || !input.rect.every(Number.isFinite) || input.color.length !== 3 || !input.color.every(c => c >= 0 && c <= 1)) throw new Error('Invalid annotation coordinates.');
  const annotation = page.createAnnotation(input.type);
  try {
    annotation.setColor(input.color as mupdf.AnnotColor);
    annotation.setFlags(mupdf.PDFAnnotation.IS_PRINT);
    annotation.setCreationDate(new Date());
    if (annotation.hasBorder()) annotation.setBorderWidth(Math.max(0.5, Math.min(10, input.width)));
    if (input.type === 'Highlight' || input.type === 'Underline' || input.type === 'StrikeOut') {
      const [x1, y1, x2, y2] = input.rect;
      annotation.setQuadPoints((input.quads?.length ? input.quads : [[x1, y1, x2, y1, x1, y2, x2, y2]]) as mupdf.Quad[]);
      if (input.type === 'Highlight') annotation.setOpacity(0.42);
    } else if (input.type === 'Ink') {
      annotation.setInkList([input.points as mupdf.Point[]]);
    } else if (input.type === 'Line') {
      const points = input.points ?? [[input.rect[0], input.rect[1]], [input.rect[2], input.rect[3]]];
      annotation.setLine(points[0] as mupdf.Point, points[points.length - 1] as mupdf.Point);
      annotation.setLineEndingStyles('None', 'OpenArrow');
    } else {
      annotation.setRect(input.rect as mupdf.Rect);
      if (input.type === 'FreeText') annotation.setDefaultAppearance('Helv', 14, input.color as mupdf.AnnotColor);
      if (input.type === 'Text') annotation.setIcon('Comment');
    }
    if (input.contents) annotation.setContents(input.contents.slice(0, 5000));
    annotation.update();
  } finally { annotation.destroy(); }
}
export function edit(bytes: Uint8Array, command: EditCommand): Uint8Array {
  const doc = open(bytes);
  try {
    if ('page' in command) checkPage(doc, command.page);
    switch (command.type) {
      case 'rotate': {
        const page = doc.findPage(command.page); const rotation = page.getInheritable('Rotate');
        try { page.put('Rotate', ((rotation.asNumber() || 0) + command.angle + 360) % 360); }
        finally { rotation.destroy(); page.destroy(); }
        break;
      }
      case 'delete':
        if (doc.countPages() === 1) throw new Error('Keep at least one page in the document.');
        doc.deletePage(command.page); break;
      case 'duplicate': {
        // Clone the page through a separate document so changes to the duplicate are independent.
        const source = open(bytes);
        try { copyPage(doc, command.page + 1, source, command.page); } finally { source.destroy(); }
        break;
      }
      case 'reorder':
        if (command.order.length !== doc.countPages() || new Set(command.order).size !== command.order.length) throw new Error('Invalid page order.');
        command.order.forEach(index => checkPage(doc, index)); doc.rearrangePages(command.order); break;
      case 'merge': {
        const source = open(command.bytes);
        try {
          if (source.countPages() + doc.countPages() > 500) throw new Error('The combined PDF exceeds 500 pages.');
          for (let index = 0; index < source.countPages(); index++) copyPage(doc, -1, source, index);
        } finally { source.destroy(); }
        break;
      }
      case 'annotate': {
        const page = doc.loadPage(command.page);
        try { addAnnotation(page, command.annotation); } finally { page.destroy(); }
        break;
      }
      case 'remove-annotation': {
        const page = doc.loadPage(command.page); const annotations = page.getAnnotations();
        try {
          const annotation = annotations[command.id];
          if (!annotation) throw new Error('This annotation no longer exists.');
          page.deleteAnnotation(annotation);
        } finally { annotations.forEach(annotation => annotation.destroy()); page.destroy(); }
        break;
      }
    }
    return serialize(doc);
  } finally { doc.destroy(); }
}
function copyPage(target: mupdf.PDFDocument, at: number, source: mupdf.PDFDocument, index: number) {
  target.graftPage(at, source, index);
  // graftPage copies content/resources, but not annotations. Copy each annotation without
  // its /P back-reference to avoid importing the source's entire page tree.
  const page = source.loadPage(index); const annotations = page.getAnnotations();
  const targetPage = target.findPage(at < 0 ? target.countPages() - 1 : at);
  const list = target.newArray();
  try {
    for (const annotation of annotations) {
      const obj = annotation.getObject(); const clean = source.newDictionary();
      try {
        obj.forEach((value, key) => { if (key !== 'P' && key !== 'Popup' && key !== 'IRT') clean.put(key, value); });
        const cloned = target.graftObject(clean); const ref = target.addObject(cloned);
        try { ref.put('P', targetPage); list.push(ref); } finally { ref.destroy(); cloned.destroy(); }
      } finally { clean.destroy(); obj.destroy(); }
    }
    if (annotations.length) targetPage.put('Annots', list);
  } finally { annotations.forEach(annotation => annotation.destroy()); list.destroy(); targetPage.destroy(); page.destroy(); }
}
export function extract(bytes: Uint8Array, indices: number[]) {
  const doc = open(bytes);
  try {
    if (!indices.length || new Set(indices).size !== indices.length) throw new Error('Select at least one unique page.');
    indices.forEach(index => checkPage(doc, index));
    doc.rearrangePages(indices);
    return serialize(doc);
  } finally { doc.destroy(); }
}
export { parsePageRange } from "./ranges";

export function createSample(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const font = new mupdf.Font('Helvetica'); const bold = new mupdf.Font('Helvetica-Bold'); const serif = new mupdf.Font('Times-Italic');
  const f1 = doc.addSimpleFont(font); const f2 = doc.addSimpleFont(bold); const f3 = doc.addSimpleFont(serif);
  const text = (value: string, x: number, y: number, size = 12, face = 'F1', color = '0.16 0.18 0.19') => `BT /${face} ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm (${value.replace(/[()\\]/g, '\\$&')}) Tj ET\n`;
  try {
    const sections = [
      ['A little less friction.', 'A little more focus.', 'A workspace for your words, ideas, and everything in between.'],
      ['Make room', 'for good ideas.', 'Read closely. Mark what matters. Keep your thoughts together.'],
      ['Put every page', 'in its place.', 'A better document starts with a little organization.'],
      ['Yours to keep.', 'Yours to change.', 'Your documents belong on your Mac, under your control.'],
    ];
    sections.forEach(([title, subtitle, description], index) => {
      let content = `0.986 0.979 0.957 rg 0 0 612 792 re f\n`;
      content += text('OPENPDF  /  FIELD NOTES', 52, 739, 10, 'F2', '0.24 0.37 0.30');
      content += text(`VOL. 01     /     ${String(index + 1).padStart(2, '0')}`, 446, 739, 9);
      content += '0.75 0.78 0.72 RG 0.5 w 52 719 m 560 719 l S\n';
      content += text(title, 52, 635, 38, 'F2');
      content += text(subtitle, 52, 586, 40, 'F3', '0.24 0.37 0.30');
      content += text(description, 52, 548, 11);
      content += '0.88 0.91 0.85 rg 52 336 508 170 re f\n';
      content += text(['SPACE TO THINK', 'LEAVE YOUR MARK', 'FIND YOUR FLOW', 'LOCAL BY DESIGN'][index], 76, 476, 10, 'F2', '0.24 0.37 0.30');
      content += text(['A fresh perspective on the everyday PDF.', 'The best ideas rarely arrive fully formed.', 'Less time rearranging. More time creating.', 'No account. No upload. No distractions.'][index], 76, 436, 22, 'F3');
      content += text('Try it here. Highlight a sentence, add a note, or sketch an idea.', 76, 392, 11);
      content += text('This is a real PDF. Every change you save stays in the document.', 76, 370, 11);
      content += text('01   READ WITH INTENTION', 52, 291, 10, 'F2');
      content += text('Select text to copy it. Search for a word. Zoom in on the details.', 52, 267, 11);
      content += text('02   MAKE IT YOURS', 52, 223, 10, 'F2');
      content += text('Annotate the page, move things around, and save a fresh copy.', 52, 199, 11);
      content += text('03   KEEP THE ORIGINAL', 52, 155, 10, 'F2');
      content += text('Use Save As to keep a version before making your next big change.', 52, 131, 11);
      content += '0.75 0.78 0.72 RG 0.5 w 52 77 m 560 77 l S\n';
      content += text('Made for the way you work.', 52, 54, 9, 'F3');
      content += text(`OPENPDF STUDIO    /    ${index + 1}`, 434, 54, 8);
      const page = doc.addPage([0, 0, 612, 792], 0, { Font: { F1: f1, F2: f2, F3: f3 } }, content);
      doc.insertPage(-1, page); page.destroy();
    });
    doc.setMetaData('info:Title', 'Field Notes — A guide to OpenPDF Studio');
    return serialize(doc);
  } finally { f1.destroy(); f2.destroy(); f3.destroy(); font.destroy(); bold.destroy(); serif.destroy(); doc.destroy(); }
}
