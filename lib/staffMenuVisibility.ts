import type { StaffHamburgerMenuItem, StaffHamburgerMenuSection } from '@/lib/staffHamburgerMenu';
import { isStaffMenuItemHidden, normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';

export type StaffMenuVisibilitySlice = {
  hidden_menu_item_ids?: unknown;
} | null | undefined;

export function getStaffHiddenMenuIds(staff: StaffMenuVisibilitySlice): string[] {
  return normalizeHiddenMenuItemIds(staff?.hidden_menu_item_ids);
}

export function filterStaffMenuSectionsByHidden(
  sections: StaffHamburgerMenuSection[],
  staff: StaffMenuVisibilitySlice
): StaffHamburgerMenuSection[] {
  const hidden = getStaffHiddenMenuIds(staff);
  if (hidden.length === 0) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !isStaffMenuItemHidden(hidden, item.id)),
    }))
    .filter((s) => s.items.length > 0);
}

export function filterStaffMenuItemsByHidden(
  items: StaffHamburgerMenuItem[],
  staff: StaffMenuVisibilitySlice
): StaffHamburgerMenuItem[] {
  const hidden = getStaffHiddenMenuIds(staff);
  if (hidden.length === 0) return items;
  return items.filter((item) => !isStaffMenuItemHidden(hidden, item.id));
}
