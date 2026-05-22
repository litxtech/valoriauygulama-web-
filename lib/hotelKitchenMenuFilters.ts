import type { HotelKitchenMenuItemRow } from '@/lib/hotelKitchenMenuTypes';
import { isBreakfastCategory } from '@/lib/hotelKitchenMenu';

const STOPWORDS = new Set([
  've',
  'ile',
  'veya',
  'bir',
  'the',
  'and',
  'for',
  'menü',
  'menu',
  'otel',
  'taze',
  'özel',
  'special',
]);

export type MenuSectionFilter = 'all' | 'breakfast';

export type CategoryChip = { title: string; count: number };

export type ProductChip = { name: string; count: number };

export type NameTagChip = { tag: string; label: string; count: number };

function norm(s: string): string {
  return s.trim().toLocaleLowerCase('tr');
}

export function applySectionFilter<T extends HotelKitchenMenuItemRow>(
  items: T[],
  section: MenuSectionFilter
): T[] {
  if (section !== 'breakfast') return items;
  return items.filter((i) => isBreakfastCategory(i.category_title));
}

export function buildCategoryChips(items: HotelKitchenMenuItemRow[], section: MenuSectionFilter): CategoryChip[] {
  const scoped = applySectionFilter(items, section);
  const map = new Map<string, { title: string; count: number }>();
  for (const it of scoped) {
    const title = it.category_title.trim();
    if (!title) continue;
    const key = norm(title);
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { title, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'tr'));
}

/** Aynı kategoride birden fazla ürün varsa ürün adına göre çeşit filtreleri */
export function buildProductChips(
  items: HotelKitchenMenuItemRow[],
  section: MenuSectionFilter,
  categoryFilter: string | null
): ProductChip[] {
  let scoped = applySectionFilter(items, section);
  if (categoryFilter) {
    const cat = norm(categoryFilter);
    scoped = scoped.filter((i) => norm(i.category_title) === cat);
  }
  if (scoped.length < 2 || scoped.length > 24) return [];

  const map = new Map<string, { name: string; count: number }>();
  for (const it of scoped) {
    const name = it.name.trim();
    if (!name) continue;
    const key = norm(name);
    const hit = map.get(key);
    if (hit) hit.count += 1;
    else map.set(key, { name, count: 1 });
  }
  const chips = [...map.values()];
  if (chips.length < 2) return [];
  return chips.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function tokenizeName(name: string): string[] {
  return name
    .split(/[\s,–—\-/|()+]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(norm(w)));
}

/** Ortak kelimeler (ör. birden fazla ürün adında "kebap") */
export function buildNameTagChips(
  items: HotelKitchenMenuItemRow[],
  section: MenuSectionFilter,
  categoryFilter: string | null,
  productFilter: string | null
): NameTagChip[] {
  if (productFilter) return [];

  let scoped = applySectionFilter(items, section);
  if (categoryFilter) {
    const cat = norm(categoryFilter);
    scoped = scoped.filter((i) => norm(i.category_title) === cat);
  }
  if (scoped.length < 2) return [];

  const counts = new Map<string, number>();
  for (const it of scoped) {
    const seen = new Set<string>();
    for (const raw of tokenizeName(it.name)) {
      const tag = norm(raw);
      if (seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .map(([tag, count]) => ({
      tag,
      label: tag.charAt(0).toLocaleUpperCase('tr') + tag.slice(1),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'tr'))
    .slice(0, 12);
}

export function filterMenuItems<T extends HotelKitchenMenuItemRow>(params: {
  items: T[];
  section: MenuSectionFilter;
  categoryFilter: string | null;
  productFilter: string | null;
  tagFilter: string | null;
  search: string;
}): T[] {
  let list = applySectionFilter(params.items, params.section);

  if (params.categoryFilter) {
    const cat = norm(params.categoryFilter);
    list = list.filter((i) => norm(i.category_title) === cat);
  }

  if (params.productFilter) {
    const name = norm(params.productFilter);
    list = list.filter((i) => norm(i.name) === name);
  } else if (params.tagFilter) {
    const tag = norm(params.tagFilter);
    list = list.filter((i) => norm(i.name).includes(tag));
  }

  const q = params.search.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.category_title.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q)
    );
  }

  return list;
}
