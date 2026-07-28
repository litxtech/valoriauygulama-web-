/**
 * MRZ belge no — OCR harf/rakam karışıklığını check digit ile onar.
 * O↔0, I/L↔1, S↔5, B↔8, Z↔2, G↔6 (en fazla 2 değişiklik).
 */
import { mrzCheckDigitMatches, mrzComputeCheckDigit } from '@/lib/scanner/mrzCheckDigit';

const CONFUSABLES: Record<string, string[]> = {
  O: ['0'],
  '0': ['O'],
  I: ['1'],
  L: ['1'],
  '1': ['I', 'L'],
  S: ['5'],
  '5': ['S'],
  B: ['8'],
  '8': ['B'],
  Z: ['2'],
  '2': ['Z'],
  G: ['6'],
  '6': ['G'],
};

function padDocField(raw: string, len = 9): string {
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9<]/g, '');
  if (alnum.length >= len) return alnum.slice(0, len);
  return alnum.padEnd(len, '<');
}

function cleanDoc(field: string): string {
  return field.replace(/<+$/, '').replace(/[^A-Z0-9]/g, '');
}

type RepairHit = { field: string; documentNumber: string; changes: number };

function collectConfusableVariants(field: string, maxChanges: number): RepairHit[] {
  const base = padDocField(field, 9);
  const out: RepairHit[] = [];
  const seen = new Set<string>();

  function walk(chars: string[], idx: number, changes: number) {
    if (changes > maxChanges) return;
    if (idx >= chars.length) {
      const f = chars.join('');
      if (seen.has(f)) return;
      seen.add(f);
      const doc = cleanDoc(f);
      if (doc.length >= 5) out.push({ field: f, documentNumber: doc, changes });
      return;
    }
    walk(chars, idx + 1, changes);
    if (changes >= maxChanges) return;
    const cur = chars[idx]!;
    const alts = CONFUSABLES[cur];
    if (!alts) return;
    for (const alt of alts) {
      const next = chars.slice();
      next[idx] = alt;
      walk(next, idx + 1, changes + 1);
    }
  }

  walk(base.split(''), 0, 0);
  return out;
}

/**
 * 9 karakterlik MRZ belge alanı + check digit → check geçen en az değişiklikli aday.
 * Check zaten uyuyorsa orijinali döner. Tek anlamlı onarım yoksa null.
 */
export function repairMrzDocumentNumberField(
  fieldRaw: string,
  checkDigit: string
): { documentNumber: string; field: string; repaired: boolean } | null {
  const field = padDocField(fieldRaw, 9);
  const check = String(checkDigit ?? '').trim().slice(0, 1);
  if (!/^[0-9]$/.test(check)) return null;

  if (mrzCheckDigitMatches(field, check)) {
    const doc = cleanDoc(field);
    return doc.length >= 5 ? { documentNumber: doc, field, repaired: false } : null;
  }

  const hits = collectConfusableVariants(field, 2)
    .filter((h) => mrzCheckDigitMatches(padDocField(h.field, 9), check))
    .sort((a, b) => a.changes - b.changes || b.documentNumber.length - a.documentNumber.length);

  if (hits.length === 0) return null;

  const best = hits[0]!;
  // Aynı değişiklik sayısında birden fazla farklı no → belirsiz, dokunma
  const sameTier = hits.filter((h) => h.changes === best.changes);
  const uniqueDocs = new Set(sameTier.map((h) => h.documentNumber));
  if (uniqueDocs.size > 1) return null;

  return {
    documentNumber: best.documentNumber,
    field: padDocField(best.field, 9),
    repaired: best.documentNumber !== cleanDoc(field),
  };
}

/** Ham belge no + check (görsel OCR / kısmi MRZ). */
export function repairDocumentNumberWithCheckDigit(
  documentNumber: string | null | undefined,
  checkDigit: string | null | undefined
): string | null {
  const doc = (documentNumber ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const check = String(checkDigit ?? '').trim().slice(0, 1);
  if (doc.length < 5 || !/^[0-9]$/.test(check)) return null;
  const hit = repairMrzDocumentNumberField(doc, check);
  return hit?.documentNumber ?? null;
}

function pickTd3DataLine(rawMrz: string): string | null {
  const lines = String(rawMrz)
    .toUpperCase()
    .split(/[\r\n]+/)
    .map((l) => l.replace(/\s+/g, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.length < 28) continue;
    if (/^[IPAVC]<?[A-Z<]{3}/.test(line) && line.includes('<<')) continue;
    const digits = (line.match(/\d/g) ?? []).length;
    if (digits >= 8) return line.padEnd(44, '<').slice(0, 44);
  }
  // Tek satır TD3 data
  if (lines.length === 1 && lines[0]!.length >= 28) {
    return lines[0]!.padEnd(44, '<').slice(0, 44);
  }
  return null;
}

/**
 * rawMrz TD3 satırından belge no onarımı.
 */
export function repairDocumentNumberFromRawMrz(
  rawMrz: string | null | undefined
): { documentNumber: string; repaired: boolean; checkDigit: string } | null {
  if (!rawMrz?.trim()) return null;
  const line = pickTd3DataLine(rawMrz);
  if (!line) return null;
  const field = line.slice(0, 9);
  const check = line[9] ?? '';
  const hit = repairMrzDocumentNumberField(field, check);
  if (!hit) return null;
  return {
    documentNumber: hit.documentNumber,
    repaired: hit.repaired,
    checkDigit: check,
  };
}

/** TD3 satırında field+check ile onarılmış belge no (fallback extract için). */
export function repairDocNumberFromTd3Slice(
  fieldRaw: string,
  checkDigit: string
): string | null {
  const hit = repairMrzDocumentNumberField(fieldRaw, checkDigit);
  return hit?.documentNumber ?? null;
}

export function expectedMrzCheckDigit(fieldRaw: string): string | null {
  const n = mrzComputeCheckDigit(padDocField(fieldRaw, 9));
  return n < 0 ? null : String(n);
}
