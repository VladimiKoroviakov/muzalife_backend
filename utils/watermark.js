/**
 * @file Watermark utility — composites the Muzalife logo onto image, PDF,
 * Office-document, and archive files in-place.  Unsupported types are silently
 * skipped.
 *
 * Only call this for admin-uploaded downloadable materials (product files and
 * personal-order files).  Never call it for product display images or profile
 * avatars.
 */

import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import AdmZip from 'adm-zip';
import { createExtractorFromData } from 'node-unrar-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, 'assets', 'watermark-logo.png');
const PADDING = 20;

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);

const RAR_MIMES = new Set([
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-rar',
]);

/** Map file extensions (lower-case, with dot) to MIME types used for dispatch. */
const EXT_TO_MIME = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.pdf':  'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ── Image ─────────────────────────────────────────────────────────────────────

/**
 * Composites the Muzalife logo onto a JPEG or PNG image file (bottom-right).
 * The logo is scaled to ~15 % of the image width, clamped between 40–120 px.
 * @param {string} filePath - Absolute path to the image file on disk.
 * @returns {Promise<void>}
 */
async function watermarkImage(filePath) {
  const src = sharp(filePath);
  const meta = await src.metadata();

  const targetWidth = Math.max(40, Math.min(120, Math.round(meta.width * 0.15)));

  const logoBuffer = await sharp(LOGO_PATH)
    .resize(targetWidth, null, { fit: 'inside' })
    .toBuffer();

  const logoMeta = await sharp(logoBuffer).metadata();

  const left = meta.width  - logoMeta.width  - PADDING;
  const top  = meta.height - logoMeta.height - PADDING;

  const output = await sharp(filePath)
    .composite([{ input: logoBuffer, left, top }])
    .toFormat(meta.format)
    .toBuffer();

  fs.writeFileSync(filePath, output);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Embeds the Muzalife logo on every page of a PDF file (bottom-right, 70 % opacity).
 * @param {string} filePath - Absolute path to the PDF file on disk.
 * @returns {Promise<void>}
 */
async function watermarkPdf(filePath) {
  const pdfBytes  = fs.readFileSync(filePath);
  const pdfDoc    = await PDFDocument.load(pdfBytes);
  const logoBytes = fs.readFileSync(LOGO_PATH);
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const logoDims  = logoImage.scale(0.5);

  for (const page of pdfDoc.getPages()) {
    const { width } = page.getSize();
    page.drawImage(logoImage, {
      x:       width  - logoDims.width  - PADDING,
      y:       PADDING,
      width:   logoDims.width,
      height:  logoDims.height,
      opacity: 0.7,
    });
  }

  fs.writeFileSync(filePath, await pdfDoc.save());
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

/**
 * Injects the Muzalife logo into a DOCX file as an inline image at the end of
 * the document body (right-aligned paragraph).  Uses OOXML string injection —
 * no external XML library required.
 * @param {string} filePath - Absolute path to the DOCX file on disk.
 * @returns {Promise<void>}
 */
async function watermarkDocx(filePath) {
  const zip = new AdmZip(filePath);

  // 1. Embed logo
  const logoBytes = fs.readFileSync(LOGO_PATH);
  zip.addFile('word/media/muzalife_wm.png', logoBytes);

  // 2. [Content_Types].xml — add PNG Default if missing
  const ctEntry = zip.getEntry('[Content_Types].xml');
  if (ctEntry) {
    let ct = ctEntry.getData().toString('utf8');
    if (!ct.includes('Extension="png"')) {
      ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
      zip.updateFile('[Content_Types].xml', Buffer.from(ct, 'utf8'));
    }
  }

  // 3. word/_rels/document.xml.rels — add image relationship
  const relsEntry = zip.getEntry('word/_rels/document.xml.rels');
  if (relsEntry) {
    let rels = relsEntry.getData().toString('utf8');
    if (!rels.includes('rIdMZWM')) {
      rels = rels.replace(
        '</Relationships>',
        '<Relationship Id="rIdMZWM" ' +
          'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ' +
          'Target="media/muzalife_wm.png"/>' +
        '</Relationships>',
      );
      zip.updateFile('word/_rels/document.xml.rels', Buffer.from(rels, 'utf8'));
    }
  }

  // 4. word/document.xml — append watermark paragraph before </w:body>
  const docEntry = zip.getEntry('word/document.xml');
  if (docEntry) {
    let doc = docEntry.getData().toString('utf8');
    if (!doc.includes('rIdMZWM')) {
      const wmParagraph =
        '<w:p>' +
          '<w:pPr><w:jc w:val="right"/></w:pPr>' +
          '<w:r>' +
            '<w:drawing>' +
              '<wp:inline distT="0" distB="0" distL="0" distR="0"' +
                ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
                '<wp:extent cx="685800" cy="514350"/>' +
                '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
                '<wp:docPr id="9999" name="Muzalife Watermark"/>' +
                '<wp:cNvGraphicFramePr>' +
                  '<a:graphicFrameLocks' +
                    ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
                    ' noChangeAspect="1"/>' +
                '</wp:cNvGraphicFramePr>' +
                '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
                  '<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
                      '<pic:nvPicPr>' +
                        '<pic:cNvPr id="9998" name="Muzalife Watermark"/>' +
                        '<pic:cNvPicPr/>' +
                      '</pic:nvPicPr>' +
                      '<pic:blipFill>' +
                        '<a:blip r:embed="rIdMZWM"' +
                          ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>' +
                        '<a:stretch><a:fillRect/></a:stretch>' +
                      '</pic:blipFill>' +
                      '<pic:spPr>' +
                        '<a:xfrm>' +
                          '<a:off x="0" y="0"/>' +
                          '<a:ext cx="685800" cy="514350"/>' +
                        '</a:xfrm>' +
                        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
                      '</pic:spPr>' +
                    '</pic:pic>' +
                  '</a:graphicData>' +
                '</a:graphic>' +
              '</wp:inline>' +
            '</w:drawing>' +
          '</w:r>' +
        '</w:p>';
      doc = doc.replace('</w:body>', `${wmParagraph  }</w:body>`);
      zip.updateFile('word/document.xml', Buffer.from(doc, 'utf8'));
    }
  }

  zip.writeZip(filePath);
}

// ── PPTX ──────────────────────────────────────────────────────────────────────

/**
 * Injects the Muzalife logo onto every slide of a PPTX file (bottom-right).
 * Uses OOXML string injection into each slide's XML.
 * @param {string} filePath - Absolute path to the PPTX file on disk.
 * @returns {Promise<void>}
 */
async function watermarkPptx(filePath) {
  const zip = new AdmZip(filePath);

  // 1. Embed logo
  const logoBytes = fs.readFileSync(LOGO_PATH);
  zip.addFile('ppt/media/muzalife_wm.png', logoBytes);

  // 2. [Content_Types].xml — add PNG Default if missing
  const ctEntry = zip.getEntry('[Content_Types].xml');
  if (ctEntry) {
    let ct = ctEntry.getData().toString('utf8');
    if (!ct.includes('Extension="png"')) {
      ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
      zip.updateFile('[Content_Types].xml', Buffer.from(ct, 'utf8'));
    }
  }

  const picXml =
    '<p:pic' +
      ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<p:nvPicPr>' +
        '<p:cNvPr id="9999" name="Muzalife Watermark"/>' +
        '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>' +
        '<p:nvPr/>' +
      '</p:nvPicPr>' +
      '<p:blipFill>' +
        '<a:blip r:embed="rIdMZWM"/>' +
        '<a:stretch><a:fillRect/></a:stretch>' +
      '</p:blipFill>' +
      '<p:spPr>' +
        '<a:xfrm>' +
          '<a:off x="8229600" y="6172200"/>' +
          '<a:ext cx="685800" cy="514350"/>' +
        '</a:xfrm>' +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
      '</p:spPr>' +
    '</p:pic>';

  const relEntry =
    '<Relationship Id="rIdMZWM"' +
      ' Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"' +
      ' Target="../media/muzalife_wm.png"/>';

  // 3. Process each slide
  for (const entry of zip.getEntries()) {
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(entry.entryName)) {continue;}

    // Inject picture into slide spTree
    let slide = entry.getData().toString('utf8');
    if (!slide.includes('rIdMZWM')) {
      slide = slide.replace('</p:spTree>', `${picXml  }</p:spTree>`);
      zip.updateFile(entry.entryName, Buffer.from(slide, 'utf8'));
    }

    // Inject relationship into slide rels
    const relsName = entry.entryName.replace(
      /^ppt\/slides\/(slide\d+\.xml)$/,
      'ppt/slides/_rels/$1.rels',
    );
    const relsEntry = zip.getEntry(relsName);
    if (relsEntry) {
      let rels = relsEntry.getData().toString('utf8');
      if (!rels.includes('rIdMZWM')) {
        rels = rels.replace('</Relationships>', `${relEntry  }</Relationships>`);
        zip.updateFile(relsName, Buffer.from(rels, 'utf8'));
      }
    }
  }

  zip.writeZip(filePath);
}

// ── Archive helpers ───────────────────────────────────────────────────────────

/**
 * Dispatches watermarking for a single file extracted from an archive.
 * @param {string} tmpPath - Absolute path to the temporary extracted file.
 * @param {string} ext     - Lower-case file extension including the dot.
 * @returns {Promise<void>}
 */
async function watermarkArchiveEntry(tmpPath, ext) {
  const mime = EXT_TO_MIME[ext];
  if (!mime) {return;}
  if (IMAGE_MIMES.has(mime))                              {await watermarkImage(tmpPath);}
  else if (mime === 'application/pdf')                    {await watermarkPdf(tmpPath);}
  else if (mime.includes('wordprocessingml.document'))    {await watermarkDocx(tmpPath);}
  else if (mime.includes('presentationml.presentation'))  {await watermarkPptx(tmpPath);}
}

/**
 * Extracts every entry from a ZIP archive, watermarks each known file type,
 * and repacks the archive in-place.
 * @param {string} filePath - Absolute path to the ZIP file on disk.
 * @returns {Promise<void>}
 */
async function watermarkZip(filePath) {
  const zip = new AdmZip(filePath);

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {continue;}
    const ext = path.extname(entry.entryName).toLowerCase();
    if (!EXT_TO_MIME[ext]) {continue;}

    const tmp = path.join(tmpdir(), `mzwm-${Date.now()}-${path.basename(entry.entryName)}`);
    try {
      fs.writeFileSync(tmp, entry.getData());
      await watermarkArchiveEntry(tmp, ext);
      zip.updateFile(entry.entryName, fs.readFileSync(tmp));
    } catch {
      // skip unprocessable entry; continue with remaining entries
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  zip.writeZip(filePath);
}

/**
 * Extracts every entry from a RAR archive using WebAssembly unrar, watermarks
 * each known file type, and repacks the contents as a ZIP written to the
 * original file path (keeping the .rar extension, ZIP bytes inside).
 * @param {string} filePath - Absolute path to the RAR file on disk.
 * @returns {Promise<void>}
 */
async function watermarkRar(filePath) {
  const data      = new Uint8Array(fs.readFileSync(filePath));
  const extractor = await createExtractorFromData({ data });

  const list    = extractor.getFileList();
  const headers = [...list.fileHeaders].filter((h) => !h.flags.directory);

  const extracted = extractor.extract({ files: headers.map((h) => h.name) });

  const outZip = new AdmZip();

  for (const file of [...extracted.files]) {
    if (file.fileHeader.flags.directory || !file.extraction) {continue;}
    const name = file.fileHeader.name;
    const ext  = path.extname(name).toLowerCase();
    const buf  = Buffer.from(file.extraction);
    const tmp  = path.join(tmpdir(), `mzwm-rar-${Date.now()}-${path.basename(name)}`);
    try {
      fs.writeFileSync(tmp, buf);
      await watermarkArchiveEntry(tmp, ext);
      outZip.addFile(name, fs.readFileSync(tmp));
    } catch {
      outZip.addFile(name, buf); // include original entry without watermark
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }

  fs.writeFileSync(filePath, outZip.toBuffer());
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Applies the Muzalife watermark to a file based on its MIME type.
 * Images, PDFs, Office documents, and archives are processed in-place;
 * all other types are no-ops.
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {string} mimetype - MIME type reported by multer (e.g. 'image/jpeg').
 * @returns {Promise<void>}
 */
export async function applyWatermark(filePath, mimetype) {
  if (IMAGE_MIMES.has(mimetype)) {
    await watermarkImage(filePath);
  } else if (mimetype === 'application/pdf') {
    await watermarkPdf(filePath);
  } else if (mimetype === 'application/zip' || mimetype === 'application/x-zip-compressed') {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.docx')      { await watermarkDocx(filePath); }
    else if (ext === '.pptx') { await watermarkPptx(filePath); }
    else                      { await watermarkZip(filePath); }
  } else if (RAR_MIMES.has(mimetype)) {
    await watermarkRar(filePath);
  } else if (mimetype.includes('wordprocessingml.document')) {
    await watermarkDocx(filePath);
  } else if (mimetype.includes('presentationml.presentation')) {
    await watermarkPptx(filePath);
  } else if (mimetype === 'application/octet-stream') {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.rar')                      { await watermarkRar(filePath); }
    else if (ext === '.zip')                 { await watermarkZip(filePath); }
    else if (ext === '.pdf')                 { await watermarkPdf(filePath); }
    else if (ext === '.docx')                { await watermarkDocx(filePath); }
    else if (ext === '.pptx')                { await watermarkPptx(filePath); }
    else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') { await watermarkImage(filePath); }
  }
}
