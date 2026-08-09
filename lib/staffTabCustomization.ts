import type { StaffHamburgerMenuItem, StaffHamburgerMenuLayout } from '@/lib/staffHamburgerTypes';
import { STAFF_TAB_MAX_PINS } from '@/stores/staffTabPinsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TFunction } from 'i18next';
import {
  canAccessOccupancyOps,
  canAccessRoomPaymentBoard,
  hasStaffAppPermission,
  type StaffPermissionSlice,
} from '@/lib/staffPermissions';

/**
 * İlk kurulum / boş pin listesi varsayılan sırası.
 * Mesaj, Kimlik, Admin, Profil düzenlenebilir (kaldırılabilir).
 */
export const DEFAULT_TAB_PIN_IDS = [
  'tasks',
  'pos_receipt_list',
  'pos_receipt_invoice',
  'messages',
  'id_capture',
  'admin',
  'profile',
] as const;

/** Ana sayfa (index) sabit kalır; düzenleme ekranından çıkarılmaz */
export const STAFF_TAB_PIN_EXCLUDE_IDS = new Set(['home', 'tab_customize']);

/**
 * Menü öğesi id → Tabs.Screen route adı.
 * Varsa navigation.navigate(route); yoksa router.push(href).
 */
export const STAFF_TAB_NATIVE_ROUTE_BY_PIN_ID: Record<string, string> = {
  tasks: 'tasks',
  emergency: 'emergency',
  acceptances: 'acceptances',
  messages: 'messages',
  notifications: 'notifications',
  id_capture: 'id-capture',
  admin: 'admin',
  profile: 'profile',
};

const SEED_KEY_PREFIX = 'staff_tab_pins_default_seeded_v2_';

function seedKey(staffId: string) {
  return `${SEED_KEY_PREFIX}${staffId}`;
}

/** Tab çubuğundaki kalıcı sekmeler — artık pin olarak düzenlenebilir */
export function buildStaffCoreTabPinExtras(
  t: TFunction,
  opts: { canIdCapture: boolean; isAdmin: boolean }
): StaffHamburgerMenuItem[] {
  const out: StaffHamburgerMenuItem[] = [
    {
      id: 'messages',
      label: t('messages'),
      href: '/staff/(tabs)/messages',
      icon: 'chatbubbles-outline',
      accent: '#2AABEE',
    },
  ];
  if (opts.canIdCapture) {
    out.push({
      id: 'id_capture',
      label: t('staffTabIdCapture'),
      href: '/staff/kbs/capture-id',
      icon: 'id-card-outline',
      accent: '#0d9488',
    });
  }
  if (opts.isAdmin) {
    out.push({
      id: 'admin',
      label: t('adminTab'),
      href: '/admin',
      icon: 'shield-outline',
      accent: '#6366f1',
    });
  }
  out.push({
    id: 'profile',
    label: t('myProfile'),
    href: '/staff/(tabs)/profile',
    icon: 'person-outline',
    accent: '#64748b',
  });
  return out;
}

/**
 * Hamburger’de kaçmış olabilecek operasyon özellikleri — alt menüye eklenebilir.
 */
export function buildStaffOpsTabPinExtras(
  staff: StaffPermissionSlice
): StaffHamburgerMenuItem[] {
  const out: StaffHamburgerMenuItem[] = [];
  if (canAccessRoomPaymentBoard(staff)) {
    out.push({
      id: 'payment_board',
      label: 'Oda Ödemeleri',
      href: '/staff/payment-board',
      icon: 'cash-outline',
      accent: '#0f766e',
    });
  }
  if (canAccessOccupancyOps(staff)) {
    out.push({
      id: 'checkout_board',
      label: 'Çıkış Odaları',
      href: '/staff/checkout-board',
      icon: 'exit-outline',
      accent: '#c2410c',
    });
    out.push({
      id: 'occupancy_ops',
      label: 'Konaklama operasyon',
      href: '/staff/occupancy/operations',
      icon: 'stats-chart-outline',
      accent: '#2563eb',
    });
  }
  if (
    hasStaffAppPermission(staff, 'housekeeping_yonetim') ||
    hasStaffAppPermission(staff, 'doluluk_operasyon') ||
    hasStaffAppPermission(staff, 'yarin_oda_temizlik_listesi')
  ) {
    out.push({
      id: 'cleaning',
      label: 'Yarın temizlik planı',
      href: '/staff/cleaning-plan',
      icon: 'sparkles-outline',
      accent: '#0d9488',
    });
  }
  if (hasStaffAppPermission(staff, 'odeme_al_qr') || hasStaffAppPermission(staff, 'stripe_odemeler')) {
    out.push({
      id: 'payments_hub',
      label: 'Tahsilat Merkezi',
      href: '/staff/payments',
      icon: 'grid-outline',
      accent: '#635bff',
    });
  }
  return out;
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

/** Tab’a eklenebilir özellikler (+ görevler / Mesaj / Kimlik gibi sekmeler) */
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

export function filterTabPinItemsByQuery(
  items: StaffHamburgerMenuItem[],
  query: string
): StaffHamburgerMenuItem[] {
  const q = query.trim().toLocaleLowerCase('tr');
  if (!q) return items;
  return items.filter((item) => {
    const label = (item.label ?? '').toLocaleLowerCase('tr');
    const id = (item.id ?? '').toLocaleLowerCase('tr');
    return label.includes(q) || id.includes(q);
  });
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
 * Kullanıcı kaldırmışsa tekrar zorla eklenmez.
 * Org `tabPins.defaultIds` varsa onu kullanır.
 */
export async function seedDefaultTabPinsIfNeeded(opts: {
  staffId: string;
  pinnedIds: string[];
  available: StaffHamburgerMenuItem[];
  setPinnedOrder: (staffId: string, ids: string[]) => Promise<void>;
  orgDefaultIds?: string[] | null;
}): Promise<boolean> {
  const { staffId, pinnedIds, available, setPinnedOrder, orgDefaultIds } = opts;
  if (pinnedIds.length > 0) return false;

  try {
    const already = await AsyncStorage.getItem(seedKey(staffId));
    if (already === '1') return false;
  } catch {
    /* devam et — seed dene */
  }

  const byId = new Map(available.map((i) => [i.id, i]));
  const preferred =
    orgDefaultIds?.length && orgDefaultIds.some((id) => byId.has(id))
      ? orgDefaultIds
      : [...DEFAULT_TAB_PIN_IDS];
  const defaults = preferred.filter((id) => byId.has(id)).slice(0, STAFF_TAB_MAX_PINS);
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
