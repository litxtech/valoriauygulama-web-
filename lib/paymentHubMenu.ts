import type { Ionicons } from '@expo/vector-icons';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';
import {
  canAccessAdminPayments,
  hasStaffAppPermission,
  type StaffPermissionSlice,
} from '@/lib/staffPermissions';
import type { StaffHamburgerMenuItem } from '@/lib/staffHamburgerMenu';
import type { AdminPaymentLane } from '@/lib/adminPaymentLanes';

export type PaymentHubVariant = 'staff' | 'admin';

export function resolvePaymentHubVariant(staff: StaffPermissionSlice | null | undefined): PaymentHubVariant | null {
  if (!staff) return null;
  if (canAccessAdminPayments(staff)) return 'admin';
  if (hasStaffAppPermission(staff, 'odeme_al_qr')) return 'staff';
  return null;
}

export function canAccessPaymentHub(staff: StaffPermissionSlice | null | undefined): boolean {
  return resolvePaymentHubVariant(staff) !== null;
}

export function paymentHubBasePath(variant: PaymentHubVariant): '/admin/payments' | '/staff/payments' {
  return variant === 'admin' ? '/admin/payments' : '/staff/payments';
}

type HubItemDef = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  path: string;
  adminOnly?: boolean;
  staffOnly?: boolean;
  adminRoute?: string;
};

function itemsForVariant(variant: PaymentHubVariant, staff: StaffPermissionSlice): HubItemDef[] {
  const base = paymentHubBasePath(variant);
  const defs: HubItemDef[] = [
    { id: 'payments_hub', label: 'Tahsilat Merkezi', icon: 'grid-outline', accent: '#635bff', path: base },
    {
      id: 'payments_qr_standing',
      label: 'Sabit QR oluştur',
      icon: 'infinite-outline',
      accent: '#ea580c',
      path: `${base}/new?mode=standing&kind=food`,
    },
    {
      id: 'payments_qr_single',
      label: 'Tek seferlik QR',
      icon: 'flash-outline',
      accent: '#635bff',
      path: `${base}/new?mode=single`,
    },
    {
      id: 'payments_qr_stands',
      label: 'Sabit QR noktaları',
      icon: 'qr-code-outline',
      accent: '#16a34a',
      path: `${base}/stands`,
    },
    {
      id: 'payments_history',
      label: 'Ödeme geçmişi',
      icon: 'time-outline',
      accent: '#64748b',
      path: `${base}/history`,
    },
  ];

  if (variant === 'admin') {
    defs.push(
      {
        id: 'payments_tips_lane',
        label: 'Bahşiş tahsilatları',
        icon: 'gift-outline',
        accent: '#b8860b',
        path: '/admin/payments?lane=tips',
        adminOnly: true,
      },
      {
        id: 'payments_tips_confirm',
        label: 'Bahşiş onay & iade',
        icon: 'checkmark-done-outline',
        accent: '#ca8a04',
        path: '/admin/tips',
        adminOnly: true,
      },
      {
        id: 'payments_kitchen_lane',
        label: 'Mutfak & restoran',
        icon: 'restaurant-outline',
        accent: '#ea580c',
        path: '/admin/payments?lane=kitchen',
        adminOnly: true,
      },
      {
        id: 'payments_hotel_lane',
        label: 'Otel hizmetleri',
        icon: 'business-outline',
        accent: '#4338ca',
        path: '/admin/payments?lane=hotel',
        adminOnly: true,
      },
      {
        id: 'payments_room_service',
        label: 'Oda servisi siparişleri',
        icon: 'bed-outline',
        accent: '#2563eb',
        path: '/admin/room-service',
        adminOnly: true,
        adminRoute: '/admin/room-service',
      },
      {
        id: 'payments_guest_extras',
        label: 'Ekstra ücret siparişleri',
        icon: 'pricetags-outline',
        accent: '#7c3aed',
        path: '/admin/guest-extras?tab=orders',
        adminOnly: true,
        adminRoute: '/admin/guest-extras',
      },
      {
        id: 'payments_accounting',
        label: 'Muhasebe defteri',
        icon: 'calculator-outline',
        accent: '#0f766e',
        path: '/admin/accounting/movements',
        adminOnly: true,
        adminRoute: '/admin/accounting',
      },
      {
        id: 'payments_accounting_hub',
        label: 'Muhasebe merkezi',
        icon: 'stats-chart-outline',
        accent: '#0369a1',
        path: '/admin/accounting',
        adminOnly: true,
        adminRoute: '/admin/accounting',
      }
    );
  }

  return defs.filter((d) => {
    if (d.adminOnly && variant !== 'admin') return false;
    if (d.staffOnly && variant !== 'staff') return false;
    if (d.adminRoute && !canAccessAdminRoute(staff, d.adminRoute)) return false;
    return true;
  });
}

export function buildPaymentHubHamburgerItems(staff: StaffPermissionSlice): StaffHamburgerMenuItem[] {
  const variant = resolvePaymentHubVariant(staff);
  if (!variant) return [];
  return itemsForVariant(variant, staff).map((d) => ({
    id: d.id,
    label: d.label,
    href: d.path,
    icon: d.icon,
    accent: d.accent,
  }));
}

export type PaymentHubNavLink = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub: string;
  accent: string;
  lane?: AdminPaymentLane;
};

export type PaymentHubNavSection = {
  title: string;
  subtitle: string;
  links: PaymentHubNavLink[];
};

/** Admin Tahsilat Merkezi ekranı — hamburger ile aynı link seti */
export function buildAdminPaymentHubNavSections(): PaymentHubNavSection[] {
  return [
    {
      title: 'QR ile tahsilat',
      subtitle: 'Restoran, bar ve resepsiyon için Stripe QR',
      links: [
        {
          href: '/admin/payments/new?mode=standing&kind=food',
          icon: 'infinite-outline',
          label: 'Sabit QR oluştur',
          sub: 'Restoran / bar — aynı tutar tekrar tekrar',
          accent: '#ea580c',
        },
        {
          href: '/admin/payments/new?mode=single',
          icon: 'flash-outline',
          label: 'Tek seferlik QR',
          sub: 'Belirli tutar için bir kerelik link',
          accent: '#635bff',
        },
        {
          href: '/admin/payments/stands',
          icon: 'qr-code-outline',
          label: 'Sabit QR noktaları',
          sub: 'Masa, bar, resepsiyon QR listesi ve düzenleme',
          accent: '#16a34a',
        },
        {
          href: '/admin/payments/history',
          icon: 'time-outline',
          label: 'Ödeme geçmişi',
          sub: 'Kapatılan, iptal ve süresi dolan kayıtlar',
          accent: '#64748b',
        },
      ],
    },
    {
      title: 'Canlı tahsilatlar',
      subtitle: 'Bahşiş, mutfak ve otel Stripe ödemeleri',
      links: [
        {
          href: '/admin/payments?lane=tips',
          icon: 'gift-outline',
          label: 'Bahşiş tahsilatları',
          sub: 'Stripe bahşiş listesi',
          accent: '#b8860b',
          lane: 'tips',
        },
        {
          href: '/admin/tips',
          icon: 'checkmark-done-outline',
          label: 'Bahşiş onay & iade',
          sub: 'Nakit, oda faturası ve manuel onaylar',
          accent: '#ca8a04',
        },
        {
          href: '/admin/payments?lane=kitchen',
          icon: 'restaurant-outline',
          label: 'Mutfak & restoran',
          sub: 'Yemek QR ödemeleri',
          accent: '#ea580c',
          lane: 'kitchen',
        },
        {
          href: '/admin/payments?lane=hotel',
          icon: 'business-outline',
          label: 'Otel hizmetleri',
          sub: 'Oda servisi, transfer, genel',
          accent: '#4338ca',
          lane: 'hotel',
        },
      ],
    },
    {
      title: 'Sepet & sipariş ödemeleri',
      subtitle: 'Misafir sepetinden gelen tahsilatlar',
      links: [
        {
          href: '/admin/room-service',
          icon: 'bed-outline',
          label: 'Oda servisi siparişleri',
          sub: 'Sepet, menü ve sipariş durumu',
          accent: '#2563eb',
        },
        {
          href: '/admin/guest-extras?tab=orders',
          icon: 'pricetags-outline',
          label: 'Ekstra ücret siparişleri',
          sub: 'Battaniye, su, minibar vb.',
          accent: '#7c3aed',
        },
      ],
    },
    {
      title: 'Muhasebe bağlantısı',
      subtitle: 'Tahsilat sonrası gelir kaydı',
      links: [
        {
          href: '/admin/accounting/movements',
          icon: 'calculator-outline',
          label: 'Gelir / gider defteri',
          sub: 'Stripe ödemeleri otomatik gelir satırı',
          accent: '#0f766e',
        },
        {
          href: '/admin/accounting',
          icon: 'stats-chart-outline',
          label: 'Muhasebe merkezi',
          sub: 'Özet, borç/alacak, hızlı kayıt',
          accent: '#0369a1',
        },
      ],
    },
    {
      title: 'Katalog & menü ayarları',
      subtitle: 'Ödeme almadan önce ürün/menü düzenleme',
      links: [
        {
          href: '/admin/room-service',
          icon: 'restaurant-outline',
          label: 'Oda servisi menüsü',
          sub: 'Kategori, ürün, fiyat',
          accent: '#1d4ed8',
        },
        {
          href: '/admin/guest-extras',
          icon: 'cube-outline',
          label: 'Ekstra ücret kataloğu',
          sub: 'Ürün ve fiyat tanımları',
          accent: '#6d28d9',
        },
        {
          href: '/admin/dining-venues',
          icon: 'map-outline',
          label: 'Yemek & mekanlar',
          sub: 'Restoran / mekan bilgileri',
          accent: '#c2410c',
        },
      ],
    },
  ];
}
