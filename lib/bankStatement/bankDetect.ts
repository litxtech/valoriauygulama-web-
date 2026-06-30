import type { BankCode } from '@/lib/bankStatement/types';

type BankSignature = { code: BankCode; patterns: RegExp[] };

const SIGNATURES: BankSignature[] = [
  { code: 'akbank', patterns: [/akbank/i, /ak\s*bank/i] },
  { code: 'ziraat', patterns: [/ziraat/i, /ziraatbank/i] },
  { code: 'isbank', patterns: [/iş\s*bank/i, /is\s*bank/i, /turkiye\s*is/i] },
  { code: 'garanti', patterns: [/garanti/i, /bbva/i] },
  { code: 'yapikredi', patterns: [/yapı\s*kredi/i, /yapi\s*kredi/i, /yapikredi/i] },
  { code: 'vakifbank', patterns: [/vakıf/i, /vakifbank/i, /vakif\s*bank/i] },
  { code: 'halkbank', patterns: [/halkbank/i, /halk\s*bank/i] },
  { code: 'qnb', patterns: [/qnb/i, /finansbank/i] },
  { code: 'denizbank', patterns: [/denizbank/i, /deniz\s*bank/i] },
  { code: 'ing', patterns: [/\bing\b/i, /ing\s*bank/i] },
  { code: 'teb', patterns: [/\bteb\b/i] },
  { code: 'kuveytturk', patterns: [/kuveyt/i, /kuveyt\s*turk/i] },
  { code: 'albaraka', patterns: [/albaraka/i] },
  { code: 'turkiyefinans', patterns: [/türkiye\s*finans/i, /turkiye\s*finans/i] },
  { code: 'enpara', patterns: [/enpara/i] },
  { code: 'papara', patterns: [/papara/i] },
  { code: 'wise', patterns: [/\bwise\b/i, /transferwise/i] },
  { code: 'revolut', patterns: [/revolut/i] },
  { code: 'payoneer', patterns: [/payoneer/i] },
  { code: 'mercury', patterns: [/mercury/i] },
  { code: 'stripe', patterns: [/stripe/i, /payout/i] },
];

export function detectBankFromContent(fileName: string, content: string): BankCode {
  const hay = `${fileName}\n${content.slice(0, 8000)}`;
  for (const sig of SIGNATURES) {
    if (sig.patterns.some((p) => p.test(hay))) return sig.code;
  }
  return 'other';
}

export function detectFileFormatFromName(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return 'txt';
  return fileName.slice(i + 1).toLowerCase();
}

export function detectFileFormatFromContent(content: string, extension: string): string {
  if (extension === 'pdf') return 'pdf';
  if (extension === 'xlsx' || extension === 'xls') return 'xlsx';
  if (extension === 'csv') return 'csv';
  if (/:20:/.test(content.slice(0, 500)) && /:61:/.test(content)) return 'mt940';
  if (content.trim().startsWith('<?xml') || content.includes('camt.053')) return 'xml';
  if (extension === 'txt' && /:61:/.test(content)) return 'mt940';
  return extension || 'txt';
}
