import type { BankCode, BankStatementFormat, ParsedBankStatement } from '@/lib/bankStatement/types';
import type { TabularColumnMap } from '@/lib/bankStatement/columnMap';
import { detectBankFromContent, detectFileFormatFromContent, detectFileFormatFromName } from '@/lib/bankStatement/bankDetect';
import { parseBankCsv, looksLikeTabularText } from '@/lib/bankStatement/csvParse';
import { parseMt940, looksLikeMt940 } from '@/lib/bankStatement/mt940Parse';
import { parseBankXml, looksLikeBankXml } from '@/lib/bankStatement/xmlParse';
import { parsePdfBankText } from '@/lib/bankStatement/pdfHeuristicParse';
import { parseExcelBuffer } from '@/lib/bankStatement/excelParse';
import { readStatementFile } from '@/lib/bankStatement/readFile';
import type { TabularParseResult } from '@/lib/bankStatement/tabularParse';

export type ParseStatementResult = ParsedBankStatement & {
  detectedBank: BankCode;
  headers?: string[];
  columnMap?: TabularColumnMap;
  needsColumnMapping?: boolean;
  rawUri?: string;
};

export async function parseBankStatementFromUri(
  uri: string,
  fileName: string,
  bankCode: BankCode,
  userColumnMap?: TabularColumnMap
): Promise<ParseStatementResult> {
  const { text, extension, buffer } = await readStatementFile(uri, fileName);
  const detectedBank = bankCode === 'other' ? detectBankFromContent(fileName, text) : bankCode;
  const format = detectFileFormatFromContent(text, extension || detectFileFormatFromName(fileName)) as BankStatementFormat;

  if (extension === 'xlsx' || extension === 'xls') {
    const excel = parseExcelBuffer(buffer, detectedBank, userColumnMap);
    return wrapTabular(excel, detectedBank, uri);
  }

  if (extension === 'pdf' || format === 'pdf') {
    const pdf = parsePdfBankText(text, detectedBank);
    if (pdf.lines.length > 0) return { ...pdf, detectedBank: detectBankFromContent(fileName, text) };
    const tabular = parseBankCsv(text, detectedBank, userColumnMap);
    if (tabular.lines.length > 0 || tabular.needsColumnMapping) return wrapTabular({ ...tabular, format: 'pdf' }, detectedBank, uri);
  }

  if (extension === 'xml' || looksLikeBankXml(text)) {
    const xml = parseBankXml(text, detectedBank);
    if (xml.lines.length > 0) return { ...xml, detectedBank: detectBankFromContent(fileName, text) };
  }

  return detectAndParseBankStatement(text, detectedBank, extension, userColumnMap, uri);
}

export function detectAndParseBankStatement(
  content: string,
  bankCode: BankCode,
  extension?: string,
  userColumnMap?: TabularColumnMap,
  rawUri?: string
): ParseStatementResult {
  const detectedBank = detectBankFromContent('', content) !== 'other' && bankCode === 'other'
    ? detectBankFromContent('', content)
    : bankCode;

  if (looksLikeMt940(content)) {
    return { ...parseMt940(content, detectedBank), detectedBank };
  }
  if (looksLikeBankXml(content)) {
    return { ...parseBankXml(content, detectedBank), detectedBank };
  }

  const isTabular =
    extension === 'csv' ||
    extension === 'txt' ||
    extension === 'xlsx' ||
    looksLikeTabularText(content);

  if (isTabular) {
    const tabular = parseBankCsv(content, detectedBank, userColumnMap);
    const fmt: BankStatementFormat =
      extension === 'txt' ? 'txt' : extension === 'csv' ? 'csv' : tabular.format;
    return wrapTabular({ ...tabular, format: fmt }, detectedBank, rawUri);
  }

  const mt = parseMt940(content, detectedBank);
  if (mt.lines.length > 0) return { ...mt, detectedBank };

  const xml = parseBankXml(content, detectedBank);
  if (xml.lines.length > 0) return { ...xml, detectedBank };

  const csv = parseBankCsv(content, detectedBank, userColumnMap);
  if (csv.lines.length > 0 || csv.needsColumnMapping) {
    return wrapTabular(csv, detectedBank, rawUri);
  }

  const pdf = parsePdfBankText(content, detectedBank);
  if (pdf.lines.length > 0) return { ...pdf, detectedBank };

  return { format: 'unknown', accountIban: null, lines: [], detectedBank };
}

function wrapTabular(
  result: TabularParseResult,
  detectedBank: BankCode,
  rawUri?: string
): ParseStatementResult {
  return {
    format: result.format,
    accountIban: result.accountIban,
    lines: result.lines,
    detectedBank,
    headers: result.headers,
    columnMap: result.columnMap,
    needsColumnMapping: result.needsColumnMapping,
    rawUri,
  };
}
