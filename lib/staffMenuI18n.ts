import type { TFunction } from 'i18next';
import { STAFF_MENU_CATALOG, STAFF_MENU_SECTION_LABELS_TR, type StaffMenuCatalogSection } from '@/lib/staffMenuCatalog';

/** Hamburger / katalog menü etiketi — `staffMenu_<id>` anahtarı, yoksa labelTr. */
export function staffMenuLabel(t: TFunction, itemId: string): string {
  const key = `staffMenu_${itemId}`;
  const v = t(key);
  if (v !== key) return v;
  return STAFF_MENU_CATALOG.find((e) => e.id === itemId)?.labelTr ?? itemId;
}

export function staffMenuSectionLabel(t: TFunction, section: StaffMenuCatalogSection): string {
  const key = `staffMenuSection_${section}`;
  const v = t(key);
  if (v !== key) return v;
  return STAFF_MENU_SECTION_LABELS_TR[section];
}
