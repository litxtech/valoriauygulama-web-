import { scanPosReceiptFromDocument } from '@/lib/posReceiptInvoice/scanPosReceipt';
import { draftFromParsed, savePosReceiptInvoice } from '@/lib/posReceiptInvoice/api';
import { computePosInvoiceTotals, formatTry } from '@/lib/posReceiptInvoice/totals';
import {
  applyDateQaWarnings,
  validateBatchReceiptDates,
} from '@/lib/posReceiptInvoice/validatePosDates';
import type { ParsedPosReceipt, PosVenueScope } from '@/lib/posReceiptInvoice/types';
import type { PickedInvoiceDocument } from '@/lib/financeInvoiceDocumentPick';

export type BatchReceiptProgressStatus =
  | 'queued'
  | 'scanning'
  | 'review'
  | 'saving'
  | 'done'
  | 'error'
  | 'rejected';

export type BatchReceiptItem = {
  key: string;
  uri: string;
  fileName: string;
  status: BatchReceiptProgressStatus;
  error?: string;
  id?: string;
  /** Cihazda çekildiği / seçildiği an (ISO) — saat gruplaması */
  capturedAt?: string;
  merchantName?: string | null;
  receiptNo?: string | null;
  receiptDate?: string | null;
  invoiceDueOn?: string | null;
  receiptTotal?: number | null;
  invoiceCutAmount?: number | null;
  vatAmount?: number | null;
  paymentBank?: string | null;
  paymentMethod?: string | null;
  cardLast4?: string | null;
  confidence?: ParsedPosReceipt['confidence'] | null;
  warnings?: string[];
  /** Onay öncesi parse sonucu (kayda kadar tutulur) */
  parsed?: ParsedPosReceipt | null;
  selected?: boolean;
};

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

function fillFromParsed(parsed: ParsedPosReceipt): Partial<BatchReceiptItem> {
  const totals = computePosInvoiceTotals(parsed.lineItems, {
    receiptTotal: parsed.receiptTotal,
  });
  return {
    merchantName: parsed.merchantName,
    receiptNo: parsed.receiptNo,
    receiptDate: parsed.receiptDate,
    invoiceDueOn: parsed.invoiceDueOn ?? parsed.receiptDate,
    receiptTotal: parsed.receiptTotal,
    invoiceCutAmount: totals.invoiceCutAmount,
    vatAmount: totals.cutAmount,
    paymentBank: parsed.paymentBank,
    paymentMethod: parsed.paymentMethod,
    cardLast4: parsed.cardLast4,
    confidence: parsed.confidence,
    warnings: parsed.warnings,
    parsed,
  };
}

/**
 * Sadece OCR — kaydetmez. Her belge ayrı fiş olarak parse edilir.
 */
export async function batchScanPosReceipts(opts: {
  docs: PickedInvoiceDocument[];
  concurrency?: number;
  onItem?: (item: BatchReceiptItem, index: number) => void;
}): Promise<{ items: BatchReceiptItem[]; scanned: number; failed: number }> {
  const { docs, concurrency = 2, onItem } = opts;

  const items: BatchReceiptItem[] = docs.map((d, i) => ({
    key: `${d.uri}-${Date.now()}-${i}`,
    uri: d.uri,
    fileName: d.fileName || `fis-${i + 1}.jpg`,
    status: 'queued',
    selected: true,
    capturedAt: new Date().toISOString(),
  }));

  const emit = (index: number, patch: Partial<BatchReceiptItem>) => {
    const prev = items[index];
    items[index] = {
      ...prev,
      ...patch,
      // OCR patch capturedAt silmesin
      capturedAt: patch.capturedAt ?? prev.capturedAt,
    };
    onItem?.(items[index], index);
  };

  await mapPool(docs, concurrency, async (doc, index) => {
    emit(index, { status: 'scanning', error: undefined });
    try {
      let parsed = await scanPosReceiptFromDocument(doc);
      // Tutar veya tarih yoksa kısa bekleyip yeniden dene
      if (parsed.receiptTotal == null || !parsed.receiptDate) {
        await new Promise((r) => setTimeout(r, 350));
        try {
          const retry = await scanPosReceiptFromDocument(doc);
          const betterTotal =
            retry.receiptTotal != null &&
            (parsed.receiptTotal == null ||
              (retry.rawText?.length ?? 0) > (parsed.rawText?.length ?? 0) + 20);
          const betterDate = !!retry.receiptDate && !parsed.receiptDate;
          if (betterTotal || betterDate || (retry.rawText?.length ?? 0) > (parsed.rawText?.length ?? 0) + 40) {
            // Tutar kaybını önle
            if (retry.receiptTotal == null && parsed.receiptTotal != null) {
              parsed = {
                ...retry,
                receiptTotal: parsed.receiptTotal,
                lineItems: retry.lineItems?.length ? retry.lineItems : parsed.lineItems,
              };
            } else {
              parsed = retry;
            }
          }
        } catch {
          /* ilk sonuç kalsın */
        }
      }
      emit(index, {
        ...fillFromParsed(parsed),
        status: 'review',
        selected: true,
        error: undefined,
        warnings: [
          ...(parsed.warnings ?? []),
          ...(parsed.receiptTotal == null ? ['Tutar okunamadı — onayda elle girin'] : []),
          ...(parsed.receiptDate == null ? ['Tarih okunamadı — AI kontrol veya elle girin'] : []),
        ],
      });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 400));
      try {
        const parsed = await scanPosReceiptFromDocument(doc);
        emit(index, {
          ...fillFromParsed(parsed),
          status: 'review',
          selected: true,
          error: undefined,
          warnings: [
            ...(parsed.warnings ?? []),
            ...(parsed.receiptTotal == null ? ['Tutar okunamadı — onayda elle girin'] : []),
          ],
        });
      } catch {
        emit(index, {
          status: 'error',
          selected: false,
          error: (e as Error)?.message ?? 'Okunamadı',
          parsed: null,
        });
      }
    }
  });

  const scanned = items.filter((x) => x.status === 'review').length;
  const failed = items.filter((x) => x.status === 'error').length;

  const qa = validateBatchReceiptDates(
    items.map((it) => ({
      key: it.key,
      receiptDate: it.invoiceDueOn || it.receiptDate,
      warnings: it.warnings,
    }))
  );
  const withQa = applyDateQaWarnings(items, qa);
  for (let i = 0; i < withQa.length; i++) {
    items[i] = withQa[i];
    onItem?.(items[i], i);
  }

  return { items, scanned, failed };
}

/**
 * Onay öncesi: yerel görsellerden tarih/alanları son OCR ile tekrar okur.
 * Tutar korunur eğer yeni okumada tutar yoksa.
 */
export async function batchRereadDatesOnItems(opts: {
  items: BatchReceiptItem[];
  onItem?: (item: BatchReceiptItem, index: number) => void;
}): Promise<{ items: BatchReceiptItem[]; updated: number; failed: number; dateFixed: number }> {
  const items = opts.items.map((x) => ({ ...x }));
  const emit = (index: number, patch: Partial<BatchReceiptItem>) => {
    items[index] = { ...items[index], ...patch };
    opts.onItem?.(items[index], index);
  };

  let updated = 0;
  let failed = 0;
  let dateFixed = 0;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.status !== 'review' && item.status !== 'error') continue;
    if (!item.uri) continue;

    const prevDate = item.invoiceDueOn || item.receiptDate || null;
    emit(index, { status: 'scanning', error: undefined });
    try {
      const doc: PickedInvoiceDocument = {
        uri: item.uri,
        fileName: item.fileName || 'fis.jpg',
        kind: 'image',
      };
      let parsed = await scanPosReceiptFromDocument(doc);
      if (!parsed.receiptDate) {
        await new Promise((r) => setTimeout(r, 300));
        try {
          const retry = await scanPosReceiptFromDocument(doc);
          if (retry.receiptDate || (retry.rawText?.length ?? 0) > (parsed.rawText?.length ?? 0)) {
            parsed = retry;
          }
        } catch {
          /* ilk kalsın */
        }
      }

      // Yeni okumada tutar yoksa eski tutarı koru
      if (parsed.receiptTotal == null && item.receiptTotal != null) {
        parsed = {
          ...parsed,
          receiptTotal: item.receiptTotal,
          lineItems:
            parsed.lineItems?.length > 0
              ? parsed.lineItems
              : item.parsed?.lineItems?.length
                ? item.parsed.lineItems
                : parsed.lineItems,
        };
      }

      const filled = fillFromParsed(parsed);
      const nextDate = filled.invoiceDueOn || filled.receiptDate || null;
      if (prevDate !== nextDate) dateFixed += 1;
      updated += 1;
      emit(index, {
        ...filled,
        status: 'review',
        selected: item.selected !== false,
        error: undefined,
        warnings: [
          ...(parsed.warnings ?? []),
          ...(parsed.receiptDate ? [] : ['Tarih yine okunamadı — kayıttan sonra elle düzeltin']),
        ],
      });
    } catch (e) {
      failed += 1;
      emit(index, {
        status: item.parsed ? 'review' : 'error',
        selected: item.parsed ? item.selected !== false : false,
        error: (e as Error)?.message ?? 'Tarih yeniden okunamadı',
      });
    }
  }

  const qa = validateBatchReceiptDates(
    items.map((it) => ({
      key: it.key,
      receiptDate: it.invoiceDueOn || it.receiptDate,
      warnings: it.warnings,
    }))
  );
  const withQa = applyDateQaWarnings(items, qa);
  for (let i = 0; i < withQa.length; i++) {
    items[i] = withQa[i];
    opts.onItem?.(items[i], i);
  }

  return { items, updated, failed, dateFixed };
}

/**
 * Onaylanan fişleri kaydet (paralel, sınırlı eşzamanlılık).
 */
export async function batchSaveApprovedPosReceipts(opts: {
  items: BatchReceiptItem[];
  organizationId: string;
  createdByStaffId?: string | null;
  venueScope: PosVenueScope;
  onItem?: (item: BatchReceiptItem, index: number) => void;
  concurrency?: number;
}): Promise<{ items: BatchReceiptItem[]; saved: number; failed: number }> {
  const { organizationId, createdByStaffId, venueScope, onItem, concurrency = 3 } = opts;
  const items = opts.items.map((x) => ({ ...x }));

  const emit = (index: number, patch: Partial<BatchReceiptItem>) => {
    items[index] = { ...items[index], ...patch };
    onItem?.(items[index], index);
  };

  const indexes = items.map((_, i) => i);

  await mapPool(indexes, concurrency, async (index) => {
    const item = items[index];
    if (item.status === 'rejected' || item.selected === false) {
      emit(index, { status: 'rejected', selected: false });
      return;
    }
    if (item.status === 'done' && item.id) return;
    if (item.status === 'error' && !item.parsed) return;

    emit(index, { status: 'saving', error: undefined });
    try {
      if (!item.parsed) {
        emit(index, { status: 'error', error: 'Okuma sonucu yok — yeniden çekin' });
        return;
      }
      const draft = draftFromParsed(item.parsed, [item.uri], venueScope);
      const res = await savePosReceiptInvoice({
        ...draft,
        organizationId,
        createdByStaffId,
        venueScope,
        status: item.parsed.receiptTotal != null ? 'ready' : 'draft',
      });
      if ('error' in res) {
        emit(index, { status: 'error', error: res.error });
        return;
      }
      emit(index, { status: 'done', id: res.id, selected: true });
    } catch (e) {
      emit(index, {
        status: 'error',
        error: (e as Error)?.message ?? 'Kaydedilemedi',
      });
    }
  });

  const saved = items.filter((x) => x.status === 'done').length;
  const failed = items.filter((x) => x.status === 'error').length;
  return { items, saved, failed };
}

/** @deprecated use batchScanPosReceipts + batchSaveApprovedPosReceipts */
export async function batchScanAndSavePosReceipts(opts: {
  docs: PickedInvoiceDocument[];
  organizationId: string;
  createdByStaffId?: string | null;
  venueScope: PosVenueScope;
  concurrency?: number;
  onItem?: (item: BatchReceiptItem, index: number) => void;
}): Promise<{ items: BatchReceiptItem[]; saved: number; failed: number }> {
  const scanned = await batchScanPosReceipts({
    docs: opts.docs,
    concurrency: opts.concurrency,
    onItem: opts.onItem,
  });
  return batchSaveApprovedPosReceipts({
    items: scanned.items,
    organizationId: opts.organizationId,
    createdByStaffId: opts.createdByStaffId,
    venueScope: opts.venueScope,
    onItem: opts.onItem,
  });
}

/** Onay listesi: en yeni fiş tarihi üstte, tutarsızlar alta */
export function sortBatchItemsByDue(items: BatchReceiptItem[]): BatchReceiptItem[] {
  return [...items].sort((a, b) => {
    const aErr = a.status === 'error' || !(a.receiptTotal != null && a.receiptTotal > 0) ? 1 : 0;
    const bErr = b.status === 'error' || !(b.receiptTotal != null && b.receiptTotal > 0) ? 1 : 0;
    if (aErr !== bErr) return aErr - bErr;

    const da = a.receiptDate || a.invoiceDueOn || '';
    const db = b.receiptDate || b.invoiceDueOn || '';
    if (da && db && da !== db) return db.localeCompare(da);
    if (da && !db) return -1;
    if (!da && db) return 1;

    const ta = a.receiptTotal ?? 0;
    const tb = b.receiptTotal ?? 0;
    if (tb !== ta) return tb - ta;
    return (a.merchantName || '').localeCompare(b.merchantName || '', 'tr');
  });
}

/** Çekim saatine göre grup anahtarı: YYYY-MM-DDTHH */
export function captureHourKey(iso: string | null | undefined): string {
  if (!iso) return '_none';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '_none';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

export function captureHourLabel(hourKey: string): string {
  if (hourKey === '_none') return 'Çekim saati yok';
  const m = hourKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return hourKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), 0, 0);
  const dayPart = d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const hh = m[4];
  const next = String((Number(hh) + 1) % 24).padStart(2, '0');
  return `${dayPart} · ${hh}:00–${next}:00`;
}

export type BatchHourSection = {
  hourKey: string;
  title: string;
  data: BatchReceiptItem[];
};

/** Çekilen fişleri saat dilimine göre grupla (yeni saat üstte) */
export function groupBatchItemsByCaptureHour(items: BatchReceiptItem[]): BatchHourSection[] {
  const map = new Map<string, BatchReceiptItem[]>();
  for (const it of items) {
    const key = captureHourKey(it.capturedAt);
    const list = map.get(key) ?? [];
    list.push(it);
    map.set(key, list);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === '_none') return 1;
    if (b === '_none') return -1;
    return b.localeCompare(a);
  });
  return keys.map((hourKey) => {
    const data = [...(map.get(hourKey) ?? [])].sort((a, b) => {
      const ca = a.capturedAt || '';
      const cb = b.capturedAt || '';
      if (ca !== cb) return cb.localeCompare(ca);
      return (a.fileName || '').localeCompare(b.fileName || '', 'tr');
    });
    return { hourKey, title: captureHourLabel(hourKey), data };
  });
}

export function formatBatchAmount(n: number | null | undefined): string {
  if (n == null || !(n > 0)) return '—';
  return `${formatTry(n)} ₺`;
}

export function sumBatchReceiptTotals(items: BatchReceiptItem[]): {
  count: number;
  receiptTotal: number;
  matrahTotal: number;
} {
  const ok = items.filter(
    (x) =>
      (x.status === 'review' || x.status === 'done' || x.status === 'saving') &&
      x.selected !== false &&
      x.receiptTotal != null &&
      x.receiptTotal > 0
  );
  return {
    count: ok.length,
    receiptTotal: ok.reduce((s, x) => s + (x.receiptTotal ?? 0), 0),
    matrahTotal: ok.reduce((s, x) => s + (x.invoiceCutAmount ?? 0), 0),
  };
}
