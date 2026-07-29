/**
 * Aynı POS fişinin tekrar yüklenip yüklenmediğini anlamak için parmak izi.
 * Öncelik: fiş no + tarih + tutar. No yoksa tarih + tutar + kart/banka/işyeri.
 */

export type ReceiptDupFields = {
  receiptNo?: string | null;
  receiptDate?: string | null;
  receiptTotal?: number | null;
  cardLast4?: string | null;
  paymentBank?: string | null;
  merchantName?: string | null;
  /** Otel / mutfak ayrı hesap — anahtara dahil */
  venueScope?: 'hotel' | 'restaurant' | null;
};

function normNo(raw: string | null | undefined): string {
  return (raw || '').replace(/\s/g, '').toUpperCase();
}

function normText(raw: string | null | undefined): string {
  return (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function moneyKey(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Eşleşme anahtarı — yetersiz veri varsa null (yanlış pozitif yok). */
export function posReceiptDuplicateKey(f: ReceiptDupFields): string | null {
  const total = moneyKey(f.receiptTotal);
  if (!total) return null;

  const venue = f.venueScope === 'restaurant' ? 'restaurant' : 'hotel';
  const no = normNo(f.receiptNo);
  const date = (f.receiptDate || '').trim();
  if (no.length >= 3 && date) {
    return `v:${venue}|no:${no}|d:${date}|t:${total}`;
  }
  if (no.length >= 4) {
    return `v:${venue}|no:${no}|t:${total}`;
  }
  if (!date) return null;

  const card = (f.cardLast4 || '').replace(/\D/g, '').slice(-4);
  const bank = normText(f.paymentBank);
  const merchant = normText(f.merchantName);
  if (card.length === 4 || bank || merchant) {
    return `v:${venue}|d:${date}|t:${total}|c:${card}|b:${bank}|m:${merchant}`;
  }
  // Sadece tarih+tutar — aynı gün aynı tutar tekrarları
  return `v:${venue}|d:${date}|t:${total}`;
}

export function posReceiptDuplicateKeyFromRow(r: {
  receipt_no?: string | null;
  receipt_date?: string | null;
  receipt_total?: number | null;
  card_last4?: string | null;
  payment_bank?: string | null;
  merchant_name?: string | null;
  venue_scope?: string | null;
}): string | null {
  return posReceiptDuplicateKey({
    receiptNo: r.receipt_no,
    receiptDate: r.receipt_date,
    receiptTotal: r.receipt_total,
    cardLast4: r.card_last4,
    paymentBank: r.payment_bank,
    merchantName: r.merchant_name,
    venueScope: r.venue_scope === 'restaurant' ? 'restaurant' : 'hotel',
  });
}

/**
 * Aynı anahtara sahip kayıtlar. Keep = en eski (created_at).
 * Dönüş: silinebilir (kopya) id seti + anahtar → tüm id’ler.
 */
export function findDuplicateReceiptIds<T extends { id: string; created_at?: string | null }>(
  rows: T[],
  keyOf: (row: T) => string | null
): { duplicateIds: Set<string>; keepIds: Set<string>; groups: Map<string, string[]> } {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = keyOf(row);
    if (!k) continue;
    const list = groups.get(k) ?? [];
    list.push(row);
    groups.set(k, list);
  }

  const duplicateIds = new Set<string>();
  const keepIds = new Set<string>();
  const idGroups = new Map<string, string[]>();

  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => {
      const ta = a.created_at ? Date.parse(a.created_at) : 0;
      const tb = b.created_at ? Date.parse(b.created_at) : 0;
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    keepIds.add(sorted[0].id);
    const ids = sorted.map((x) => x.id);
    idGroups.set(k, ids);
    for (let i = 1; i < sorted.length; i++) {
      duplicateIds.add(sorted[i].id);
    }
  }

  return { duplicateIds, keepIds, groups: idGroups };
}

/** Batch içi: aynı anahtarın 2+ kopyası — ilk hariç kopya. */
export function markBatchDuplicates<T extends { key: string; capturedAt?: string }>(
  items: T[],
  keyOf: (item: T) => string | null,
  existingKeys?: Set<string>
): Set<string> {
  const seen = new Map<string, string>(); // fingerprint -> first item key
  const dupKeys = new Set<string>();

  const sorted = [...items].sort((a, b) => {
    const ta = a.capturedAt ? Date.parse(a.capturedAt) : 0;
    const tb = b.capturedAt ? Date.parse(b.capturedAt) : 0;
    return ta - tb;
  });

  for (const item of sorted) {
    const k = keyOf(item);
    if (!k) continue;
    if (existingKeys?.has(k)) {
      dupKeys.add(item.key);
      continue;
    }
    const first = seen.get(k);
    if (first) dupKeys.add(item.key);
    else seen.set(k, item.key);
  }

  return dupKeys;
}
