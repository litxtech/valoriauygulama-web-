import { displayCapturedName, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import {
  buildKbsCopyFields,
  normalizeKbsParsedPayload,
} from '@/lib/kbsCaptureParsedFields';
import {
  formatKbsNationality,
  formatKbsTrDate,
  kbsAgeYearsFromBirthDate,
  kbsDisplayFullName,
} from '@/lib/kbsDisplayFormat';
import type { ParsedDocument } from '@/lib/scanner/types';

export type KbsCaptureSearchSuggestion = {
  id: string;
  rowId: string;
  label: string;
  subtitle: string;
  score: number;
  kind: 'person' | 'room' | 'document' | 'staff';
};

function foldTr(s: string): string {
  return s
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function normalizeKbsSearchQuery(raw: string): string {
  return foldTr(raw);
}

function rowParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  return normalizeKbsParsedPayload(row.parsed_payload);
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

function buildRowSearchBlob(row: KbsCapturedDocumentRow): string {
  const parsed = rowParsed(row);
  const fields = parsed ? buildKbsCopyFields(parsed) : [];
  const name = displayCapturedName(row);
  const full = parsed ? kbsDisplayFullName(parsed) : null;
  const parts = [
    name,
    full,
    parsed?.firstName,
    parsed?.lastName,
    parsed?.documentNumber,
    parsed?.documentSeries,
    parsed?.nationalityCode,
    parsed?.issuingCountryCode,
    formatKbsNationality(parsed?.nationalityCode),
    formatKbsNationality(parsed?.issuingCountryCode),
    formatKbsTrDate(parsed?.birthDate),
    formatKbsTrDate(parsed?.expiryDate),
    parsed?.birthDate,
    parsed?.expiryDate,
    parsed?.gender === 'M' ? 'erkek' : parsed?.gender === 'F' ? 'kadın' : null,
    parsed?.motherName,
    parsed?.fatherName,
    kbsAgeYearsFromBirthDate(parsed?.birthDate)?.toString(),
    row.room_number,
    row.captured_by_staff_name,
    ...fields.map((f) => `${f.label} ${f.value}`),
    fields.map((f) => f.value).join(' '),
  ];
  return foldTr(parts.filter(Boolean).join(' '));
}

function tokenizeQuery(query: string): string[] {
  return normalizeKbsSearchQuery(query).split(' ').filter(Boolean);
}

function scoreRowMatch(row: KbsCapturedDocumentRow, query: string, tokens: string[]): number {
  const q = normalizeKbsSearchQuery(query);
  if (!q) return 0;

  const blob = buildRowSearchBlob(row);
  if (!tokens.every((t) => blob.includes(t))) return 0;

  const parsed = rowParsed(row);
  const name = foldTr(displayCapturedName(row));
  const full = foldTr(kbsDisplayFullName(parsed) ?? '');
  const doc = digitsOnly(parsed?.documentNumber ?? '');
  const room = foldTr(row.room_number ?? '');
  const qDigits = digitsOnly(q);

  let score = 40 + tokens.length * 8;

  if (name.startsWith(q) || full.startsWith(q)) score += 120;
  else if (name.includes(q) || full.includes(q)) score += 70;

  if (qDigits.length >= 3 && doc.includes(qDigits)) score += 90;
  if (room && (room === q || room.startsWith(q))) score += 85;

  const nat = foldTr(formatKbsNationality(parsed?.nationalityCode) ?? '');
  if (nat && nat.includes(q)) score += 50;

  if (row.captured_by_staff_name && foldTr(row.captured_by_staff_name).includes(q)) score += 35;

  return score;
}

/** Liste filtresi — tüm tokenlar eşleşmeli. */
export function filterKbsCapturesBySearchQuery(
  rows: KbsCapturedDocumentRow[],
  query: string
): KbsCapturedDocumentRow[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return rows;
  return rows.filter((row) => scoreRowMatch(row, query, tokens) > 0);
}

function personSubtitle(row: KbsCapturedDocumentRow, parsed: ParsedDocument | null): string {
  const bits: string[] = [];
  if (row.room_number) bits.push(`Oda ${row.room_number}`);
  if (parsed?.documentNumber) bits.push(`No ${parsed.documentNumber}`);
  const nat = formatKbsNationality(parsed?.nationalityCode);
  if (nat) bits.push(nat);
  const age = kbsAgeYearsFromBirthDate(parsed?.birthDate);
  if (age != null) bits.push(`${age} yaş`);
  const exp = formatKbsTrDate(parsed?.expiryDate);
  if (exp) bits.push(`SKT ${exp}`);
  return bits.join(' · ') || 'Kimlik kaydı';
}

/** Yazarken öneri listesi (en iyi eşleşmeler üstte). */
export function buildKbsCaptureSearchSuggestions(
  rows: KbsCapturedDocumentRow[],
  query: string,
  limit = 10
): KbsCaptureSearchSuggestion[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const q = normalizeKbsSearchQuery(query);
  const qDigits = digitsOnly(q);
  const suggestions: KbsCaptureSearchSuggestion[] = [];

  for (const row of rows) {
    const score = scoreRowMatch(row, query, tokens);
    if (score <= 0) continue;
    const parsed = rowParsed(row);
    const label = displayCapturedName(row);
    suggestions.push({
      id: `row-${row.id}`,
      rowId: row.id,
      label,
      subtitle: personSubtitle(row, parsed),
      score,
      kind: 'person',
    });
  }

  if (/^\d+$/.test(q) || q.startsWith('oda')) {
    const roomQ = q.replace(/^oda\s*/, '');
    const roomCounts = new Map<string, number>();
    for (const row of rows) {
      const rn = row.room_number?.trim();
      if (!rn) continue;
      if (roomQ && !foldTr(rn).includes(roomQ)) continue;
      roomCounts.set(rn, (roomCounts.get(rn) ?? 0) + 1);
    }
    for (const [room, count] of roomCounts) {
      if (roomQ && !foldTr(room).includes(roomQ)) continue;
      suggestions.push({
        id: `room-${room}`,
        rowId: rows.find((r) => r.room_number === room)?.id ?? rows[0]!.id,
        label: `Oda ${room}`,
        subtitle: `${count} kimlik kaydı`,
        score: foldTr(room) === roomQ ? 200 : 95,
        kind: 'room',
      });
    }
  }

  if (qDigits.length >= 4) {
    for (const row of rows) {
      const parsed = rowParsed(row);
      const doc = digitsOnly(parsed?.documentNumber ?? '');
      if (!doc.includes(qDigits)) continue;
      suggestions.push({
        id: `doc-${row.id}`,
        rowId: row.id,
        label: parsed?.documentNumber ?? doc,
        subtitle: `${displayCapturedName(row)} · Oda ${row.room_number ?? '—'}`,
        score: doc.startsWith(qDigits) ? 180 : 100,
        kind: 'document',
      });
    }
  }

  const staffHits = new Map<string, { name: string; count: number; rowId: string }>();
  for (const row of rows) {
    const staff = row.captured_by_staff_name?.trim();
    if (!staff || !foldTr(staff).includes(q)) continue;
    const prev = staffHits.get(staff);
    if (prev) prev.count += 1;
    else staffHits.set(staff, { name: staff, count: 1, rowId: row.id });
  }
  for (const [staff, meta] of staffHits) {
    suggestions.push({
      id: `staff-${staff}`,
      rowId: meta.rowId,
      label: meta.name,
      subtitle: `Çeken personel · ${meta.count} kayıt`,
      score: foldTr(staff).startsWith(q) ? 75 : 55,
      kind: 'staff',
    });
  }

  const seen = new Set<string>();
  return suggestions
    .sort((a, b) => b.score - a.score)
    .filter((s) => {
      const key = `${s.kind}:${s.label}:${s.subtitle}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}
