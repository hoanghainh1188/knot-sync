import CFB from "cfb";
import ExcelJS from "exceljs";

/** Minimal ZIP writer using store (method 0) only — enough for tiny OOXML fixtures. */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function zipFiles(files: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const crc = crc32(data);
    const method = 0; // store

    const local = Buffer.alloc(30 + nameBuf.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    data.copy(local, 30 + nameBuf.length);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const localPart = Buffer.concat(locals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centrals.length, 8);
  end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localPart, centralDir, end]);
}

export async function buildXlsx(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  for (const row of rows) sheet.addRow(row);
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** XLSX with a white-on-white cell for guardHiddenText tests. */
export async function buildXlsxWithHiddenText(hidden: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  sheet.addRow(["visible", "secret"]);
  const cell = sheet.getCell(1, 2);
  cell.value = hidden;
  cell.font = { color: { argb: "FFFFFFFF" }, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFFFF" },
  };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export function buildDocx(paragraph: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${escapeXml(paragraph)}</w:t></w:r></w:p></w:body>
</w:document>`;
  return zipFiles({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": documentXml,
  });
}

export function buildSimplePdf(text: string): Buffer {
  // Minimal one-page PDF with a single text string (Helvetica).
  const content = `BT /F1 12 Tf 72 720 Td (${escapePdf(text)}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${Buffer.byteLength(content)} >>stream\n${content}\nendstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body));
    body += obj;
  }
  const xrefStart = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "utf8");
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapePdf(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function biffRec(type: number, payload: Buffer): Buffer {
  const hdr = Buffer.alloc(4);
  hdr.writeUInt16LE(type, 0);
  hdr.writeUInt16LE(payload.length, 2);
  return Buffer.concat([hdr, payload]);
}

function biffBof(substreamType: number): Buffer {
  const p = Buffer.alloc(16);
  p.writeUInt16LE(0x0600, 0); // BIFF8
  p.writeUInt16LE(substreamType, 2);
  return biffRec(0x0809, p);
}

/** Build a valid legacy binary `.xls` (OLE2 BIFF8) fixture for tests. */
export function buildXls(
  rows: (string | number)[][],
  options: { sheetName?: string; encrypted?: boolean } = {},
): Buffer {
  const sheetName = options.sheetName ?? "Sheet1";
  const uniqueStrings: string[] = [];
  const strIndex = new Map<string, number>();
  let totalRefs = 0;

  for (const r of rows) {
    for (const cell of r) {
      if (typeof cell === "string") {
        totalRefs += 1;
        if (!strIndex.has(cell)) {
          strIndex.set(cell, uniqueStrings.length);
          uniqueStrings.push(cell);
        }
      }
    }
  }

  const globalsHead: Buffer[] = [biffBof(0x0005)];
  if (options.encrypted) {
    globalsHead.push(biffRec(0x002f, Buffer.alloc(6)));
  }
  const cpPayload = Buffer.alloc(2);
  cpPayload.writeUInt16LE(1200, 0);
  globalsHead.push(biffRec(0x0042, cpPayload));

  // Build SST record
  const sstParts: Buffer[] = [Buffer.alloc(8)];
  sstParts[0]!.writeUInt32LE(totalRefs, 0);
  sstParts[0]!.writeUInt32LE(uniqueStrings.length, 4);
  for (const s of uniqueStrings) {
    const utf16 = Buffer.from(s, "utf16le");
    const hdr = Buffer.alloc(3);
    hdr.writeUInt16LE(s.length, 0);
    hdr.writeUInt8(0x01, 2); // UTF-16LE
    sstParts.push(hdr, utf16);
  }
  const sstRec = biffRec(0x00fc, Buffer.concat(sstParts));

  // BOUND_SHEET8 payload (offset patched after globals length is known)
  const sheetNameBytes = Buffer.from(sheetName, "utf16le");
  const bsPayload = Buffer.alloc(8 + sheetNameBytes.length);
  bsPayload.writeUInt16LE(0, 4);
  bsPayload.writeUInt8(sheetName.length, 6);
  bsPayload.writeUInt8(0x01, 7); // UTF-16LE
  sheetNameBytes.copy(bsPayload, 8);

  const eofRec = biffRec(0x000a, Buffer.alloc(0));
  const globalsBytes = Buffer.concat([
    ...globalsHead,
    biffRec(0x0085, bsPayload),
    sstRec,
    eofRec,
  ]);
  // Patch BOF offset into BOUND_SHEET8 record
  const bsOffsetInGlobals =
    Buffer.concat(globalsHead).length + 4; // +4 for BOUND_SHEET8 record header
  globalsBytes.writeUInt32LE(globalsBytes.length, bsOffsetInGlobals);

  const sheetRecs: Buffer[] = [biffBof(0x0010)];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]!;
    for (let c = 0; c < row.length; c++) {
      const val = row[c]!;
      if (typeof val === "string") {
        const p = Buffer.alloc(10);
        p.writeUInt16LE(r, 0);
        p.writeUInt16LE(c, 2);
        p.writeUInt32LE(strIndex.get(val)!, 6);
        sheetRecs.push(biffRec(0x00fd, p)); // LABELSST
      } else {
        const p = Buffer.alloc(14);
        p.writeUInt16LE(r, 0);
        p.writeUInt16LE(c, 2);
        p.writeDoubleLE(val, 6);
        sheetRecs.push(biffRec(0x0203, p)); // NUMBER
      }
    }
  }
  sheetRecs.push(eofRec);

  const workbook = Buffer.concat([globalsBytes, ...sheetRecs]);
  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "Workbook", workbook);
  return Buffer.from(CFB.write(container, { type: "buffer" }) as Uint8Array);
}

/** Build a valid legacy binary `.doc` (Word 97-2003 OLE2) fixture for tests. */
export function buildDoc(text: string): Buffer {
  const fcMin = 0x0400;
  const textBuf = Buffer.from(text, "utf16le");
  const wordDoc = Buffer.alloc(fcMin + textBuf.length + 16);
  wordDoc.writeUInt16LE(0xa5ec, 0x0000); // FIB magic
  wordDoc.writeUInt16LE(0x0200, 0x000a); // fWhichTblStm = 1Table
  wordDoc.writeUInt32LE(fcMin, 0x0018); // fcMin
  wordDoc.writeUInt32LE(text.length, 0x004c); // ccpText
  wordDoc.writeUInt32LE(0, 0x01a2); // fcClx = 0 in 1Table
  textBuf.copy(wordDoc, fcMin);

  // 1Table with Pcdt (flag 0x02) + 1 piece pointing to fcMin (Unicode)
  const table = Buffer.alloc(21);
  table.writeUInt8(0x02, 0); // Pcdt
  table.writeUInt32LE(16, 1); // pieceTableSize -> (16 - 4) / 12 = 1 piece
  table.writeUInt32LE(0, 5); // cp[0] = 0
  table.writeUInt32LE(text.length, 9); // cp[1] = text.length
  table.writeUInt16LE(0, 13); // PCD flags
  table.writeUInt32LE(fcMin, 15); // fc (bit 30 clear = UTF-16LE)
  table.writeUInt16LE(0, 19); // prm

  const container = CFB.utils.cfb_new();
  CFB.utils.cfb_add(container, "WordDocument", wordDoc);
  CFB.utils.cfb_add(container, "1Table", table);
  return Buffer.from(CFB.write(container, { type: "buffer" }) as Uint8Array);
}
