import type { ParsedDocument } from '@/lib/scanner/types';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { capturedAtTs, displayCapturedName } from '@/lib/kbsCaptureHistory';
import { enrichKbsParsedFromSources } from '@/lib/kbsCaptureParsedFields';
import { formatKbsTrDate, formatKbsNationality, kbsDisplayFullName } from '@/lib/kbsDisplayFormat';
import {
  getKbsReturningGuestMeta,
  normalizeGuestDocumentNumber,
  type KbsReturningGuestMeta,
} from '@/lib/kbsGuestDocumentIdentity';
import { isUsablePersonName } from '@/lib/guestScan/personNameUtils';

export type KbsCompareFieldStatus = 'match' | 'differ' | 'partial' | 'missing';

export type KbsCompareFieldRow = {
  key: string;
  label: string;
  current: string;
  previous: string;
  status: KbsCompareFieldStatus;
};

export type KbsIdentityMatchSummary = {
  matched: number;
  differed: number;
  missing: number;
  scorePct: number;
  daysBetween: number | null;
  hoursBetween: number | null;
  previousAtLabel: string | null;
  currentAtLabel: string | null;
  sameDocumentRecord: boolean;
  verdict: 'same_person' | 'likely' | 'uncertain' | 'different';
  verdictLabel: string;
};

function norm(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ');
}

function normKey(raw: string | null | undefined): string {
  return norm(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function formatTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function compareValues(a: string, b: string, looseDoc = false): KbsCompareFieldStatus {
  const na = normKey(a);
  const nb = normKey(b);
  if (!na && !nb) return 'missing';
  if (!na || !nb) return 'partial';
  if (na === nb) return 'match';
  if (looseDoc) {
    const da = normalizeGuestDocumentNumber(a) ?? '';
    const db = normalizeGuestDocumentNumber(b) ?? '';
    if (da && db && da === db) return 'match';
    if (da && db && (da.includes(db) || db.includes(da))) return 'partial';
  }
  return 'differ';
}

function fieldValue(
  parsed: ParsedDocument | null,
  key: string,
  row?: KbsCapturedDocumentRow | null,
  meta?: KbsReturningGuestMeta | null
): string {
  switch (key) {
    case 'fullName':
      return kbsDisplayFullName(parsed) || '—';
    case 'firstName':
      return isUsablePersonName(parsed?.firstName) ? String(parsed!.firstName) : '—';
    case 'lastName':
      return isUsablePersonName(parsed?.lastName) ? String(parsed!.lastName) : '—';
    case 'documentNumber':
      return parsed?.documentNumber?.trim() || meta?.documentNumber?.trim() || '—';
    case 'birthDate':
      return formatKbsTrDate(parsed?.birthDate) ?? parsed?.birthDate ?? '—';
    case 'expiryDate':
      return formatKbsTrDate(parsed?.expiryDate) ?? parsed?.expiryDate ?? '—';
    case 'nationality':
      return (
        formatKbsNationality(parsed?.nationalityCode) ??
        parsed?.nationalityCode ??
        '—'
      );
    case 'gender':
      return parsed?.gender === 'M' ? 'Erkek' : parsed?.gender === 'F' ? 'Kadın' : parsed?.gender ?? '—';
    case 'room':
      return row?.room_number?.trim() || '—';
    case 'capturedAt':
      return row ? formatTs(capturedAtTs(row)) : formatTs(meta?.previousCapturedAt);
    case 'capturedBy':
      return row?.captured_by_staff_name?.trim() || '—';
    case 'guestNameMeta':
      return meta?.previousGuestName?.trim() || '—';
    default:
      return '—';
  }
}

/** İki kayıt için alan satırları (tarih/saat dahil). */
export function buildKbsIdentityCompareRows(
  current: KbsCapturedDocumentRow,
  previous: KbsCapturedDocumentRow | null,
  meta: KbsReturningGuestMeta | null
): KbsCompareFieldRow[] {
  const curP = enrichKbsParsedFromSources(current.parsed_payload);
  const prevP = previous ? enrichKbsParsedFromSources(previous.parsed_payload) : null;

  const defs: { key: string; label: string; looseDoc?: boolean }[] = [
    { key: 'fullName', label: 'Tam ad' },
    { key: 'lastName', label: 'Soyad' },
    { key: 'firstName', label: 'Ad' },
    { key: 'documentNumber', label: 'Belge no', looseDoc: true },
    { key: 'birthDate', label: 'Doğum tarihi' },
    { key: 'expiryDate', label: 'Son geçerlilik' },
    { key: 'nationality', label: 'Uyruk' },
    { key: 'gender', label: 'Cinsiyet' },
    { key: 'room', label: 'Oda' },
    { key: 'capturedAt', label: 'Çekim tarihi / saati' },
    { key: 'capturedBy', label: 'Yükleyen' },
  ];

  return defs.map((d) => {
    const currentVal = fieldValue(curP, d.key, current, meta);
    let previousVal = fieldValue(prevP, d.key, previous, meta);
    if (!previous && d.key === 'capturedAt' && meta?.previousCapturedAt) {
      previousVal = formatTs(meta.previousCapturedAt);
    }
    if (!previous && d.key === 'fullName' && meta?.previousGuestName) {
      previousVal = meta.previousGuestName;
    }
    if (!previous && d.key === 'documentNumber' && meta?.documentNumber) {
      previousVal = meta.documentNumber;
    }
    return {
      key: d.key,
      label: d.label,
      current: currentVal,
      previous: previousVal,
      status: compareValues(currentVal, previousVal, d.looseDoc),
    };
  });
}

export function summarizeKbsIdentityMatch(
  rows: KbsCompareFieldRow[],
  current: KbsCapturedDocumentRow,
  previous: KbsCapturedDocumentRow | null,
  meta: KbsReturningGuestMeta | null
): KbsIdentityMatchSummary {
  const identityKeys = new Set([
    'fullName',
    'lastName',
    'firstName',
    'documentNumber',
    'birthDate',
    'expiryDate',
    'nationality',
    'gender',
  ]);
  const identityRows = rows.filter((r) => identityKeys.has(r.key));
  let matched = 0;
  let differed = 0;
  let missing = 0;
  for (const r of identityRows) {
    if (r.status === 'match' || r.status === 'partial') matched += 1;
    else if (r.status === 'differ') differed += 1;
    else missing += 1;
  }
  const total = identityRows.length || 1;
  const scorePct = Math.round((matched / total) * 100);

  const curTs = new Date(capturedAtTs(current)).getTime();
  const prevIso = previous ? capturedAtTs(previous) : meta?.previousCapturedAt ?? null;
  const prevTs = prevIso ? new Date(prevIso).getTime() : NaN;
  let daysBetween: number | null = null;
  let hoursBetween: number | null = null;
  if (Number.isFinite(curTs) && Number.isFinite(prevTs) && prevTs > 0) {
    const diffMs = Math.abs(curTs - prevTs);
    daysBetween = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    hoursBetween = Math.floor(diffMs / (60 * 60 * 1000));
  }

  const sameDocumentRecord = !!(previous && previous.id === current.id);

  let verdict: KbsIdentityMatchSummary['verdict'] = 'uncertain';
  let verdictLabel = 'Belirsiz — alanları kontrol edin';
  if (differed >= 3 && matched <= 2) {
    verdict = 'different';
    verdictLabel = 'Farklı kişi olabilir';
  } else if (matched >= 5 && differed === 0) {
    verdict = 'same_person';
    verdictLabel = 'Aynı kişi — kimlik eşleşti';
  } else if (matched >= 3) {
    verdict = 'likely';
    verdictLabel = 'Muhtemelen aynı kişi';
  }

  return {
    matched,
    differed,
    missing,
    scorePct,
    daysBetween,
    hoursBetween,
    previousAtLabel: prevIso ? formatTs(prevIso) : null,
    currentAtLabel: formatTs(capturedAtTs(current)),
    sameDocumentRecord,
    verdict,
    verdictLabel,
  };
}

export function resolveComparePreviousId(
  current: KbsCapturedDocumentRow
): { previousId: string | null; meta: KbsReturningGuestMeta | null } {
  const meta = getKbsReturningGuestMeta(enrichKbsParsedFromSources(current.parsed_payload));
  const previousId = meta?.previousDocumentId?.trim() || null;
  return { previousId, meta };
}

export function compareDisplayTitle(row: KbsCapturedDocumentRow): string {
  return displayCapturedName(row);
}
