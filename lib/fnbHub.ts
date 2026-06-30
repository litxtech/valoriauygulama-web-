import type { StaffPermissionSlice } from '@/lib/staffPermissions';
import {
  canAccessKitchenOps,
  canAccessKitchenReceptionAccounting,
  canAccessKitchenFinance,
  canAccessReservationSales,
  canManageHotelKitchenMenu,
  canManageKitchenOps,
  hasStaffAppPermission,
} from '@/lib/staffPermissions';

export type FnbHubQuickAction = {
  id: string;
  label: string;
  desc: string;
  href: string;
  icon: string;
  color: string;
  visible: boolean;
};

export type FnbHubPrimaryAction = {
  id: 'kitchen_revenue' | 'menu_theme' | 'live_menu';
  label: string;
  subtitle: string;
  icon: string;
  color: string;
  bg: string;
  href?: string;
  externalUrl?: string | null;
  visible: boolean;
};

const FNB_PRIMARY_IDS = new Set<FnbHubPrimaryAction['id']>(['kitchen_revenue', 'menu_theme', 'live_menu']);

/** Mutfak + satış + menü tek merkez — en az bir alt modül yetkisi gerekir. */
export function canAccessFnbHub(staff: StaffPermissionSlice, financeStaffIds?: string[] | null): boolean {
  if (!staff) return false;
  return (
    canAccessKitchenOps(staff) ||
    canManageKitchenOps(staff) ||
    canAccessKitchenFinance(staff, financeStaffIds) ||
    canAccessReservationSales(staff) ||
    canManageHotelKitchenMenu(staff) ||
    canAccessKitchenReceptionAccounting(staff) ||
    hasStaffAppPermission(staff, 'yemek_listesi_olustur')
  );
}

export function buildFnbHubQuickActions(
  staff: StaffPermissionSlice,
  opts?: { financeStaffIds?: string[] | null }
): FnbHubQuickAction[] {
  const financeStaffIds = opts?.financeStaffIds;
  const actions: FnbHubQuickAction[] = [
    {
      id: 'sales_new',
      label: 'Anlık satış gir',
      desc: 'Rezervasyon satışı ve komisyon kaydı',
      href: '/staff/sales/new',
      icon: 'add-circle-outline',
      color: '#10b981',
      visible: canAccessReservationSales(staff),
    },
    {
      id: 'kitchen_revenue',
      label: 'Hasılat gir',
      desc: 'Masa seç · tutar gir · geçmiş günleri incele',
      href: '/staff/kitchen-ops/revenue/new',
      icon: 'cash-outline',
      color: '#059669',
      visible: canAccessKitchenFinance(staff, financeStaffIds),
    },
    {
      id: 'kitchen_finance_bridge',
      label: 'Mutfak ↔ Resepsiyon Finans',
      desc: 'Hasılat, gider, ödeme ve temiz kalan',
      href: '/staff/kitchen-ops/finance-bridge',
      icon: 'git-compare-outline',
      color: '#4f46e5',
      visible: canAccessKitchenFinance(staff, financeStaffIds) || canAccessKitchenReceptionAccounting(staff),
    },
    {
      id: 'menu_qr',
      label: 'Masa QR kodu',
      desc: 'Sabit menü QR — bas, masaya koy, uygulama gerekmez',
      href: '/staff/hotel-menu/manage?qr=1',
      icon: 'qr-code-outline',
      color: '#1a365d',
      visible: canManageHotelKitchenMenu(staff),
    },
    {
      id: 'menu_manage',
      label: 'Menü yönet',
      desc: 'Ürün, fiyat, fotoğraf ve kategori',
      href: '/staff/hotel-menu/manage',
      icon: 'restaurant-outline',
      color: '#ea580c',
      visible: canManageHotelKitchenMenu(staff),
    },
    {
      id: 'menu_theme',
      label: 'Web menü tasarımı',
      desc: 'Renk ve hero — deploy gerekmez',
      href: '/staff/fnb-hub/menu-theme',
      icon: 'color-palette-outline',
      color: '#7c3aed',
      visible: canManageHotelKitchenMenu(staff),
    },
    {
      id: 'kitchen_ops',
      label: 'Mutfak paneli',
      desc: 'Stok, hasılat, gün sonu',
      href: '/staff/kitchen-ops',
      icon: 'layers-outline',
      color: '#2563eb',
      visible: canAccessKitchenOps(staff),
    },
    {
      id: 'kitchen_admin',
      label: 'Mutfak yönetimi',
      desc: 'Rapor, limit, reception kontrol',
      href: '/admin/kitchen-ops',
      icon: 'settings-outline',
      color: '#b45309',
      visible: canManageKitchenOps(staff) || staff?.role === 'admin',
    },
    {
      id: 'sales_list',
      label: 'Satış listesi',
      desc: 'Tüm satışlar ve komisyon durumu',
      href: staff?.role === 'admin' ? '/admin/sales' : '/staff/sales',
      icon: 'list-outline',
      color: '#0d9488',
      visible: canAccessReservationSales(staff),
    },
    {
      id: 'kitchen_reception',
      label: 'Reception mutfak muhasebe',
      desc: 'POS onay ve gün sonu kontrol',
      href:
        staff?.role === 'admin' || hasStaffAppPermission(staff, 'mutfak_operasyon_yonetim')
          ? '/admin/kitchen-ops/reception'
          : '/staff/kitchen-ops/reception',
      icon: 'checkmark-done-outline',
      color: '#6366f1',
      visible: canAccessKitchenReceptionAccounting(staff),
    },
    {
      id: 'meal_menu',
      label: 'Personel yemek listesi',
      desc: 'Aylık personel menüsü düzenle',
      href: staff?.role === 'admin' ? '/admin/meal-menu' : '/staff/meal-menu-edit',
      icon: 'fast-food-outline',
      color: '#c2410c',
      visible: hasStaffAppPermission(staff, 'yemek_listesi_olustur'),
    },
    {
      id: 'dining_venues',
      label: 'Yemek & mekanlar',
      desc: 'Restoran, bar ve servis noktaları',
      href: '/admin/dining-venues',
      icon: 'storefront-outline',
      color: '#db2777',
      visible: staff?.role === 'admin' || hasStaffAppPermission(staff, 'dining_venues'),
    },
  ];
  return actions.filter((a) => a.visible);
}

export function buildFnbHubPrimaryActions(
  staff: StaffPermissionSlice,
  opts?: { variant?: 'staff' | 'admin'; publicMenuUrl?: string | null; financeStaffIds?: string[] | null }
): FnbHubPrimaryAction[] {
  const variant = opts?.variant ?? 'staff';
  const financeStaffIds = opts?.financeStaffIds;
  const themeHref = variant === 'admin' ? '/admin/fnb-hub/menu-theme' : '/staff/fnb-hub/menu-theme';
  const publicMenuUrl = opts?.publicMenuUrl ?? null;

  const actions: FnbHubPrimaryAction[] = [
    {
      id: 'kitchen_revenue',
      label: 'Hasılat gir',
      subtitle: '14 masa · tutar gir',
      href: '/staff/kitchen-ops/revenue/new',
      icon: 'cash',
      color: '#059669',
      bg: '#ecfdf5',
      visible: canAccessKitchenFinance(staff, financeStaffIds),
    },
    {
      id: 'menu_theme',
      label: 'Yeni tasarım yap',
      subtitle: 'Renk ve hero — anında canlı',
      href: themeHref,
      icon: 'color-palette',
      color: '#7c3aed',
      bg: '#f5f3ff',
      visible: canManageHotelKitchenMenu(staff),
    },
    {
      id: 'live_menu',
      label: 'Canlı',
      subtitle: 'Web menüyü aç',
      externalUrl: publicMenuUrl,
      icon: 'globe',
      color: '#2563eb',
      bg: '#eff6ff',
      visible: canManageHotelKitchenMenu(staff) && !!publicMenuUrl,
    },
  ];

  return actions.filter((a) => a.visible);
}

export function buildFnbHubSecondaryActions(
  staff: StaffPermissionSlice,
  opts?: { variant?: 'staff' | 'admin'; publicMenuUrl?: string | null; financeStaffIds?: string[] | null }
): FnbHubQuickAction[] {
  return buildFnbHubQuickActions(staff, opts).filter((a) => !FNB_PRIMARY_IDS.has(a.id as FnbHubPrimaryAction['id']));
}
