import type { StaffHamburgerMenuItem, StaffHamburgerMenuLayout } from '@/lib/staffHamburgerTypes';
import { STAFF_TAB_MAX_PINS } from '@/stores/staffTabPinsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Muhasebe yetkisi olanlarda boş tab’a eklenecek varsayılanlar */
export const DEFAULT_TAB_PIN_IDS = ['tasks', 'pos_receipt_list', 'pos_receipt_invoice'] as const;

/** Zaten sabit tab olan / tab’a eklenmemesi gereken menü öğeleri */
export const STAFF_TAB_PIN_EXCLUDE_IDS = new Set([
  'home',
  'profile',
  'messages',
  'admin_tab',
  'admin',
  'tab_customize',
]);

/**
 * Menü öğesi id → Tabs.Screen route adı.
 * Varsa navigation.navigate(route); yoksa router.push(href).
 */
export const STAFF_TAB_NATIVE_ROUTE_BY_PIN_ID: Record<string, string> = {
  tasks: 'tasks',
  emergency: 'emergency',
  acceptances: 'acceptances',
};

const SEED_KEY_PREFIX = 'staff_tab_pins_default_seeded_v1_';

function seedKey(staffId: string) {
  return `${SEED_KEY_PREFIX}${staffId}`;
}

/** Layout’taki tüm izinli menü öğeleri (primary + hubs + sections) */
export function collectAvailableShortcutItems(
  layout: StaffHamburgerMenuLayout | null | undefined
): StaffHamburgerMenuItem[] {
  if (!layout) return [];
  const seen = new Set<string>();
  const out: StaffHamburgerMenuItem[] = [];
  const push = (item: StaffHamburgerMenuItem | null | undefined) => {
    if (!item?.id || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };
  push(layout.primary);
  for (const h of layout.hubs ?? []) push(h);
  for (const section of layout.sections ?? []) {
    for (const item of section.items ?? []) push(item);
  }
  return out;
}

/** Tab’a eklenebilir özellikler (+ görevler gibi menüde olmayabilen sekmeler) */
export function collectTabPinCandidates(
  layout: StaffHamburgerMenuLayout | null | undefined,
  extras: StaffHamburgerMenuItem[] = []
): StaffHamburgerMenuItem[] {
  const seen = new Set<string>();
  const out: StaffHamburgerMenuItem[] = [];
  const push = (item: StaffHamburgerMenuItem | null | undefined) => {
    if (!item?.id || seen.has(item.id)) return;
    if (STAFF_TAB_PIN_EXCLUDE_IDS.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  };
  for (const item of extras) push(item);
  for (const item of collectAvailableShortcutItems(layout)) push(item);
  return out;
}

export function resolveShortcutItems(
  available: StaffHamburgerMenuItem[],
  pinnedIds: string[]
): StaffHamburgerMenuItem[] {
  const byId = new Map(available.map((i) => [i.id, i]));
  return pinnedIds.map((id) => byId.get(id)).filter((i): i is StaffHamburgerMenuItem => !!i);
}

export function availableToAdd(
  available: StaffHamburgerMenuItem[],
  pinnedIds: string[]
): StaffHamburgerMenuItem[] {
  const pinned = new Set(pinnedIds);
  return available.filter((i) => !pinned.has(i.id));
}

/**
 * İlk açılışta pin boşsa varsayılan tab özelliklerini yazar.
 * Kullanıcı hepsini silerse tekrar seed edilmez.
 */
export async function seedDefaultTabPinsIfNeeded(opts: {
  staffId: string;
  pinnedIds: string[];
  available: StaffHamburgerMenuItem[];
  setPinnedOrder: (staffId: string, ids: string[]) => Promise<void>;
}): Promise<boolean> {
  const { staffId, pinnedIds, available, setPinnedOrder } = opts;
  if (pinnedIds.length > 0) return false;

  try {
    const already = await AsyncStorage.getItem(seedKey(staffId));
    if (already === '1') return false;
  } catch {
    /* devam et — seed dene */
  }

  const byId = new Map(available.map((i) => [i.id, i]));
  const defaults = DEFAULT_TAB_PIN_IDS.filter((id) => byId.has(id)).slice(0, STAFF_TAB_MAX_PINS);
  if (!defaults.length) {
    try {
      await AsyncStorage.setItem(seedKey(staffId), '1');
    } catch {
      /* ignore */
    }
    return false;
  }

  await setPinnedOrder(staffId, defaults);
  try {
    await AsyncStorage.setItem(seedKey(staffId), '1');
  } catch {
    /* ignore */
  }
  return true;
}

export function nativeTabRouteForPinId(pinId: string): string | null {
  return STAFF_TAB_NATIVE_ROUTE_BY_PIN_ID[pinId] ?? null;
}
