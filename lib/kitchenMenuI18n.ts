import type { HotelKitchenMenuItemRow } from '@/lib/hotelKitchenMenuTypes';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

export type KitchenMenuI18nFields = {
  nameEn?: string | null;
  nameAr?: string | null;
  descriptionEn?: string | null;
  descriptionAr?: string | null;
  categoryTitleEn?: string | null;
  categoryTitleAr?: string | null;
};

function pickLocalized(
  tr: string,
  en: string | null | undefined,
  ar: string | null | undefined,
  lang: PublicMenuLang
): string {
  if (lang === 'en') return en?.trim() || tr;
  if (lang === 'ar') return ar?.trim() || tr;
  return tr;
}

export function resolveKitchenMenuItemName(
  item: Pick<HotelKitchenMenuItemRow, 'name' | 'name_en' | 'name_ar'>,
  lang: PublicMenuLang = 'tr'
): string {
  return pickLocalized(item.name, item.name_en, item.name_ar, lang);
}

export function resolveKitchenMenuItemDescription(
  item: Pick<HotelKitchenMenuItemRow, 'description' | 'description_en' | 'description_ar'>,
  lang: PublicMenuLang = 'tr'
): string | null {
  const tr = item.description?.trim() || null;
  if (lang === 'tr') return tr;
  const localized = pickLocalized(tr ?? '', item.description_en, item.description_ar, lang).trim();
  return localized || tr;
}

export function resolveKitchenMenuCategoryTitle(
  item: Pick<HotelKitchenMenuItemRow, 'category_title' | 'category_title_en' | 'category_title_ar'>,
  lang: PublicMenuLang = 'tr'
): string {
  return pickLocalized(item.category_title, item.category_title_en, item.category_title_ar, lang);
}

export function localizedCategoryLabel(
  items: HotelKitchenMenuItemRow[],
  canonicalTitle: string,
  lang: PublicMenuLang
): string {
  if (lang === 'tr') return canonicalTitle;
  const item = items.find((row) => row.category_title.trim() === canonicalTitle.trim());
  if (!item) return canonicalTitle;
  return resolveKitchenMenuCategoryTitle(item, lang);
}

export function localizedProductLabel(
  items: HotelKitchenMenuItemRow[],
  canonicalName: string,
  lang: PublicMenuLang
): string {
  if (lang === 'tr') return canonicalName;
  const key = canonicalName.trim().toLocaleLowerCase('tr');
  const item = items.find((row) => row.name.trim().toLocaleLowerCase('tr') === key);
  if (!item) return canonicalName;
  return resolveKitchenMenuItemName(item, lang);
}
