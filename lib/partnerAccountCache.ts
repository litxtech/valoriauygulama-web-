import {
  fetchPartnerPortalAccountSnapshot,
  fetchPartnerPortalOpenBalance,
  fetchPartnerMonthStats,
  fetchPartnerPaymentHistory,
  fetchPartnerLifetimeAmountTotal,
  type PartnerPaymentRow,
} from '@/lib/breakfastPartner';
import { sleepMs } from '@/lib/supabaseTransientErrors';

export type PartnerAccountSnapshot = {
  openBalance: number;
  monthAmount: number;
  monthGuests: number;
  totalAmount: number;
  payments: PartnerPaymentRow[];
};

const cache = new Map<string, PartnerAccountSnapshot>();
const inflight = new Map<string, Promise<PartnerAccountSnapshot>>();

export function getPartnerAccountCache(hotelId: string): PartnerAccountSnapshot | undefined {
  return cache.get(hotelId);
}

export function setPartnerAccountCache(hotelId: string, snap: PartnerAccountSnapshot): void {
  cache.set(hotelId, snap);
}

export function invalidatePartnerAccountCache(hotelId?: string): void {
  if (hotelId) {
    cache.delete(hotelId);
    inflight.delete(hotelId);
    return;
  }
  cache.clear();
  inflight.clear();
}

async function fetchAccountSnapshot(hotelId: string): Promise<PartnerAccountSnapshot> {
  try {
    const snap = await fetchPartnerPortalAccountSnapshot(40);
    return {
      openBalance: snap.openBalance,
      monthAmount: snap.monthAmountTotal,
      monthGuests: snap.monthGuestTotal,
      totalAmount: snap.lifetimeTotal,
      payments: snap.payments,
    };
  } catch {
    const [balance, stats, payRows, lifetimeTotal] = await Promise.all([
      fetchPartnerPortalOpenBalance(),
      fetchPartnerMonthStats(hotelId).catch(() => ({
        monthGuestTotal: 0,
        monthAmountTotal: 0,
        entryCount: 0,
      })),
      fetchPartnerPaymentHistory(40).catch(() => [] as PartnerPaymentRow[]),
      fetchPartnerLifetimeAmountTotal(hotelId).catch(() => 0),
    ]);
    return {
      openBalance: balance,
      monthAmount: stats.monthAmountTotal,
      monthGuests: stats.monthGuestTotal,
      totalAmount: lifetimeTotal,
      payments: payRows,
    };
  }
}

export async function loadPartnerAccountSnapshot(
  hotelId: string,
  opts?: { force?: boolean }
): Promise<PartnerAccountSnapshot> {
  if (!opts?.force && cache.has(hotelId)) {
    return cache.get(hotelId)!;
  }

  const pending = inflight.get(hotelId);
  if (pending && !opts?.force) return pending;

  if (opts?.force) {
    inflight.delete(hotelId);
  }

  const task = fetchAccountSnapshot(hotelId)
    .then((snap) => {
      cache.set(hotelId, snap);
      return snap;
    })
    .finally(() => {
      inflight.delete(hotelId);
    });

  inflight.set(hotelId, task);
  return task;
}

/** Ödeme sonrası webhook gecikmesine karşı birkaç kez yeniler. */
export async function refreshPartnerAccountAfterPayment(
  hotelId: string,
  opts?: { previousBalance?: number }
): Promise<PartnerAccountSnapshot> {
  invalidatePartnerAccountCache(hotelId);
  const prev = opts?.previousBalance;
  let last = await loadPartnerAccountSnapshot(hotelId, { force: true });

  if (prev == null || Math.abs(last.openBalance - prev) > 0.009) {
    return last;
  }

  for (const delayMs of [1200, 2500, 4500]) {
    await sleepMs(delayMs);
    invalidatePartnerAccountCache(hotelId);
    last = await loadPartnerAccountSnapshot(hotelId, { force: true });
    if (Math.abs(last.openBalance - prev) > 0.009) break;
  }

  return last;
}

export function preloadPartnerAccountSnapshot(hotelId: string): void {
  if (cache.has(hotelId) || inflight.has(hotelId)) return;
  void loadPartnerAccountSnapshot(hotelId);
}
