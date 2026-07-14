import type { ParsedDocument } from '@/lib/scanner/types';
import { hasPlausibleKbsDocumentNumber } from '@/lib/kbsDocumentNumberValidate';

/**
 * Belge seri no — asla pasaport/kimlik numarasının kopyası olmamalı.
 * TC kimlikte ayrı seri (A12…); pasaportta genelde boş (numara document_number’da).
 */
export function resolveKbsDocumentSeries(args: {
  documentSeries?: string | null;
  documentNumber?: string | null;
  documentType?: ParsedDocument['documentType'] | string | null;
}): string | null {
  const series = (args.documentSeries ?? '').trim().toUpperCase().replace(/\s+/g, '') || null;
  const docNo = (args.documentNumber ?? '').trim().toUpperCase().replace(/\s+/g, '') || null;
  if (!series) return null;
  if (docNo && series === docNo) return null;
  if (docNo && series.includes(docNo)) return null;
  if (docNo && docNo.includes(series) && series.length >= 6) return null;

  // Pasaport / yabancı: seri alanı belgesi no gibi görünüyorsa at
  const isPassport =
    args.documentType === 'passport' ||
    (!!docNo && hasPlausibleKbsDocumentNumber(docNo, 'passport') && !/^[1-9]\d{10}$/.test(docNo));
  if (isPassport && hasPlausibleKbsDocumentNumber(series, 'passport')) {
    return null;
  }

  // Authority kodları (MIA18215) — kimlik seri değil
  if (/^(?:MIA|MOI|MIN|GOV|POL)\d/i.test(series)) return null;

  return series;
}

/** Pasaport parse: series yanlışlıkla no ile doluysa temizle. */
export function sanitizeParsedDocumentSeries(parsed: ParsedDocument): ParsedDocument {
  const series = resolveKbsDocumentSeries({
    documentSeries: parsed.documentSeries,
    documentNumber: parsed.documentNumber,
    documentType: parsed.documentType,
  });
  if (series === (parsed.documentSeries ?? null)) return parsed;
  return { ...parsed, documentSeries: series };
}
