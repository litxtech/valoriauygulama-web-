import type { StaffHamburgerMenuSection, StaffHamburgerMenuSectionId } from '@/lib/staffHamburgerTypes';
import { DEFAULT_HAMBURGER_SECTION_ORDER, STAFF_HAMBURGER_HUB_ITEM_IDS } from '@/lib/staffHamburgerTypes';
import { normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';
import {
  applyStaffHamburgerSectionTitles,
  defaultStaffHamburgerTheme,
  normalizeStaffHamburgerTheme,
  type StaffHamburgerThemeConfig,
} from '@/lib/staffHamburgerTheme';

export type { StaffHamburgerThemeConfig };

export { DEFAULT_HAMBURGER_SECTION_ORDER } from '@/lib/staffHamburgerTypes';

export type StaffHamburgerLayoutConfig = {
  /** Bölüm sırası */
  sectionOrder?: string[];
  /** Menü öğelerinin tercih sırası (runtime'da olmayanlar atlanır) */
  itemOrder?: string[];
  /** İşletme geneli — tüm personelde hamburgerden gizli */
  hiddenItemIds?: string[];
  /** Üst tam genişlik buton (varsayılan: acil durum) */
  primaryItemId?: string | null;
  /** Hub kart sırası */
  hubItemIds?: string[];
  /** Renk, düzen ve görünüm */
  theme?: StaffHamburgerThemeConfig;
};

export function normalizeStaffHamburgerLayout(raw: unknown): StaffHamburgerLayoutConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const sectionOrder = Array.isArray(o.sectionOrder)
    ? o.sectionOrder.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined;
  const itemOrder = Array.isArray(o.itemOrder)
    ? o.itemOrder.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined;
  const hiddenItemIds = Array.isArray(o.hiddenItemIds) ? normalizeHiddenMenuItemIds(o.hiddenItemIds) : undefined;
  const hubItemIds = Array.isArray(o.hubItemIds)
    ? o.hubItemIds.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : undefined;
  let primaryItemId: string | null | undefined;
  if (o.primaryItemId === null) primaryItemId = null;
  else if (typeof o.primaryItemId === 'string' && o.primaryItemId.trim()) primaryItemId = o.primaryItemId.trim();
  const theme = normalizeStaffHamburgerTheme(o.theme);

  return {
    sectionOrder: sectionOrder?.length ? sectionOrder : undefined,
    itemOrder: itemOrder?.length ? itemOrder : undefined,
    hiddenItemIds: hiddenItemIds?.length ? hiddenItemIds : undefined,
    primaryItemId,
    hubItemIds: hubItemIds?.length ? hubItemIds : undefined,
    theme,
  };
}

function sortByOrder<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order?.length) return items;
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : 9999;
    const rb = rank.has(b.id) ? rank.get(b.id)! : 9999;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });
}

export function applyStaffHamburgerLayout(
  sections: StaffHamburgerMenuSection[],
  layout: StaffHamburgerLayoutConfig | null | undefined
): StaffHamburgerMenuSection[] {
  if (!layout) return sections;
  const hidden = new Set(layout.hiddenItemIds ?? []);
  const sectionOrder = layout.sectionOrder?.length ? layout.sectionOrder : DEFAULT_HAMBURGER_SECTION_ORDER;
  const sectionRank = new Map(sectionOrder.map((id, i) => [id, i]));

  const filtered = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !hidden.has(item.id)),
    }))
    .filter((s) => s.items.length > 0);

  const orderedSections = [...filtered].sort((a, b) => {
    const ra = sectionRank.has(a.id) ? sectionRank.get(a.id)! : 9999;
    const rb = sectionRank.has(b.id) ? sectionRank.get(b.id)! : 9999;
    if (ra !== rb) return ra - rb;
    return a.id.localeCompare(b.id);
  });

  return orderedSections.map((section) => ({
    ...section,
    items: sortByOrder(section.items, layout.itemOrder),
  }));
}

export function finalizeStaffHamburgerSections(
  sections: StaffHamburgerMenuSection[],
  layout: StaffHamburgerLayoutConfig | null | undefined
): StaffHamburgerMenuSection[] {
  const ordered = applyStaffHamburgerLayout(sections, layout);
  return applyStaffHamburgerSectionTitles(ordered, layout?.theme);
}

export function resolveHamburgerPrimaryItemId(layout: StaffHamburgerLayoutConfig | null | undefined): string | null {
  if (layout && 'primaryItemId' in (layout ?? {})) {
    if (layout?.primaryItemId === null) return null;
    if (layout?.primaryItemId) return layout.primaryItemId;
  }
  return 'emergency';
}

export function resolveHamburgerHubItemIds(layout: StaffHamburgerLayoutConfig | null | undefined): string[] {
  const defaults = [...STAFF_HAMBURGER_HUB_ITEM_IDS];
  if (!layout?.hubItemIds?.length) return defaults;
  const ordered = layout.hubItemIds.filter((id) => defaults.includes(id as (typeof defaults)[number]));
  for (const id of defaults) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

/** Mevcut menüden varsayılan sıra çıkar (ilk kayıt) */
export function deriveDefaultHamburgerLayout(sections: StaffHamburgerMenuSection[]): StaffHamburgerLayoutConfig {
  return {
    sectionOrder: sections.map((s) => s.id),
    itemOrder: sections.flatMap((s) => (s.items ?? []).map((i) => i.id)),
    hiddenItemIds: [],
    primaryItemId: 'emergency',
    hubItemIds: [...STAFF_HAMBURGER_HUB_ITEM_IDS],
    theme: defaultStaffHamburgerTheme(),
  };
}

export function moveInList(list: string[], id: string, direction: -1 | 1): string[] {
  const idx = list.indexOf(id);
  if (idx < 0) return list;
  const next = idx + direction;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item);
  return copy;
}

export function swapInList(list: string[], a: string, b: string): string[] {
  const ia = list.indexOf(a);
  const ib = list.indexOf(b);
  if (ia < 0 || ib < 0) return list;
  const copy = [...list];
  copy[ia] = b;
  copy[ib] = a;
  return copy;
}
