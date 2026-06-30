import { File } from 'expo-file-system';

export type ReadStatementResult = {
  text: string;
  extension: string;
  mimeType: string | null;
  buffer: ArrayBuffer;
};

/** ISO-8859-9 / Windows-1254 Türkçe bayt eşlemesi (RN TextDecoder iso-8859-9 desteklemez) */
const TR_BYTE_MAP: Record<number, string> = {
  0xd0: '\u011E', // Ğ
  0xdd: '\u0130', // İ
  0xde: '\u015E', // Ş
  0xf0: '\u011F', // ğ
  0xfd: '\u0131', // ı
  0xfe: '\u015F', // ş
};

function byteToChar(byte: number): string {
  return TR_BYTE_MAP[byte] ?? String.fromCharCode(byte);
}

/** Latin / ISO-8859-9 / Windows-1254 tek bayt metin */
export function decodeLatinTurkishBytes(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += byteToChar(bytes[i]);
  }
  return out;
}

function decodeUtf8Bytes(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  } catch {
    return decodeLatinTurkishBytes(buffer);
  }
}

/** UTF-8 veya Türkçe tek bayt kodlamayı otomatik seçer */
export function decodeBytesAsText(buffer: ArrayBuffer): string {
  const utf8 = decodeUtf8Bytes(buffer);
  const replacementCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCount === 0) return utf8;

  const latin = decodeLatinTurkishBytes(buffer);
  const turkishHint = /[ğüşıöçĞÜŞİÖÇ]/.test(latin);
  if (turkishHint || replacementCount > 2) return latin;
  return utf8;
}

function extensionFromName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return '';
  return fileName.slice(i + 1).toLowerCase();
}

/** Expo SDK 54+ File API — desteklenmeyen encoding hatası olmadan okur */
export async function readStatementFile(uri: string, fileName: string): Promise<ReadStatementResult> {
  const extension = extensionFromName(fileName);
  const file = new File(uri);
  const buf = await file.arrayBuffer();

  const isBinary = extension === 'pdf' || extension === 'xlsx' || extension === 'xls';
  const text = isBinary
    ? extension === 'pdf'
      ? extractPdfText(buf)
      : decodeUtf8Bytes(buf)
    : decodeBytesAsText(buf);

  return { text, extension, mimeType: guessMime(extension), buffer: buf };
}

function guessMime(ext: string): string | null {
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'xml') return 'application/xml';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'txt' || ext === '940') return 'text/plain';
  return null;
}

function unescapePdfLiteral(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

function decodePdfHex(hex: string): string {
  let out = '';
  const clean = hex.replace(/\s/g, '');
  for (let i = 0; i < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (Number.isFinite(code)) out += String.fromCharCode(code);
  }
  return out;
}

function bytesToLatinString(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

/** Dijital PDF'lerden gömülü metin çıkarır (OCR değil) */
export function extractPdfText(buffer: ArrayBuffer): string {
  const raw = bytesToLatinString(buffer);
  const chunks: string[] = [];

  const literalRe = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = literalRe.exec(raw)) !== null) {
    const inner = m[0].replace(/\)\s*Tj\s*$/i, '').slice(1);
    const t = unescapePdfLiteral(inner).trim();
    if (t.length >= 2) chunks.push(t);
  }

  const hexRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((m = hexRe.exec(raw)) !== null) {
    const t = decodePdfHex(m[1]).trim();
    if (t.length >= 2) chunks.push(t);
  }

  const streamText = raw
    .replace(/[^\x20-\x7E\u00C0-\u024F\n\r\t]/g, ' ')
    .replace(/\s+/g, ' ');
  if (chunks.length < 5 && streamText.length > 80) {
    chunks.push(streamText);
  }

  return chunks.join('\n');
}
