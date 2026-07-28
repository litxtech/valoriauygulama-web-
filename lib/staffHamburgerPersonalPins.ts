import type {
  StaffHamburgerMenuItem,
  StaffHamburgerMenuLayout,
  StaffHamburgerMenuSection,
} from '@/lib/staffHamburgerTypes';

/**
 * Kişisel sabitlenen öğeleri layout'tan ayırır — üste ayrı bölüm olarak gösterilir.
 * Primary (acil) sabitlenemez / tekrarlanmaz.
 */
export function applyPersonalPinsToLayout(
  layout: StaffHamburgerMenuLayout | null | undefined,
  pinnedIds: string[]
): {
  layout: StaffHamburgerMenuLayout | null;
  pinnedItems: StaffHamburgerMenuItem[];
} {
  if (!layout) return { layout: null, pinnedItems: [] };
  if (!pinnedIds.length) return { layout, pinnedItems: [] };

  const primaryId = layout.primary?.id ?? null;
  const pool: StaffHamburgerMenuItem[] = [];
  if (layout.primary) pool.push(layout.primary);
  for (const h of layout.hubs ?? []) pool.push(h);
  for (const section of layout.sections ?? []) {
    for (const item of section.items ?? []) pool.push(item);
  }
  const byId = new Map(pool.map((item) => [item.id, item]));

  const pinnedItems: StaffHamburgerMenuItem[] = [];
  const used = new Set<string>();
  for (const id of pinnedIds) {
    if (primaryId && id === primaryId) continue;
    const item = byId.get(id);
    if (!item || used.has(item.id)) continue;
    used.add(item.id);
    pinnedItems.push(item);
  }

  if (!pinnedItems.length) return { layout, pinnedItems: [] };

  const hubs = (layout.hubs ?? []).filter((h) => !used.has(h.id));
  const sections: StaffHamburgerMenuSection[] = (layout.sections ?? [])
    .map((section) => ({
      ...section,
      items: (section.items ?? []).filter((item) => !used.has(item.id)),
    }))
    .filter((s) => (s.items?.length ?? 0) > 0);

  return {
    layout: { ...layout, hubs, sections },
    pinnedItems,
  };
}
