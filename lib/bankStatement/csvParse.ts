import type { BankCode } from '@/lib/bankStatement/types';
import {
  parseCsvContent,
  looksLikeTabularText,
  type TabularParseResult,
} from '@/lib/bankStatement/tabularParse';
import type { TabularColumnMap } from '@/lib/bankStatement/columnMap';

export function parseBankCsv(
  content: string,
  bankCode: BankCode,
  userMap?: TabularColumnMap
): TabularParseResult {
  return parseCsvContent(content, bankCode, userMap);
}

export function looksLikeCsv(content: string): boolean {
  return looksLikeTabularText(content);
}

export { looksLikeTabularText };
