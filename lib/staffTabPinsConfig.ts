import { STAFF_TAB_MAX_PINS } from '@/stores/staffTabPinsStore';

/** İşletme geneli — personel alt sekme varsayılanları / kilitler */
export type StaffTabPinsConfig = {
  /** Yeni / boş pin listesinde uygulanacak sıra */
  defaultIds?: string[];
  /** Personelin kaldıramayacağı sekmeler (her zaman görünür) */
  lockedIds?: string[];
};

export function normalizeStaffTabPinsConfig(raw: unknown): StaffTabPinsConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const defaultIds = normalizeIdList(o.defaultIds, STAFF_TAB_MAX_PINS);
  const lockedIds = normalizeIdList(o.lockedIds, STAFF_TAB_MAX_PINS);
  return {
    defaultIds: defaultIds.length ? defaultIds : undefined,
    lockedIds: lockedIds.length ? lockedIds : undefined,
  };
}

function normalizeIdList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== 'string') continue;
    const id = x.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Kilitli sekmeleri öne koyup personel pinleriyle birleştir.
 * Kilitliler kaldırılamaz; fazlalık MAX’e kırpılır (kilitliler öncelikli).
 */
export function mergePinnedIdsWithOrgLocks(
  pinnedIds: string[],
  config: StaffTabPinsConfig | null | undefined,
  availableIds: Set<string>
): string[] {
  const locked = (config?.lockedIds ?? []).filter((id) => availableIds.has(id));
  const lockedSet = new Set(locked);
  const user = pinnedIds.filter((id) => availableIds.has(id) && !lockedSet.has(id));
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of [...locked, ...user]) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
    if (merged.length >= STAFF_TAB_MAX_PINS) break;
  }
  return merged;
}

export function isOrgTabPinLocked(
  config: StaffTabPinsConfig | null | undefined,
  itemId: string
): boolean {
  return Boolean(config?.lockedIds?.includes(itemId));
}
