import type { StaffHamburgerMenuItem, StaffHamburgerMenuSection } from '@/lib/staffHamburgerMenu';
import { isStaffMenuItemHidden, normalizeHiddenMenuItemIds } from '@/lib/staffMenuCatalog';
import { APP_FEATURE_BY_ID } from '@/lib/appFeatureCatalog';
import { isFeatureVisibleInPlacement, type OrganizationUiFeaturesConfig } from '@/lib/organizationUiFeatures';

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

/** İşletme özellik yapılandırmasına göre hamburger öğelerini filtreler */
function menuItemFeatureId(itemId: string): string {
  if (itemId === 'kitchen_ops' || itemId.startsWith('kitchen_quick_')) return 'kitchen_ops';
  if (itemId.startsWith('payments_')) {
    const adminOnly = new Set([
      'payments_tips_lane',
      'payments_tips_confirm',
      'payments_kitchen_lane',
      'payments_hotel_lane',
      'payments_room_service',
      'payments_guest_extras',
      'payments_accounting',
      'payments_accounting_hub',
    ]);
    if (adminOnly.has(itemId)) return 'payments_admin';
    return 'payments';
  }
  return itemId;
}

export function filterStaffMenuSectionsByOrgFeatures(
  sections: StaffHamburgerMenuSection[],
  config: OrganizationUiFeaturesConfig | null | undefined
): StaffHamburgerMenuSection[] {
  if (!config) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const featureId = menuItemFeatureId(item.id);
        if (!APP_FEATURE_BY_ID.has(featureId)) return true;
        return isFeatureVisibleInPlacement(config, featureId, 'hamburger');
      }),
    }))
    .filter((s) => s.items.length > 0);
}
