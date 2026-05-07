/**
 * @file Unit tests for the watermark utility.
 *
 * Tests `utils/watermark.js` — `applyWatermark()` and its internal dispatch
 * to watermarkImage, watermarkPdf, watermarkDocx, watermarkPptx, watermarkZip,
 * watermarkRar.  All I/O libraries are mocked so no files are touched.
 * @module tests/utils/watermark
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted creates values that are available inside vi.mock factories
// (mock factories are hoisted above all imports/declarations).
const { sharpInstance, admZipInstance } = vi.hoisted(() => {
  const sharpInstance = {
    metadata: vi.fn().mockResolvedValue({ width: 800, height: 600, format: 'jpeg' }),
    resize: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('logo-buffer')),
    toFormat: vi.fn().mockReturnThis(),
    composite: vi.fn().mockReturnThis(),
  };

  const admZipInstance = {
    getEntry: vi.fn().mockReturnValue(null),
    getEntries: vi.fn().mockReturnValue([]),
    addFile: vi.fn(),
    updateFile: vi.fn(),
    writeZip: vi.fn(),
    toBuffer: vi.fn().mockReturnValue(Buffer.from('zip')),
  };

  return { sharpInstance, admZipInstance };
});

vi.mock('sharp', () => {
  const sharpFn = vi.fn(() => sharpInstance);
  return { default: sharpFn };
});

vi.mock('pdf-lib', () => {
  const mockPage = {
    getSize: vi.fn().mockReturnValue({ width: 595, height: 842 }),
    drawImage: vi.fn(),
  };
  const mockPdfDoc = {
    getPages: vi.fn().mockReturnValue([mockPage, mockPage]),
    embedPng: vi.fn().mockResolvedValue({
      scale: vi.fn().mockReturnValue({ width: 50, height: 50 }),
    }),
    save: vi.fn().mockResolvedValue(Buffer.from('pdf-output')),
  };
  return {
    PDFDocument: { load: vi.fn().mockResolvedValue(mockPdfDoc) },
  };
});

vi.mock('adm-zip', () => {
  const AdmZipMock = vi.fn(() => admZipInstance);
  return { default: AdmZipMock };
});

vi.mock('node-unrar-js', () => ({
  createExtractorFromData: vi.fn().mockResolvedValue({
    getFileList: vi.fn().mockReturnValue({ fileHeaders: [] }),
    extract: vi.fn().mockReturnValue({ files: [] }),
  }),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      ...actual.default,
      readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-bytes')),
      writeFileSync: vi.fn(),
      rmSync: vi.fn(),
    },
  };
});

vi.mock('../../utils/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { createExtractorFromData } from 'node-unrar-js';
import fs from 'fs';
import { applyWatermark } from '../../utils/watermark.js';

/**
 *
 * @param name
 * @param content
 */
function makeEntry(name, content) {
  return {
    entryName: name,
    isDirectory: false,
    getData: vi.fn(() => Buffer.from(content || `<${name}></${name}>`)),
  };
}

/**
 *
 */
function resetSharpInstance() {
  sharpInstance.metadata.mockResolvedValue({ width: 800, height: 600, format: 'jpeg' });
  sharpInstance.resize.mockReturnThis();
  sharpInstance.toBuffer.mockResolvedValue(Buffer.from('logo-buffer'));
  sharpInstance.toFormat.mockReturnThis();
  sharpInstance.composite.mockReturnThis();
  sharp.mockImplementation(() => sharpInstance);
}

/**
 *
 */
function resetAdmZip() {
  admZipInstance.getEntry.mockReturnValue(null);
  admZipInstance.getEntries.mockReturnValue([]);
  admZipInstance.addFile.mockClear();
  admZipInstance.updateFile.mockClear();
  admZipInstance.writeZip.mockClear();
  admZipInstance.toBuffer.mockReturnValue(Buffer.from('zip'));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetSharpInstance();
  resetAdmZip();
  fs.readFileSync.mockReturnValue(Buffer.from('fake-bytes'));
});

// ─────────────────────────────────────────────────────────────────────────────
// applyWatermark — MIME type dispatch
// ─────────────────────────────────────────────────────────────────────────────
describe('applyWatermark — MIME dispatch', () => {
  it('dispatches image/jpeg to watermarkImage', async () => {
    await applyWatermark('/tmp/photo.jpg', 'image/jpeg');

    expect(sharpInstance.composite).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('dispatches image/png to watermarkImage', async () => {
    sharpInstance.metadata.mockResolvedValue({ width: 1000, height: 800, format: 'png' });

    await applyWatermark('/tmp/image.png', 'image/png');

    expect(sharpInstance.composite).toHaveBeenCalled();
  });

  it('dispatches application/pdf to watermarkPdf', async () => {
    await applyWatermark('/tmp/doc.pdf', 'application/pdf');

    expect(PDFDocument.load).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('dispatches wordprocessingml MIME to watermarkDocx', async () => {
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'word/document.xml') {
        return makeEntry('word/document.xml', '<w:document><w:body><w:sectPr/></w:body></w:document>');
      }
      if (name === '[Content_Types].xml') {
        return makeEntry('[Content_Types].xml', '<Types></Types>');
      }
      if (name === 'word/_rels/document.xml.rels') {
        return makeEntry('word/_rels/document.xml.rels', '<Relationships></Relationships>');
      }
      return null;
    });

    await applyWatermark(
      '/tmp/doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('dispatches presentationml MIME to watermarkPptx', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark(
      '/tmp/pres.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('dispatches application/zip with .zip extension to watermarkZip', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('dispatches application/zip with .docx extension to watermarkDocx', async () => {
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'word/document.xml') {
        return makeEntry('word/document.xml', '<w:document><w:body><w:sectPr/></w:body></w:document>');
      }
      return null;
    });

    await applyWatermark('/tmp/doc.docx', 'application/zip');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('dispatches application/zip with .pptx extension to watermarkPptx', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/pres.pptx', 'application/zip');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('dispatches application/x-rar-compressed to watermarkRar', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    expect(createExtractorFromData).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it('dispatches application/vnd.rar to watermarkRar', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/vnd.rar');

    expect(createExtractorFromData).toHaveBeenCalled();
  });

  it('dispatches application/x-rar to watermarkRar', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/x-rar');

    expect(createExtractorFromData).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyWatermark — extension-based fallback
// ─────────────────────────────────────────────────────────────────────────────
describe('applyWatermark — extension fallback', () => {
  it('.rar fallback → watermarkRar', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/octet-stream');

    expect(createExtractorFromData).toHaveBeenCalled();
  });

  it('.zip fallback → watermarkZip', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/archive.zip', 'application/octet-stream');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('.pdf fallback → watermarkPdf', async () => {
    await applyWatermark('/tmp/doc.pdf', 'application/octet-stream');

    expect(PDFDocument.load).toHaveBeenCalled();
  });

  it('.docx fallback → watermarkDocx', async () => {
    admZipInstance.getEntry.mockImplementation((name) =>
      name === 'word/document.xml'
        ? makeEntry('word/document.xml', '<w:document><w:body><w:sectPr/></w:body></w:document>')
        : null,
    );

    await applyWatermark('/tmp/doc.docx', 'application/msword');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('.pptx fallback → watermarkPptx', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.ms-powerpoint');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('.jpg fallback → watermarkImage', async () => {
    await applyWatermark('/tmp/photo.jpg', 'application/octet-stream');

    expect(sharpInstance.composite).toHaveBeenCalled();
  });

  it('.jpeg fallback → watermarkImage', async () => {
    await applyWatermark('/tmp/photo.jpeg', 'application/octet-stream');

    expect(sharpInstance.composite).toHaveBeenCalled();
  });

  it('.png fallback → watermarkImage', async () => {
    await applyWatermark('/tmp/image.png', 'application/octet-stream');

    expect(sharpInstance.composite).toHaveBeenCalled();
  });

  it('unknown extension and MIME → logs debug, no writes', async () => {
    const logger = (await import('../../utils/logger.js')).default;

    await applyWatermark('/tmp/file.txt', 'text/plain');

    expect(logger.debug).toHaveBeenCalledWith(
      'applyWatermark: no handler for type',
      expect.objectContaining({ ext: '.txt' }),
    );
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkImage
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkImage', () => {
  it('scales logo to 15% of width, clamped to max 120', async () => {
    sharpInstance.metadata.mockResolvedValue({ width: 2000, height: 1000, format: 'jpeg' });

    await applyWatermark('/tmp/large.jpg', 'image/jpeg');

    expect(sharpInstance.resize).toHaveBeenCalledWith(120, null, { fit: 'inside' });
  });

  it('clamps logo to min 40 for very small images', async () => {
    sharpInstance.metadata.mockResolvedValue({ width: 100, height: 100, format: 'jpeg' });

    await applyWatermark('/tmp/small.jpg', 'image/jpeg');

    expect(sharpInstance.resize).toHaveBeenCalledWith(40, null, { fit: 'inside' });
  });

  it('writes the composited buffer to filePath', async () => {
    const outBuf = Buffer.from('composited-image');
    sharpInstance.toBuffer.mockResolvedValue(outBuf);

    await applyWatermark('/tmp/photo.jpg', 'image/jpeg');

    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/photo.jpg', outBuf);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkPdf
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkPdf', () => {
  it('calls drawImage on every page', async () => {
    const mockPage = { getSize: vi.fn().mockReturnValue({ width: 595 }), drawImage: vi.fn() };
    PDFDocument.load.mockResolvedValue({
      getPages: vi.fn().mockReturnValue([mockPage, mockPage]),
      embedPng: vi.fn().mockResolvedValue({ scale: vi.fn().mockReturnValue({ width: 50, height: 50 }) }),
      save: vi.fn().mockResolvedValue(Buffer.from('pdf')),
    });

    await applyWatermark('/tmp/doc.pdf', 'application/pdf');

    expect(mockPage.drawImage).toHaveBeenCalledTimes(2);
  });

  it('writes saved PDF bytes to filePath', async () => {
    const savedBuf = Buffer.from('saved-pdf');
    PDFDocument.load.mockResolvedValue({
      getPages: vi.fn().mockReturnValue([]),
      embedPng: vi.fn().mockResolvedValue({ scale: vi.fn().mockReturnValue({ width: 50, height: 50 }) }),
      save: vi.fn().mockResolvedValue(savedBuf),
    });

    await applyWatermark('/tmp/doc.pdf', 'application/pdf');

    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/doc.pdf', savedBuf);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkDocx
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkDocx — idempotency', () => {
  it('returns early (no writeZip) if document already has rIdHdr1', async () => {
    admZipInstance.getEntry.mockImplementation((name) =>
      name === 'word/document.xml' ? makeEntry('word/document.xml', '<w:doc>rIdHdr1</w:doc>') : null,
    );

    await applyWatermark(
      '/tmp/doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(admZipInstance.writeZip).not.toHaveBeenCalled();
  });
});

describe('watermarkDocx — XML injection', () => {
  const setupDocx = (docXml = '<w:document><w:body><w:sectPr/></w:body></w:document>') => {
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'word/document.xml') {return makeEntry('word/document.xml', docXml);}
      if (name === '[Content_Types].xml') {return makeEntry('[Content_Types].xml', '<Types></Types>');}
      if (name === 'word/_rels/document.xml.rels') {return makeEntry('word/_rels/document.xml.rels', '<Relationships></Relationships>');}
      return null;
    });
  };

  it('calls writeZip to save the archive', async () => {
    setupDocx();

    await applyWatermark(
      '/tmp/doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(admZipInstance.writeZip).toHaveBeenCalledWith('/tmp/doc.docx');
  });

  it('adds the logo PNG and header1.xml files', async () => {
    setupDocx();

    await applyWatermark(
      '/tmp/doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );

    expect(admZipInstance.addFile).toHaveBeenCalledWith('word/media/muzalife_wm.png', expect.any(Buffer));
    expect(admZipInstance.addFile).toHaveBeenCalledWith('word/header1.xml', expect.any(Buffer));
  });

  it('handles open <w:sectPr> tag (injects ref as first child)', async () => {
    setupDocx('<w:document><w:body><w:sectPr w:type="default"></w:sectPr></w:body></w:document>');

    await expect(
      applyWatermark('/tmp/doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).resolves.toBeUndefined();
    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('handles document with no sectPr (inserts one before </w:body>)', async () => {
    setupDocx('<w:document><w:body></w:body></w:document>');

    await expect(
      applyWatermark('/tmp/doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).resolves.toBeUndefined();
    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('handles missing ContentTypes entry without throwing', async () => {
    admZipInstance.getEntry.mockImplementation((name) =>
      name === 'word/document.xml'
        ? makeEntry('word/document.xml', '<w:document><w:body><w:sectPr/></w:body></w:document>')
        : null,
    );

    await expect(
      applyWatermark('/tmp/doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).resolves.toBeUndefined();
  });

  it('skips png Default entry when already present in ContentTypes', async () => {
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'word/document.xml') {return makeEntry('word/document.xml', '<w:document><w:body><w:sectPr/></w:body></w:document>');}
      if (name === '[Content_Types].xml') {return makeEntry('[Content_Types].xml', '<Types><Default Extension="png" ContentType="image/png"/></Types>');}
      return null;
    });

    await applyWatermark('/tmp/doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkPptx
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkPptx', () => {
  it('reads slide dimensions from ppt/presentation.xml', async () => {
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'ppt/presentation.xml') {return makeEntry('ppt/presentation.xml', '<p:sldSz cx="12192000" cy="6858000"/>');}
      return null;
    });
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('uses default dimensions when presentation.xml absent', async () => {
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });

  it('injects watermark into a slide xml', async () => {
    const slideEntry = makeEntry('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>');
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === '[Content_Types].xml') {return makeEntry('[Content_Types].xml', '<Types><Default Extension="png"/></Types>');}
      return null;
    });
    admZipInstance.getEntries.mockReturnValue([slideEntry]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.updateFile).toHaveBeenCalled();
  });

  it('creates a rels file when slide rels entry is absent', async () => {
    const slideEntry = makeEntry('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>');
    admZipInstance.getEntry.mockReturnValue(null);
    admZipInstance.getEntries.mockReturnValue([slideEntry]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.addFile).toHaveBeenCalledWith(
      'ppt/slides/_rels/slide1.xml.rels',
      expect.any(Buffer),
    );
  });

  it('updates existing rels file when rIdMZWM is absent', async () => {
    const slideEntry = makeEntry('ppt/slides/slide1.xml', '<p:sld><p:cSld><p:spTree></p:spTree></p:cSld></p:sld>');
    const relsEntry = makeEntry('ppt/slides/_rels/slide1.xml.rels', '<Relationships></Relationships>');
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === 'ppt/slides/_rels/slide1.xml.rels') {return relsEntry;}
      return null;
    });
    admZipInstance.getEntries.mockReturnValue([slideEntry]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.updateFile).toHaveBeenCalledWith('ppt/slides/_rels/slide1.xml.rels', expect.any(Buffer));
  });

  it('skips content types update when Extension=png already present', async () => {
    const ctEntry = makeEntry('[Content_Types].xml', '<Types><Default Extension="png" ContentType="image/png"/></Types>');
    admZipInstance.getEntry.mockImplementation((name) => {
      if (name === '[Content_Types].xml') {return ctEntry;}
      return null;
    });
    admZipInstance.getEntries.mockReturnValue([]);

    await applyWatermark('/tmp/pres.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkZip
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkZip', () => {
  it('processes a .pdf entry inside the zip', async () => {
    const pdfEntry = { entryName: 'doc.pdf', isDirectory: false, getData: vi.fn(() => Buffer.from('pdf')) };
    admZipInstance.getEntries.mockReturnValue([pdfEntry]);

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(PDFDocument.load).toHaveBeenCalled();
    expect(admZipInstance.updateFile).toHaveBeenCalled();
  });

  it('processes a .jpg entry inside the zip', async () => {
    const imgEntry = { entryName: 'photo.jpg', isDirectory: false, getData: vi.fn(() => Buffer.from('img')) };
    admZipInstance.getEntries.mockReturnValue([imgEntry]);

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(sharpInstance.composite).toHaveBeenCalled();
  });

  it('skips directory entries', async () => {
    const dirEntry = { entryName: 'docs/', isDirectory: true, getData: vi.fn() };
    admZipInstance.getEntries.mockReturnValue([dirEntry]);

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(PDFDocument.load).not.toHaveBeenCalled();
  });

  it('skips entries with unrecognised extensions', async () => {
    const txtEntry = { entryName: 'readme.txt', isDirectory: false, getData: vi.fn(() => Buffer.from('text')) };
    admZipInstance.getEntries.mockReturnValue([txtEntry]);

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(PDFDocument.load).not.toHaveBeenCalled();
    expect(sharpInstance.composite).not.toHaveBeenCalled();
  });

  it('still calls writeZip when an entry throws (finally block)', async () => {
    const pdfEntry = { entryName: 'doc.pdf', isDirectory: false, getData: vi.fn(() => Buffer.from('pdf')) };
    admZipInstance.getEntries.mockReturnValue([pdfEntry]);
    PDFDocument.load.mockRejectedValue(new Error('parse error'));

    await applyWatermark('/tmp/archive.zip', 'application/zip');

    expect(admZipInstance.writeZip).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// watermarkRar
// ─────────────────────────────────────────────────────────────────────────────
describe('watermarkRar', () => {
  it('calls createExtractorFromData with Uint8Array of file bytes', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    expect(createExtractorFromData).toHaveBeenCalledWith({ data: expect.any(Uint8Array) });
  });

  it('writes a zip buffer to the original rar path', async () => {
    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/archive.rar', expect.any(Buffer));
  });

  it('processes a pdf file extracted from RAR and adds to output zip', async () => {
    const extraction = Buffer.from('extracted-pdf');
    createExtractorFromData.mockResolvedValue({
      getFileList: vi.fn().mockReturnValue({
        fileHeaders: [{ name: 'doc.pdf', flags: { directory: false } }],
      }),
      extract: vi.fn().mockReturnValue({
        files: [{ fileHeader: { name: 'doc.pdf', flags: { directory: false } }, extraction }],
      }),
    });

    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    expect(admZipInstance.addFile).toHaveBeenCalledWith('doc.pdf', expect.any(Buffer));
  });

  it('skips files where extraction is null', async () => {
    createExtractorFromData.mockResolvedValue({
      getFileList: vi.fn().mockReturnValue({
        fileHeaders: [{ name: 'doc.pdf', flags: { directory: false } }],
      }),
      extract: vi.fn().mockReturnValue({
        files: [{ fileHeader: { name: 'doc.pdf', flags: { directory: false } }, extraction: null }],
      }),
    });

    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    expect(admZipInstance.addFile).not.toHaveBeenCalled();
  });

  it('uses original bytes when watermarking a rar entry throws', async () => {
    const extraction = Buffer.from('broken-pdf');
    createExtractorFromData.mockResolvedValue({
      getFileList: vi.fn().mockReturnValue({
        fileHeaders: [{ name: 'doc.pdf', flags: { directory: false } }],
      }),
      extract: vi.fn().mockReturnValue({
        files: [{ fileHeader: { name: 'doc.pdf', flags: { directory: false } }, extraction }],
      }),
    });
    PDFDocument.load.mockRejectedValue(new Error('corrupt'));

    await applyWatermark('/tmp/archive.rar', 'application/x-rar-compressed');

    // catch block adds original buffer
    expect(admZipInstance.addFile).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalled();
  });
});
