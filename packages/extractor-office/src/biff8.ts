import CFB from "cfb";

const REC_BOF = 0x0809;
const REC_EOF = 0x000a;
const REC_FILEPASS = 0x002f;
const REC_CONTINUE = 0x003c;
const REC_CODEPAGE = 0x0042;
const REC_BOUND_SHEET8 = 0x0085;
const REC_MULRK = 0x00bd;
const REC_RSTRING = 0x00d6;
const REC_SST = 0x00fc;
const REC_LABELSST = 0x00fd;
const REC_FORMULA = 0x0006;
const REC_NUMBER = 0x0203;
const REC_LABEL = 0x0204;
const REC_BOOLERR = 0x0205;
const REC_STRING = 0x0207;
const REC_RK = 0x027e;

export interface Biff8Sheet {
  name: string;
  rows: string[][];
}

export interface Biff8Workbook {
  sheets: Biff8Sheet[];
  truncated: boolean;
}

export interface Biff8Limits {
  maxTextChars?: number;
  maxTableRows?: number;
}

interface BiffRecord {
  type: number;
  data: Uint8Array;
  offset: number;
}

function codepageToEncoding(cp: number): string {
  switch (cp) {
    case 932:
      return "shift_jis";
    case 1258:
      return "windows-1258";
    case 1252:
      return "windows-1252";
    case 65001:
      return "utf-8";
    case 1200:
      return "utf-16le";
    default:
      return "windows-1252";
  }
}

function decodeSingleByte(bytes: Uint8Array, codepage: number): string {
  const enc = codepageToEncoding(codepage);
  try {
    return new TextDecoder(enc).decode(bytes);
  } catch {
    return Buffer.from(bytes).toString("latin1");
  }
}

function decodeUtf16Le(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf16le");
}

function readU16(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}

function readU32(buf: Uint8Array, off: number): number {
  return (
    (buf[off]! |
      (buf[off + 1]! << 8) |
      (buf[off + 2]! << 16) |
      (buf[off + 3]! << 24)) >>>
    0
  );
}

function readF64(buf: Uint8Array, off: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset + off, 8);
  return view.getFloat64(0, true);
}

function decodeRk(rk: number): number {
  const fx100 = (rk & 0x01) !== 0;
  const fInt = (rk & 0x02) !== 0;
  let value: number;
  if (fInt) {
    value = rk >> 2;
  } else {
    const tmp = new ArrayBuffer(8);
    const view = new DataView(tmp);
    view.setUint32(0, 0, true);
    view.setUint32(4, rk & 0xfffffffc, true);
    value = view.getFloat64(0, true);
  }
  return fx100 ? value / 100 : value;
}

function readRecords(stream: Uint8Array, startOffset = 0, stopOnEof = false): BiffRecord[] {
  const records: BiffRecord[] = [];
  let off = startOffset;
  let depth = 0;
  while (off + 4 <= stream.length) {
    const type = readU16(stream, off);
    const len = readU16(stream, off + 2);
    const dataStart = off + 4;
    const dataEnd = Math.min(stream.length, dataStart + len);
    records.push({ type, data: stream.subarray(dataStart, dataEnd), offset: off });
    off = dataEnd;
    if (type === REC_BOF) {
      depth += 1;
    } else if (type === REC_EOF) {
      depth -= 1;
      if (stopOnEof && depth <= 0) break;
    }
  }
  return records;
}

/**
 * Decode an Excel XLUnicodeString (2-byte char count + 1-byte flags + chars)
 * or short string (1-byte char count + 1-byte flags + chars).
 */
function readXlString(
  data: Uint8Array,
  offset: number,
  shortCount: boolean,
  codepage: number,
): string {
  if (offset + (shortCount ? 2 : 3) > data.length) return "";
  const cch = shortCount ? data[offset]! : readU16(data, offset);
  let pos = offset + (shortCount ? 1 : 2);
  const flags = data[pos++]!;
  const is16Bit = (flags & 0x01) !== 0;
  const hasExt = (flags & 0x04) !== 0;
  const hasRich = (flags & 0x08) !== 0;

  let rtCount = 0;
  let extSize = 0;
  if (hasRich && pos + 2 <= data.length) {
    rtCount = readU16(data, pos);
    pos += 2;
  }
  if (hasExt && pos + 4 <= data.length) {
    extSize = readU32(data, pos);
    pos += 4;
  }

  const byteLen = is16Bit ? cch * 2 : cch;
  const slice = data.subarray(pos, Math.min(data.length, pos + byteLen));
  void rtCount;
  void extSize;
  return is16Bit ? decodeUtf16Le(slice) : decodeSingleByte(slice, codepage);
}

/**
 * Parse SST + CONTINUE records into the shared string table.
 * Handles strings that span across CONTINUE record boundaries.
 */
function parseSst(chunks: Uint8Array[], codepage: number): string[] {
  if (chunks.length === 0 || chunks[0]!.length < 8) return [];
  const totalUnique = readU32(chunks[0]!, 4);
  const result: string[] = [];

  let chunkIdx = 0;
  let pos = 8;

  const ensureBytes = (n: number): boolean => {
    while (pos >= chunks[chunkIdx]!.length) {
      chunkIdx += 1;
      pos = 0;
      if (chunkIdx >= chunks.length) return false;
    }
    return pos + n <= chunks[chunkIdx]!.length;
  };

  const readByte = (): number => {
    ensureBytes(1);
    return chunks[chunkIdx]![pos++]!;
  };

  const readUint16 = (): number => {
    const b0 = readByte();
    const b1 = readByte();
    return b0 | (b1 << 8);
  };

  const readUint32 = (): number => {
    const b0 = readByte();
    const b1 = readByte();
    const b2 = readByte();
    const b3 = readByte();
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
  };

  const skipBytes = (count: number): void => {
    let rem = count;
    while (rem > 0 && chunkIdx < chunks.length) {
      const avail = chunks[chunkIdx]!.length - pos;
      if (avail <= 0) {
        chunkIdx += 1;
        pos = 0;
        continue;
      }
      const step = Math.min(rem, avail);
      pos += step;
      rem -= step;
    }
  };

  for (let i = 0; i < totalUnique; i++) {
    if (!ensureBytes(3)) break;
    const cch = readUint16();
    const flags = readByte();
    let is16Bit = (flags & 0x01) !== 0;
    const hasExt = (flags & 0x04) !== 0;
    const hasRich = (flags & 0x08) !== 0;
    const rtCount = hasRich ? readUint16() : 0;
    const extSize = hasExt ? readUint32() : 0;

    let remainingChars = cch;
    const parts: string[] = [];
    while (remainingChars > 0 && chunkIdx < chunks.length) {
      if (pos >= chunks[chunkIdx]!.length) {
        chunkIdx += 1;
        pos = 0;
        if (chunkIdx >= chunks.length) break;
        // CONTINUE record begins with 1-byte grbit flag (bit 0 = 16-bit)
        const contFlags = chunks[chunkIdx]![pos++]!;
        is16Bit = (contFlags & 0x01) !== 0;
      }
      const bytesPerChar = is16Bit ? 2 : 1;
      const availChars = Math.floor((chunks[chunkIdx]!.length - pos) / bytesPerChar);
      if (availChars <= 0) {
        chunkIdx += 1;
        pos = 0;
        continue;
      }
      const takeChars = Math.min(remainingChars, availChars);
      const takeBytes = takeChars * bytesPerChar;
      const slice = chunks[chunkIdx]!.subarray(pos, pos + takeBytes);
      parts.push(is16Bit ? decodeUtf16Le(slice) : decodeSingleByte(slice, codepage));
      pos += takeBytes;
      remainingChars -= takeChars;
    }

    if (rtCount > 0) skipBytes(rtCount * 4);
    if (extSize > 0) skipBytes(extSize);
    result.push(parts.join(""));
  }

  return result;
}

function formatCellNumber(val: number): string {
  if (!Number.isFinite(val)) return "";
  if (Number.isInteger(val)) return String(val);
  return String(Number(val.toPrecision(12)));
}

/**
 * Parse a legacy binary `.xls` (OLE2 BIFF8) workbook into sheets of string grids.
 */
export function parseBiff8Workbook(
  bytes: Uint8Array,
  limits: Biff8Limits = {},
): Biff8Workbook {
  const maxTextChars = limits.maxTextChars ?? Number.POSITIVE_INFINITY;
  const maxTableRows = limits.maxTableRows ?? Number.POSITIVE_INFINITY;

  const container = CFB.read(bytes, { type: "buffer" });
  const wbEntry = CFB.find(container, "/Workbook") ?? CFB.find(container, "/Book");
  if (!wbEntry || !wbEntry.content) {
    throw new Error("No Excel Workbook stream found in OLE2 container.");
  }

  const stream =
    wbEntry.content instanceof Uint8Array
      ? wbEntry.content
      : new Uint8Array(wbEntry.content);

  const globalRecords = readRecords(stream, 0, true);
  if (globalRecords.length === 0 || globalRecords[0]!.type !== REC_BOF) {
    throw new Error("Invalid BIFF workbook header.");
  }

  let codepage = 1252;
  const boundSheets: Array<{ name: string; bofOffset: number }> = [];
  let sstChunks: Uint8Array[] = [];
  let collectingSst = false;

  for (const rec of globalRecords) {
    if (rec.type === REC_FILEPASS) {
      throw new Error("Workbook is password-protected / encrypted.");
    }
    if (rec.type !== REC_CONTINUE) collectingSst = false;

    switch (rec.type) {
      case REC_CODEPAGE:
        if (rec.data.length >= 2) codepage = readU16(rec.data, 0);
        break;
      case REC_BOUND_SHEET8:
        if (rec.data.length >= 8) {
          const bofOffset = readU32(rec.data, 0);
          const name = readXlString(rec.data, 6, true, codepage).trim() || "Sheet";
          boundSheets.push({ name, bofOffset });
        }
        break;
      case REC_SST:
        sstChunks = [rec.data];
        collectingSst = true;
        break;
      case REC_CONTINUE:
        if (collectingSst) sstChunks.push(rec.data);
        break;
    }
  }

  const sst = parseSst(sstChunks, codepage);
  const sheets: Biff8Sheet[] = [];
  let totalRows = 0;
  let totalChars = 0;
  let truncated = false;

  for (const meta of boundSheets) {
    if (totalRows >= maxTableRows || totalChars >= maxTextChars) {
      truncated = true;
      break;
    }
    const recs = readRecords(stream, meta.bofOffset, true);
    const grid = new Map<number, Map<number, string>>();
    let maxRow = -1;
    let maxCol = -1;
    let pendingFormulaCell: { row: number; col: number } | null = null;

    const setCell = (row: number, col: number, value: string): void => {
      if (row >= maxTableRows) {
        truncated = true;
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) return;
      let rowMap = grid.get(row);
      if (!rowMap) {
        if (totalRows + grid.size >= maxTableRows) {
          truncated = true;
          return;
        }
        rowMap = new Map<number, string>();
        grid.set(row, rowMap);
      }
      rowMap.set(col, trimmed);
      if (row > maxRow) maxRow = row;
      if (col > maxCol) maxCol = col;
      totalChars += trimmed.length + 1;
      if (totalChars >= maxTextChars) truncated = true;
    };

    for (const rec of recs) {
      if (totalChars >= maxTextChars) {
        truncated = true;
        break;
      }
      if (rec.type !== REC_STRING) pendingFormulaCell = null;

      switch (rec.type) {
        case REC_LABELSST:
          if (rec.data.length >= 10) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            const idx = readU32(rec.data, 6);
            setCell(row, col, sst[idx] ?? "");
          }
          break;
        case REC_LABEL:
        case REC_RSTRING:
          if (rec.data.length >= 9) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            setCell(row, col, readXlString(rec.data, 6, false, codepage));
          }
          break;
        case REC_NUMBER:
          if (rec.data.length >= 14) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            setCell(row, col, formatCellNumber(readF64(rec.data, 6)));
          }
          break;
        case REC_RK:
          if (rec.data.length >= 10) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            const rk = new DataView(
              rec.data.buffer,
              rec.data.byteOffset + 6,
              4,
            ).getInt32(0, true);
            setCell(row, col, formatCellNumber(decodeRk(rk)));
          }
          break;
        case REC_MULRK:
          if (rec.data.length >= 10) {
            const row = readU16(rec.data, 0);
            const colFirst = readU16(rec.data, 2);
            const colLast = readU16(rec.data, rec.data.length - 2);
            for (let c = colFirst; c <= colLast; c++) {
              const off = 4 + (c - colFirst) * 6;
              if (off + 6 > rec.data.length - 2) break;
              const rk = new DataView(
                rec.data.buffer,
                rec.data.byteOffset + off + 2,
                4,
              ).getInt32(0, true);
              setCell(row, c, formatCellNumber(decodeRk(rk)));
            }
          }
          break;
        case REC_BOOLERR:
          if (rec.data.length >= 8) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            const val = rec.data[6]!;
            const isErr = rec.data[7]! !== 0;
            if (!isErr) setCell(row, col, val ? "TRUE" : "FALSE");
          }
          break;
        case REC_FORMULA:
          if (rec.data.length >= 14) {
            const row = readU16(rec.data, 0);
            const col = readU16(rec.data, 2);
            const isSpecial = rec.data[12] === 0xff && rec.data[13] === 0xff;
            if (!isSpecial) {
              setCell(row, col, formatCellNumber(readF64(rec.data, 6)));
            } else {
              const kind = rec.data[6]!;
              if (kind === 0x00) {
                pendingFormulaCell = { row, col };
              } else if (kind === 0x01) {
                setCell(row, col, rec.data[8]! ? "TRUE" : "FALSE");
              }
            }
          }
          break;
        case REC_STRING:
          if (pendingFormulaCell) {
            setCell(
              pendingFormulaCell.row,
              pendingFormulaCell.col,
              readXlString(rec.data, 0, false, codepage),
            );
            pendingFormulaCell = null;
          }
          break;
      }
    }

    const rows: string[][] = [];
    if (maxRow >= 0 && maxCol >= 0) {
      for (let r = 0; r <= maxRow; r++) {
        const rowMap = grid.get(r);
        if (!rowMap) continue;
        const arr: string[] = [];
        for (let c = 0; c <= maxCol; c++) {
          arr.push(rowMap.get(c) ?? "");
        }
        if (arr.some((cell) => cell.length > 0)) {
          rows.push(arr);
          totalRows += 1;
        }
      }
    }
    if (rows.length > 0) sheets.push({ name: meta.name, rows });
  }

  return { sheets, truncated };
}
