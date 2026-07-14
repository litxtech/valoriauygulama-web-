import { mrzScoreToConfidence, scoreMrzCandidate } from '@/lib/scanner/mrzCandidateScore';
import { canLockMrzLiveScan, canSaveMrzDocument, canUseKbsCaptureMrz } from '@/lib/scanner/mrzScanGate';
import { mrzOcrAmbiguityVariants, normalizeMrzOcrLine, normalizeMrzOcrLines } from '@/lib/scanner/mrzOcrNormalize';
import { parseMrzToNormalized } from '@/lib/scanner/mrzParser';
import type { ParsedDocument } from '@/lib/scanner/types';

const TD3_LEN = 44;
const TD2_LEN = 36;
const TD1_LEN = 30;
const TD3_MIN = 38;
const TD3_MAX = 46;
const TD2_MIN = 32;
const TD2_MAX = 40;
const TD1_MIN = 26;
const TD1_MAX = 34;

function isMrzLikeLine(line: string): boolean {
  if (line.length < 22) return false;
  const chevrons = (line.match(/</g) ?? []).length;
  return chevrons >= 2 && /^[A-Z0-9<]+$/.test(line);
}

/** TD3 satır 2: OCR sık «<» kaçırır; rakam ağırlıklı uzun satır. */
function isMrzDataLine(line: string): boolean {
  if (line.length < 28 || line.length > 52) return false;
  if (!/^[A-Z0-9<]+$/.test(line)) return false;
  if (line.includes('<<')) return false;
  const digits = (line.match(/\d/g) ?? []).length;
  return digits >= 10 && /[A-Z]{3}/.test(line);
}

/** P< eksik OCR: UZBMUKHAMMADIEVA<<NIGINA... → P<UZB... */
function ensureTd3NameLine(line: string): string {
  let L = line;
  // Baştaki yanlış K/Ö önek
  L = L.replace(/^K(?=[A-Z]{3}[A-Z<])/, '');
  if (/^[IPAVC]</.test(L)) return padOrTrimTo(L, TD3_LEN);
  if (/^[A-Z]{3}[A-Z<<]/.test(L) && L.includes('<<')) {
    return padOrTrimTo(`P<${L}`, TD3_LEN);
  }
  return padOrTrimTo(L, TD3_LEN);
}

function pairTd3(a: string, b: string): string | null {
  const nameFirst = a.includes('<<') || /^[IPAVC]</.test(a);
  const la = nameFirst ? ensureTd3NameLine(a) : padOrTrimTo(a, TD3_LEN);
  const lb = nameFirst ? padOrTrimTo(b, TD3_LEN) : ensureTd3NameLine(b);
  if (la.length < TD3_MIN || lb.length < TD3_MIN) return null;
  // İsim satırı «<<» içermeli
  const nameLine = la.includes('<<') ? la : lb.includes('<<') ? lb : null;
  const dataLine = la.includes('<<') ? lb : lb.includes('<<') ? la : null;
  if (!nameLine || !dataLine) return `${la}\n${lb}`;
  return `${nameLine}\n${dataLine}`;
}

function padOrTrimTo(line: string, target: number): string {
  if (line.length === target) return line;
  if (line.length > target) return line.slice(0, target);
  return line.padEnd(target, '<');
}

function pairTd2(a: string, b: string): string | null {
  const la = padOrTrimTo(a, TD2_LEN);
  const lb = padOrTrimTo(b, TD2_LEN);
  if (la.length < TD2_MIN || lb.length < TD2_MIN) return null;
  return `${la}\n${lb}`;
}

function tripleTd1(a: string, b: string, c: string): string | null {
  const lines = [a, b, c].map((l) => padOrTrimTo(l, TD1_LEN));
  if (lines.some((l) => l.length < TD1_MIN)) return null;
  return lines.join('\n');
}

function rebuildTd3DataLine(data: string, vizDoc: string | null): string[] {
  const base = padOrTrimTo(data, TD3_LEN);
  const out = [base];
  const natMatch = data.match(/^([A-Z0-9]{6,12}?)([A-Z]{3})(\d{6}.*)$/);
  if (!natMatch) return out;
  const [, , nat, rest] = natMatch;
  const docs: string[] = [];
  if (vizDoc) {
    const d = vizDoc.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 9);
    if (d) docs.push(d);
  }
  // OCR `52133285UZB...` — rakam öneki
  const digitPrefix = natMatch[1]!.replace(/[^0-9]/g, '');
  if (digitPrefix.length >= 7) docs.push(digitPrefix.slice(0, 9));

  for (const doc of docs) {
    const paddedDoc = doc.padEnd(9, '<').slice(0, 9);
    for (const chk of ['', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      out.push(padOrTrimTo(`${paddedDoc}${chk}${nat}${rest}`, TD3_LEN));
    }
  }
  return [...new Set(out)];
}

function buildCandidateStrings(lines: string[]): string[] {
  const cleaned = normalizeMrzOcrLines(lines);
  const nameLines = cleaned.filter(isMrzLikeLine).map((l) => {
    const fixed = ensureTd3NameLine(l);
    return fixed;
  });
  const rawData = cleaned.filter(isMrzDataLine);
  const vizDoc =
    lines
      .map((l) => l.replace(/\s/g, '').toUpperCase())
      .map((l) => l.match(/\b([A-Z]{1,2}\d{6,9})\b/)?.[1])
      .find(Boolean) ?? null;

  const dataVariants = rawData.flatMap((d) => rebuildTd3DataLine(d, vizDoc));
  const out = new Set<string>();

  for (const name of nameLines) {
    for (const data of dataVariants) {
      const p = pairTd3(name, data);
      if (p) out.add(p);
    }
  }

  // Yan yana OCR sırası
  const candidates = [...new Set([...cleaned.filter(isMrzLikeLine), ...rawData])];
  for (let i = 0; i < candidates.length - 1; i++) {
    const a = candidates[i]!;
    const b = candidates[i + 1]!;
    for (const da of rebuildTd3DataLine(a, vizDoc)) {
      const p = pairTd3(ensureTd3NameLine(b.includes('<<') ? b : a), da);
      if (p) out.add(p);
    }
    if (a.length >= TD2_MIN && a.length <= TD2_MAX && b.length >= TD2_MIN && b.length <= TD2_MAX) {
      const p2 = pairTd2(a, b);
      if (p2) out.add(p2);
    }
  }

  const byLen = [...candidates].sort((x, y) => y.length - x.length);
  if (byLen.length >= 2 && byLen[0]!.length >= 36) {
    const p = pairTd3(ensureTd3NameLine(byLen[0]!), padOrTrimTo(byLen[1]!, TD3_LEN));
    if (p) out.add(p);
  }

  return [...out];
}

export type MrzExtractResult = { mrz: string; parsed: ParsedDocument; score: number } | null;

type RankedMrz = MrzExtractResult & { strictSave: boolean };

function rankMrzCandidate(raw: string, parsed: ParsedDocument, kbsRelaxed?: boolean): RankedMrz | null {
  const gate = canSaveMrzDocument({ rawMrz: raw, parsed });
  const lockOk = canLockMrzLiveScan({ rawMrz: raw, parsed });
  const kbsOk = kbsRelaxed && canUseKbsCaptureMrz({ rawMrz: raw, parsed });
  if (!gate.allowed && !lockOk && !kbsOk) return null;
  const score = scoreMrzCandidate({ rawMrz: raw, parsed });
  return {
    mrz: raw,
    parsed: {
      ...parsed,
      confidence: mrzScoreToConfidence(score),
    },
    score,
    strictSave: gate.allowed,
  };
}

/** OCR satırlarından en iyi geçerli MRZ (tüm adaylar puanlanır). */
export function extractMrzFromLinesBest(
  lines: string[],
  opts?: { kbsRelaxed?: boolean }
): MrzExtractResult | null {
  const candidates = buildCandidateStrings(lines);
  const ranked: RankedMrz[] = [];

  for (const raw of candidates) {
    for (const variant of mrzOcrAmbiguityVariants(raw)) {
      const parsed = parseMrzToNormalized(variant);
      const row = rankMrzCandidate(variant, parsed, opts?.kbsRelaxed);
      if (row) ranked.push(row);
    }
  }

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => {
    if (a.strictSave !== b.strictSave) return a.strictSave ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    if (a.parsed.checksumsValid === true && b.parsed.checksumsValid !== true) return -1;
    if (b.parsed.checksumsValid === true && a.parsed.checksumsValid !== true) return 1;
    return 0;
  });

  const best = ranked[0]!;
  return { mrz: best.mrz, parsed: best.parsed, score: best.score };
}

/** @deprecated extractMrzFromLinesBest kullanın */
export function extractMrzFromLines(lines: string[]): string | null {
  const best = extractMrzFromLinesBest(lines);
  return best?.mrz ?? null;
}
