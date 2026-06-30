import type { ParsedBankLine, ParsedBankStatement } from '@/lib/bankStatement/types';
import {
  buildDedupKey,
  extractIbanFromText,
  extractNameFromNarrative,
  extractTaxIdFromText,
  normalizeIban,
} from '@/lib/bankStatement/normalize';

function tagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
  const m = xml.match(re);
  return m?.[1]?.trim() || null;
}

function parseIsoDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const d = raw.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function parseAmount(raw: string | null): number | null {
  if (!raw?.trim()) return null;
  const n = parseFloat(raw.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function parseCamtNtry(block: string, bankCode: string, accountIban: string | null, index: number): ParsedBankLine | null {
  const amtBlock = block.match(/<Amt[^>]*>([^<]+)<\/Amt>/i)?.[1] ?? '';
  const amount = parseAmount(amtBlock);
  if (!amount) return null;

  const cdtDbt = tagValue(block, 'CdtDbtInd')?.toUpperCase();
  const direction = cdtDbt === 'CRDT' ? 'credit' : cdtDbt === 'DBIT' ? 'debit' : null;
  if (!direction) return null;

  const valueDate =
    parseIsoDate(tagValue(block, 'Dt')) ??
    parseIsoDate(block.match(/<BookgDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i)?.[1] ?? null) ??
    parseIsoDate(block.match(/<ValDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i)?.[1] ?? null);
  if (!valueDate) return null;

  const time =
    block.match(/<DtTm>([^<]+)<\/DtTm>/i)?.[1]?.slice(11, 19) ??
    block.match(/<DtTm>([^<]+)<\/DtTm>/i)?.[1]?.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ??
    null;

  const name =
    tagValue(block, 'Nm') ??
    block.match(/<Dbtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1] ??
    block.match(/<Cdtr>[\s\S]*?<Nm>([^<]+)<\/Nm>/i)?.[1] ??
    null;

  const iban =
    normalizeIban(block.match(/<IBAN>([^<]+)<\/IBAN>/i)?.[1] ?? '') ??
    extractIbanFromText(block);

  const description =
    tagValue(block, 'AddtlNtryInf') ??
    tagValue(block, 'Ustrd') ??
    block.match(/<RmtInf>[\s\S]*?<Ustrd>([^<]+)<\/Ustrd>/i)?.[1] ??
    name ??
    '';

  const taxId = extractTaxIdFromText(block);
  const counterpartyName = name ?? extractNameFromNarrative(description, iban, taxId);
  const bankReference = tagValue(block, 'AcctSvcrRef') ?? tagValue(block, 'NtryRef');

  const dedupKey = buildDedupKey({
    accountIban,
    valueDate,
    valueTime: time,
    direction,
    amount,
    bankReference,
    description,
  });

  return {
    localId: `xml-${index}`,
    valueDate,
    valueTime: time,
    direction,
    amount,
    currency: block.match(/<Amt[^>]*Ccy="([^"]+)"/i)?.[1] ?? 'TRY',
    description: description.trim(),
    counterpartyNameRaw: counterpartyName,
    counterpartyIban: iban,
    counterpartyTaxId: taxId,
    bankReference,
    rawLine61: null,
    rawLine86: block.slice(0, 500),
    dedupKey,
  };
}

export function looksLikeBankXml(content: string): boolean {
  const head = content.slice(0, 4000).toLowerCase();
  return (
    head.includes('<?xml') &&
    (head.includes('camt.053') ||
      head.includes('camt.054') ||
      head.includes('<stmt') ||
      head.includes('<ntry') ||
      head.includes('bkto_cstmr'))
  );
}

export function parseBankXml(content: string, bankCode: string): ParsedBankStatement {
  const accountIban =
    normalizeIban(content.match(/<IBAN>([^<]+)<\/IBAN>/i)?.[1] ?? '') ??
    extractIbanFromText(content.slice(0, 2000));

  const entries = content.match(/<Ntry>[\s\S]*?<\/Ntry>/gi) ?? [];
  const lines: ParsedBankLine[] = [];
  let i = 0;
  for (const block of entries) {
    const line = parseCamtNtry(block, bankCode, accountIban, i++);
    if (line) lines.push(line);
  }

  if (lines.length === 0) {
    const altBlocks = content.match(/<TxDtls>[\s\S]*?<\/TxDtls>/gi) ?? [];
    for (const block of altBlocks) {
      const line = parseCamtNtry(block, bankCode, accountIban, i++);
      if (line) lines.push(line);
    }
  }

  return { format: 'xml', accountIban, lines };
}
