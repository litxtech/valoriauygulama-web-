import { Ionicons } from '@expo/vector-icons';
import { canSeeBreakfastModule } from '@/lib/breakfastConfirm';
import {
  breakfastBriefingViewPath,
  canManageBreakfastBriefing,
  canViewBreakfastBriefing,
} from '@/lib/breakfastMorningBriefing';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canStaffUseIdCapture, canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  canAccessDocumentManagement,
  canAccessIncidentReports,
  canAccessFacilityJournal,
  canAccessLostFound,
  canAccessReservationSales,
  canStaffCreateAssignments,
  canManageStaffMealMenu,
  canManageHotelKitchenMenu,
  canAccessKitchenOps,
  canAccessKitchenReceptionAccounting,
  isKitchenStaffMember,
  hasTechnicalAssetsStaffAccess,
  isGorevAtaOnlyUser,
  canAccessOccupancyOps,
  canAccessGuestComplaints,
  canViewManagedContracts,
  canManageManagedContracts,
  canViewDepartmentRules,
  canManageDepartmentRules,
  canCreateDepartmentRules,
  canAccessAdminPayments,
  hasStaffAppPermission,
  canAccessAdminShell,
  type StaffPermissionSlice,
} from '@/lib/staffPermissions';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';
import { canAccessFnbHub } from '@/lib/fnbHub';
import { staffMenuLabel } from '@/lib/staffMenuI18n';
import { filterStaffMenuSectionsByHidden, filterStaffMenuSectionsByOrgFeatures } from '@/lib/staffMenuVisibility';
import type { OrganizationUiFeaturesConfig } from '@/lib/organizationUiFeatures';

export type StaffHamburgerStaff = StaffPermissionSlice & {
  kbs_access_enabled?: boolean;
  department?: string | null;
  hidden_menu_item_ids?: string[] | null;
};

export type StaffHamburgerMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

export type StaffHamburgerMenuSectionId = 'fnb' | 'kitchen' | 'nav' | 'staff' | 'hotel' | 'ops' | 'admin';

export type StaffHamburgerMenuSection = {
  id: StaffHamburgerMenuSectionId;
  title: string;
  items: StaffHamburgerMenuItem[];
};

const ACCENTS: Record<string, string> = {
  home: '#2563eb',
  map: '#0d9488',
  tasks: '#2563eb',
  attendance: '#0369a1',
  missing: '#dc2626',
  lost_found: '#0d9488',
  meal: '#ea580c',
  meal_edit: '#c2410c',
  meal_hist: '#64748b',
  emergency: '#dc2626',
  board: '#2563eb',
  messages: '#2563eb',
  cleaning: '#0f766e',
  guests: '#0ea5e9',
  transfer: '#0f766e',
  dining: '#b45309',
  stock: '#16a34a',
  kitchen_ops: '#ea580c',
  profile: '#6366f1',
  kbs: '#0f766e',
  tech: '#b8860b',
  admin: '#7c3aed',
  perf: '#4f46e5',
  assign: '#db2777',
  accounting: '#7c3aed',
  expenses: '#d97706',
  docs: '#4f46e5',
  incident: '#7c3aed',
  sales: '#10b981',
  breakfast: '#ea580c',
  complaint: '#b45309',
  guest_complaints: '#ef4444',
  assets: '#7c3aed',
  my_stock: '#0d9488',
  facility_journal: '#0f766e',
  debts: '#0369a1',
  mrz: '#ca8a04',
  contracts: '#6366f1',
  department_rules: '#134e4a',
  area_guide: '#14b8a6',
  salary_all: '#16a34a',
  salary_history: '#059669',
  warnings: '#dc2626',
  finance: '#0369a1',
  audits: '#7c3aed',
  staff_month_best: '#d97706',
};

function normHref(href: string): string {
  return href.replace(/\/+$/, '') || '/';
}

type MenuBuilder = {
  push: (section: StaffHamburgerMenuSectionId, item: Omit<StaffHamburgerMenuItem, 'id'> & { id: string }) => void;
};

function createBuilder(): { push: MenuBuilder['push']; sections: Record<StaffHamburgerMenuSectionId, StaffHamburgerMenuItem[]> } {
  const seen = new Set<string>();
  const sections: Record<StaffHamburgerMenuSectionId, StaffHamburgerMenuItem[]> = {
    fnb: [],
    kitchen: [],
    nav: [],
    staff: [],
    hotel: [],
    ops: [],
    admin: [],
  };
  const push: MenuBuilder['push'] = (section, item) => {
    const key = normHref(item.href);
    if (seen.has(key)) return;
    seen.add(key);
    sections[section].push(item);
  };
  return { push, sections };
}

function pushBreakfastBriefingMenuItem(
  push: MenuBuilder['push'],
  staff: StaffHamburgerStaff,
  isAdmin: boolean
) {
  if (!canViewBreakfastBriefing(staff)) return;

  const canManage = canManageBreakfastBriefing(staff);
  let section: StaffHamburgerMenuSectionId;
  let href: string;

  if (canManage && isAdmin) {
    section = 'admin';
    href = breakfastBriefingViewPath('admin');
  } else if (canManage) {
    section = 'hotel';
    href = breakfastBriefingViewPath('staff');
  } else if (isKitchenStaffMember(staff)) {
    section = 'kitchen';
    href = breakfastBriefingViewPath('view');
  } else {
    section = 'hotel';
    href = breakfastBriefingViewPath('view');
  }

  push(section, {
    id: 'breakfast_briefing',
    label: 'Sabah kahvaltı sayısı',
    href,
    icon: 'cafe-outline',
    accent: '#b45309',
  });
}

/**
 * Personel hamburger menüsü — gezinti, yetkiye bağlı modüller ve yönetim.
 * Profil “Hızlı erişim” kartlarıyla çakışmaması için tek kaynak.
 */
export function buildStaffHamburgerMenuSections(
  t: (key: string) => string,
  staff: StaffHamburgerStaff | null | undefined,
  orgUiFeatures?: OrganizationUiFeaturesConfig | null
): StaffHamburgerMenuSection[] {
  const { push, sections } = createBuilder();
  if (!staff) return [];

  const isAdmin = staff.role === 'admin';
  const isFullAdmin = isAdmin && !isGorevAtaOnlyUser(staff);
  const perms = staff.app_permissions ?? {};
  const isKitchenStaff = isKitchenStaffMember(staff) && canAccessKitchenOps(staff);

  // —— F&B Merkezi (mutfak + satış + menü — yetkiye göre kısayollar) ——
  if (canAccessFnbHub(staff)) {
    push('fnb', {
      id: 'fnb_hub',
      label: t('fnbHubTitle'),
      href: '/staff/fnb-hub',
      icon: 'grid-outline',
      accent: '#ea580c',
    });
    if (canAccessReservationSales(staff)) {
      push('fnb', {
        id: 'fnb_sales_new',
        label: t('fnbHubSalesNew'),
        href: '/staff/sales/new',
        icon: 'add-circle-outline',
        accent: ACCENTS.sales,
      });
    }
    if (canAccessKitchenOps(staff)) {
      push('fnb', {
        id: 'fnb_kitchen_revenue',
        label: t('fnbHubKitchenRevenue'),
        href: '/staff/kitchen-ops/revenue/new',
        icon: 'cash-outline',
        accent: '#059669',
      });
    }
    if (canManageHotelKitchenMenu(staff)) {
      push('fnb', {
        id: 'fnb_menu_manage',
        label: t('hotelKitchenMenuManageCta'),
        href: '/staff/hotel-menu/manage',
        icon: 'restaurant-outline',
        accent: ACCENTS.meal_edit,
      });
      push('fnb', {
        id: 'fnb_menu_theme',
        label: t('hotelKitchenMenuThemeTitle'),
        href: '/staff/fnb-hub/menu-theme',
        icon: 'color-palette-outline',
        accent: '#7c3aed',
      });
    }
    if (canAccessKitchenReceptionAccounting(staff)) {
      push('fnb', {
        id: 'fnb_reception',
        label: t('staffKitchenAccountingControl'),
        href: '/staff/kitchen-ops/reception',
        icon: 'checkmark-done-outline',
        accent: '#6366f1',
      });
    }
  }

  // —— Mutfak (mutfakçılar için en üstte — hızlı erişim) ——
  if (isKitchenStaff) {
    push('kitchen', {
      id: 'kitchen_ops',
      label: t('staffKitchenOpsTitle'),
      href: '/staff/kitchen-ops',
      icon: 'restaurant-outline',
      accent: ACCENTS.kitchen_ops,
    });
    push('kitchen', {
      id: 'kitchen_quick_entry',
      label: t('staffKitchenStockAdd'),
      href: '/staff/kitchen-ops/stock/entry',
      icon: 'add-circle-outline',
      accent: '#059669',
    });
    push('kitchen', {
      id: 'kitchen_quick_exit',
      label: t('staffKitchenStockExit'),
      href: '/staff/kitchen-ops/stock/exit',
      icon: 'remove-circle-outline',
      accent: '#d97706',
    });
    push('kitchen', {
      id: 'kitchen_quick_scan',
      label: t('staffKitchenBarcodeScan'),
      href: '/staff/kitchen-ops/stock/scan',
      icon: 'scan-outline',
      accent: '#7c3aed',
    });
    push('kitchen', {
      id: 'kitchen_quick_current',
      label: t('staffKitchenCurrentStock'),
      href: '/staff/kitchen-ops/stock/current',
      icon: 'layers-outline',
      accent: '#2563eb',
    });
    push('kitchen', {
      id: 'kitchen_quick_low',
      label: t('staffKitchenLowStock'),
      href: '/staff/kitchen-ops/stock/low',
      icon: 'alert-circle-outline',
      accent: '#dc2626',
    });
    push('kitchen', {
      id: 'kitchen_quick_revenue',
      label: t('staffKitchenRevenueEnter'),
      href: '/staff/kitchen-ops/revenue/new',
      icon: 'cash-outline',
      accent: '#10b981',
    });
    push('kitchen', {
      id: 'kitchen_quick_day_close',
      label: t('staffKitchenDayClose'),
      href: '/staff/kitchen-ops/day-close',
      icon: 'moon-outline',
      accent: '#4f46e5',
    });
    if (canSeeBreakfastModule(staff)) {
      push('kitchen', {
        id: 'breakfast_staff',
        label: t('profileUiBreakfastUpload'),
        href: '/staff/breakfast-confirm',
        icon: 'cafe-outline',
        accent: ACCENTS.breakfast,
      });
    }
    if (canManageStaffMealMenu(staff)) {
      push('kitchen', {
        id: 'meal_edit',
        label: t('profileUiMealMenuManage'),
        href: '/staff/meal-menu-edit',
        icon: 'create-outline',
        accent: ACCENTS.meal_edit,
      });
    }
  }

  // —— Gezinti (ana sayfalar) ——
  push('nav', {
    id: 'emergency',
    label: t('screenEmergencyButton'),
    href: isAdmin ? '/admin/staff-emergency' : '/staff/emergency',
    icon: 'warning-outline',
    accent: ACCENTS.emergency,
  });
  push('nav', { id: 'home', label: t('staffHome'), href: '/staff', icon: 'home-outline', accent: ACCENTS.home });
  push('nav', { id: 'map', label: t('mapTab'), href: '/staff/map', icon: 'map-outline', accent: ACCENTS.map });
  push('nav', { id: 'board', label: t('staffBoardTitle'), href: '/staff/board', icon: 'eye-outline', accent: ACCENTS.board });

  // —— Personel İşleri (personeli doğrudan ilgilendiren) ——
  if (hasStaffAppPermission(staff, 'gorevler_goruntule')) {
    push('staff', { id: 'tasks', label: t('tasks'), href: '/staff/tasks', icon: 'checkbox-outline', accent: ACCENTS.tasks });
  }
  if (hasStaffAppPermission(staff, 'mesai_takibi')) {
    push('staff', {
      id: 'attendance',
      label: t('staffAttendanceNavTitle'),
      href: '/staff/attendance',
      icon: 'time-outline',
      accent: ACCENTS.attendance,
    });
  }
  if (hasStaffAppPermission(staff, 'performans_paneli')) {
    push('staff', {
      id: 'perf',
      label: t('perfDashboardTitle'),
      href: '/staff/performance',
      icon: 'stats-chart-outline',
      accent: ACCENTS.perf,
    });
  }
  push('staff', {
    id: 'meal',
    label: t('staffMealMenuTitle'),
    href: '/staff/meal-menu',
    icon: 'fast-food-outline',
    accent: ACCENTS.meal,
  });
  if (canManageStaffMealMenu(staff)) {
    push('staff', {
      id: 'meal_edit',
      label: t('profileUiMealMenuManage'),
      href: '/staff/meal-menu-edit',
      icon: 'create-outline',
      accent: ACCENTS.meal_edit,
    });
  }
  push('staff', {
    id: 'meal_hist',
    label: t('staffMealHistoryTitle'),
    href: '/staff/meal-menu-history',
    icon: 'time-outline',
    accent: ACCENTS.meal_hist,
  });
  if (canSeeBreakfastModule(staff)) {
    push('staff', {
      id: 'breakfast_staff',
      label: t('profileUiBreakfastUpload'),
      href: '/staff/breakfast-confirm',
      icon: 'cafe-outline',
      accent: ACCENTS.breakfast,
    });
  }
  push('staff', {
    id: 'salary_history',
    label: t('salaryHistory'),
    href: '/staff/salary-history',
    icon: 'wallet-outline',
    accent: ACCENTS.salary_history,
  });
  if (hasStaffAppPermission(staff, 'yarin_oda_temizlik_listesi')) {
    push('staff', {
      id: 'cleaning',
      label: t('staffCleaningNavTitle'),
      href: '/staff/cleaning-plan',
      icon: 'checkbox-outline',
      accent: ACCENTS.cleaning,
    });
  }
  push('staff', {
    id: 'official_warnings',
    label: t('staffOfficialWarningsNavTitle'),
    href: '/staff/warnings',
    icon: 'warning-outline',
    accent: ACCENTS.warnings,
  });
  if (hasStaffAppPermission(staff, 'harcama_girisi')) {
    push('staff', {
      id: 'expenses_new',
      label: t('staffExpenseNewTitle'),
      href: '/staff/expenses/new',
      icon: 'add-circle-outline',
      accent: ACCENTS.expenses,
    });
  }
  if (hasStaffAppPermission(staff, 'harcama_yonetimi')) {
    push('staff', {
      id: 'expenses_all',
      label: t('profileUiAllExpenses'),
      href: '/admin/expenses/all',
      icon: 'list-outline',
      accent: ACCENTS.expenses,
    });
  } else if (hasStaffAppPermission(staff, 'harcama_girisi')) {
    push('staff', {
      id: 'expenses_mine',
      label: t('profileUiMyExpenses'),
      href: '/staff/expenses',
      icon: 'list-outline',
      accent: ACCENTS.expenses,
    });
  }
  if (hasStaffAppPermission(staff, 'ic_sikayet')) {
    push('staff', {
      id: 'complaint',
      label: t('profileUiStaffComplaint'),
      href: '/staff/internal-complaints/new',
      icon: 'alert-circle-outline',
      accent: ACCENTS.complaint,
    });
  }
  if (canStaffCreateAssignments(staff)) {
    push('staff', {
      id: 'assign',
      label: t('profileUiNewTaskAssign'),
      href: '/admin/tasks/assign',
      icon: 'add-circle-outline',
      accent: ACCENTS.assign,
    });
  }
  if (canStaffCreateAssignments(staff) && canAccessKitchenOps(staff) && !isAdmin) {
    push('staff', {
      id: 'kitchen_ops_gorev',
      label: t('staffKitchenOpsTitle'),
      href: '/staff/kitchen-ops',
      icon: 'restaurant-outline',
      accent: ACCENTS.kitchen_ops,
    });
  }
  if (canManageManagedContracts(staff)) {
    push('staff', {
      id: 'managed_contracts_prepare',
      label: 'Sözleşme hazırla',
      href: '/admin/managed-contracts/new',
      icon: 'create-outline',
      accent: ACCENTS.contracts,
    });
    push('staff', {
      id: 'managed_contracts_hub',
      label: 'Sözleşme yönetimi',
      href: '/admin/managed-contracts',
      icon: 'briefcase-outline',
      accent: ACCENTS.contracts,
    });
  } else if (canViewManagedContracts(staff)) {
    push('staff', {
      id: 'managed_contracts_staff',
      label: 'Sözleşmelerim',
      href: '/staff/managed-contracts',
      icon: 'briefcase-outline',
      accent: ACCENTS.contracts,
    });
  }
  if (canCreateDepartmentRules(staff)) {
    push('ops', {
      id: 'department_rules_new',
      label: 'Kural oluştur',
      href: '/admin/department-rules/new',
      icon: 'add-circle-outline',
      accent: ACCENTS.department_rules,
    });
    push('ops', {
      id: 'department_rules_hub',
      label: canManageDepartmentRules(staff) ? 'Bölüm kuralları yönetimi' : 'Bölüm kurallarım',
      href: '/admin/department-rules',
      icon: 'book-outline',
      accent: ACCENTS.department_rules,
    });
  } else if (canViewDepartmentRules(staff)) {
    push('ops', {
      id: 'department_rules_staff',
      label: 'Bölüm kuralları',
      href: '/staff/department-rules',
      icon: 'book-outline',
      accent: ACCENTS.department_rules,
    });
  }
  if (perms.tum_sozlesmeler && !isAdmin) {
    push('staff', {
      id: 'contracts_staff',
      label: 'Misafir sözleşme onayları',
      href: '/staff/contracts/all',
      icon: 'document-text-outline',
      accent: ACCENTS.contracts,
    });
  }
  if (canStaffUseMrzScan(staff)) {
    push('staff', {
      id: 'passports',
      label: t('staffPassportsTitle'),
      href: '/staff/profile/passports',
      icon: 'id-card-outline',
      accent: ACCENTS.mrz,
    });
  }
  if (canStaffUseIdCapture(staff)) {
    push('hotel', {
      id: 'id_capture',
      label: t('staffKitchenIdCapture'),
      href: '/staff/kbs/capture-id',
      icon: 'camera-outline',
      accent: ACCENTS.kbs,
    });
    push('hotel', {
      id: 'id_capture_history',
      label: t('staffKitchenIdCapturedList'),
      href: '/staff/kbs/capture-history',
      icon: 'albums-outline',
      accent: ACCENTS.kbs,
    });
  }

  // —— Otel & Misafir (otel hizmetleri / misafir odaklı) ——
  push('hotel', {
    id: 'hotel_kitchen_menu',
    label: t('screenHotelKitchenMenu'),
    href: '/staff/hotel-menu',
    icon: 'restaurant-outline',
    accent: ACCENTS.meal,
  });
  if (canManageHotelKitchenMenu(staff)) {
    push('hotel', {
      id: 'hotel_kitchen_menu_manage',
      label: t('hotelKitchenMenuManageCta'),
      href: '/staff/hotel-menu/manage',
      icon: 'create-outline',
      accent: ACCENTS.meal_edit,
    });
  }
  if (hasStaffAppPermission(staff, 'misafir_yonetimi') || canAccessOccupancyOps(staff)) {
    push('hotel', { id: 'guests', label: t('adminGuests'), href: '/staff/guests', icon: 'people-outline', accent: ACCENTS.guests });
  }
  if (canAccessGuestComplaints(staff)) {
    push('hotel', {
      id: 'guest_complaints',
      label: t('staffGuestComplaints'),
      href: isAdmin ? '/admin/complaints' : '/staff/guest-complaints',
      icon: 'chatbox-ellipses-outline',
      accent: ACCENTS.guest_complaints,
    });
  }
  if (hasStaffAppPermission(staff, 'misafir_talepleri')) {
    push('hotel', {
      id: 'guest_service_requests',
      label: 'Misafir talepleri',
      href: '/staff/guest-service-requests',
      icon: 'hand-left-outline',
      accent: '#0ea5e9',
    });
  }
  if (hasStaffAppPermission(staff, 'odeme_al_qr')) {
    push('hotel', {
      id: 'payments',
      label: 'Ödeme al (QR)',
      href: '/staff/payments',
      icon: 'qr-code-outline',
      accent: '#635bff',
    });
  }
  if (canAccessAdminPayments(staff)) {
    push('hotel', {
      id: 'payments_admin',
      label: 'Yapılan ödemeler',
      href: '/admin/payments',
      icon: 'card-outline',
      accent: '#635bff',
    });
  }
  if (canAccessOccupancyOps(staff)) {
    push('hotel', {
      id: 'occupancy_ops',
      label: 'Konaklama operasyon',
      href: '/staff/occupancy/operations',
      icon: 'stats-chart-outline',
      accent: ACCENTS.guests,
    });
  }
  if (!isAdmin) {
    push('hotel', {
      id: 'transfer',
      label: t('transferTourNavTitle'),
      href: '/staff/transfer-tour',
      icon: 'car-outline',
      accent: ACCENTS.transfer,
    });
    push('hotel', {
      id: 'dining',
      label: t('diningVenuesNavTitle'),
      href: '/staff/dining-venues',
      icon: 'restaurant-outline',
      accent: ACCENTS.dining,
    });
  }
  push('hotel', {
    id: 'area_guide_staff',
    label: t('localAreaGuideScreenTitle'),
    href: '/staff/local-area-guide',
    icon: 'trail-sign-outline',
    accent: ACCENTS.area_guide,
  });

  // —— Operasyon (iş araçları / modüller) ——
  if (hasStaffAppPermission(staff, 'eksik_esya')) {
    push('ops', {
      id: 'missing',
      label: t('screenMissingItems'),
      href: '/staff/missing-items',
      icon: 'alert-circle-outline',
      accent: ACCENTS.missing,
    });
  }
  if (canAccessFacilityJournal(staff)) {
    const fjBase = isAdmin ? '/admin/facility-journal' : '/staff/facility-journal';
    push('ops', {
      id: 'facility_journal_new',
      label: t('staffMenu_facility_journal_new'),
      href: `${fjBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.facility_journal,
    });
    push('ops', {
      id: 'facility_journal',
      label: t('staffFacilityJournal'),
      href: fjBase,
      icon: 'clipboard-outline',
      accent: ACCENTS.facility_journal,
    });
  }
  if (canAccessLostFound(staff)) {
    const lfBase = isAdmin ? '/admin/lost-found' : '/staff/lost-found';
    push('ops', {
      id: 'lost_found_new',
      label: staffMenuLabel(t, 'lost_found_new'),
      href: `${lfBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.lost_found,
    });
    push('ops', {
      id: 'lost_found',
      label: staffMenuLabel(t, 'lost_found'),
      href: lfBase,
      icon: 'briefcase-outline',
      accent: ACCENTS.lost_found,
    });
  }
  if (hasStaffAppPermission(staff, 'stok_giris')) {
    push('ops', { id: 'stock', label: t('stockTab'), href: '/staff/stock', icon: 'cube-outline', accent: ACCENTS.stock });
    push('ops', {
      id: 'my_stock',
      label: t('myStocks'),
      href: '/staff/stock/my-movements',
      icon: 'list',
      accent: ACCENTS.my_stock,
    });
  }
  if (canAccessKitchenOps(staff)) {
    push('ops', {
      id: 'kitchen_ops',
      label: t('staffKitchenOpsTitle'),
      href: '/staff/kitchen-ops',
      icon: 'restaurant-outline',
      accent: ACCENTS.kitchen_ops,
    });
  }
  if (canAccessKitchenReceptionAccounting(staff)) {
    push('ops', {
      id: 'kitchen_reception',
      label: t('staffKitchenAccountingControl'),
      href: '/staff/kitchen-ops/reception',
      icon: 'checkmark-done-outline',
      accent: ACCENTS.kitchen_ops,
    });
  }
  if (canAccessDocumentManagement(staff)) {
    push('ops', {
      id: 'docs',
      label: t('profileUiDocumentManagement'),
      href: '/staff/documents',
      icon: 'folder-open-outline',
      accent: ACCENTS.docs,
    });
  }
  if (canAccessIncidentReports(staff)) {
    push('ops', {
      id: 'incident',
      label: t('profileUiIncidentCreate'),
      href: '/staff/incident-reports/new',
      icon: 'document-text-outline',
      accent: ACCENTS.incident,
    });
  }
  if (canAccessReservationSales(staff)) {
    push('ops', {
      id: 'sales',
      label: t('profileUiSalesCommission'),
      href: '/staff/sales',
      icon: 'cash-outline',
      accent: ACCENTS.sales,
    });
  }
  if (hasStaffAppPermission(staff, 'demirbaslar')) {
    push('ops', {
      id: 'demirbas',
      label: t('profileUiFixedAssets'),
      href: '/staff/demirbaslar',
      icon: 'library-outline',
      accent: ACCENTS.assets,
    });
  }
  if (hasStaffAppPermission(staff, 'borc_alacak')) {
    push('ops', {
      id: 'debts',
      label: t('staffDebtReceivable'),
      href: '/staff/debts',
      icon: 'swap-horizontal-outline',
      accent: ACCENTS.debts,
    });
  }
  if (hasStaffAppPermission(staff, 'muhasebe_merkezi')) {
    push('ops', {
      id: 'person_payments_quick',
      label: t('profileUiPersonPaymentsQuick'),
      href: '/admin/accounting/quick-pay',
      icon: 'wallet-outline',
      accent: ACCENTS.accounting,
    });
    push('ops', {
      id: 'accounting',
      label: t('profileUiAccountingHub'),
      href: '/admin/accounting',
      icon: 'calculator-outline',
      accent: ACCENTS.accounting,
    });
  }

  // —— Yönetim ——
  const showAdminHub = canAccessAdminShell(staff) || canAccessAdminPayments(staff) || canManageManagedContracts(staff) || canCreateDepartmentRules(staff);
  if (showAdminHub) {
    push('admin', { id: 'admin_tab', label: t('adminTab'), href: '/staff/admin', icon: 'shield-checkmark-outline', accent: ACCENTS.admin });
    if (canAccessKitchenOps(staff)) {
      push('admin', {
        id: 'kitchen_ops',
        label: t('staffKitchenOpsTitle'),
        href: '/staff/kitchen-ops',
        icon: 'restaurant-outline',
        accent: ACCENTS.kitchen_ops,
      });
      push('admin', {
        id: 'kitchen_ops_manage',
        label: t('staffKitchenOpsManagement'),
        href: '/admin/kitchen-ops',
        icon: 'stats-chart-outline',
        accent: ACCENTS.kitchen_ops,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/audits')) {
      push('admin', {
        id: 'audits',
        label: t('perfAuditBoard'),
        href: '/admin/audits',
        icon: 'clipboard-outline',
        accent: ACCENTS.audits,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/performance')) {
      push('admin', {
        id: 'staff_month_best',
        label: t('perfStaffOfMonth'),
        href: '/admin/performance',
        icon: 'trophy-outline',
        accent: ACCENTS.staff_month_best,
      });
    }
    push('admin', {
      id: 'transfer_a',
      label: t('transferTourNavTitle'),
      href: '/staff/transfer-tour',
      icon: 'car-outline',
      accent: ACCENTS.transfer,
    });
    push('admin', {
      id: 'dining_a',
      label: t('diningVenuesNavTitle'),
      href: '/staff/dining-venues',
      icon: 'restaurant-outline',
      accent: ACCENTS.dining,
    });
    if (canAccessAdminRoute(staff, '/admin/local-area-guide')) {
      push('admin', {
        id: 'area_guide',
        label: t('profileUiAdminAreaGuide'),
        href: '/admin/local-area-guide',
        icon: 'map-outline',
        accent: ACCENTS.area_guide,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/breakfast-confirm')) {
      push('admin', {
        id: 'breakfast_admin',
        label: t('profileUiBreakfastRecords'),
        href: '/admin/breakfast-confirm',
        icon: 'cafe-outline',
        accent: ACCENTS.breakfast,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/salary')) {
      push('admin', {
        id: 'salary_all',
        label: t('profileUiAllPayments'),
        href: '/admin/salary/all',
        icon: 'cash-outline',
        accent: ACCENTS.salary_all,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/contracts/all')) {
      push('admin', {
        id: 'contracts_all',
        label: 'Misafir sözleşme onayları',
        href: '/admin/contracts/all',
        icon: 'document-text-outline',
        accent: ACCENTS.contracts,
      });
    }
    if (canManageManagedContracts(staff)) {
      push('admin', {
        id: 'managed_contracts_prepare_admin',
        label: 'Sözleşme hazırla',
        href: '/admin/managed-contracts/new',
        icon: 'create-outline',
        accent: ACCENTS.contracts,
      });
    }
    push('admin', {
      id: 'managed_contracts_admin',
      label: 'Sözleşme yönetimi',
      href: '/admin/managed-contracts',
      icon: 'briefcase-outline',
      accent: ACCENTS.contracts,
    });
    if (canCreateDepartmentRules(staff)) {
      push('admin', {
        id: 'department_rules_create_admin',
        label: 'Kural oluştur',
        href: '/admin/department-rules/new',
        icon: 'add-circle-outline',
        accent: ACCENTS.department_rules,
      });
    }
    if (canManageDepartmentRules(staff) || canCreateDepartmentRules(staff)) {
      push('admin', {
        id: 'department_rules_admin',
        label: 'Bölüm kuralları',
        href: '/admin/department-rules',
        icon: 'book-outline',
        accent: ACCENTS.department_rules,
      });
    }
    if (canAccessAdminRoute(staff, '/admin/stock/all')) {
      push('admin', {
        id: 'stock_all',
        label: t('profileUiAllStocks'),
        href: '/admin/stock/all',
        icon: 'layers-outline',
        accent: ACCENTS.stock,
      });
    }
    push('admin', {
      id: 'finance_checks',
      label: t('staffCheckTracking'),
      href: '/admin/finance-checks',
      icon: 'document-text-outline',
      accent: ACCENTS.finance,
    });
    push('admin', {
      id: 'debts_admin',
      label: t('staffDebtReceivable'),
      href: '/admin/debts',
      icon: 'swap-horizontal-outline',
      accent: ACCENTS.debts,
    });
    push('admin', {
      id: 'tips_admin',
      label: 'Bahşişler',
      href: '/admin/tips',
      icon: 'gift-outline',
      accent: '#b8860b',
    });
  }

  if (isKbsUiEnabled() && (isAdmin || staff.kbs_access_enabled !== false)) {
    push('admin', { id: 'kbs', label: t('kbsNavOperation'), href: '/staff/kbs', icon: 'scan-outline', accent: ACCENTS.kbs });
  }
  if (hasTechnicalAssetsStaffAccess(staff)) {
    push('admin', {
      id: 'tech',
      label: t('staffTechnicalAssetsTitle'),
      href: '/staff/technical-assets',
      icon: 'layers-outline',
      accent: ACCENTS.tech,
    });
  }

  pushBreakfastBriefingMenuItem(push, staff, isAdmin);

  const sectionTitles: Record<StaffHamburgerMenuSectionId, string> = {
    fnb: t('fnbHubMenuSection'),
    kitchen: t('staffMenuSectionKitchen'),
    nav: t('staffMenuSectionNav'),
    staff: t('staffMenuSectionStaff'),
    hotel: t('staffMenuSectionHotel'),
    ops: t('staffMenuSectionOps'),
    admin: t('staffMenuSectionAdmin'),
  };

  const built = (['fnb', 'kitchen', 'nav', 'staff', 'hotel', 'ops', 'admin'] as const)
    .filter((id) => sections[id].length > 0)
    .map((id) => ({ id, title: sectionTitles[id], items: sections[id] }));

  const afterHidden = filterStaffMenuSectionsByHidden(built, staff);
  return filterStaffMenuSectionsByOrgFeatures(afterHidden, orgUiFeatures);
}

/** Düz liste (geriye uyumluluk) */
export function flattenStaffHamburgerMenu(sections: StaffHamburgerMenuSection[]) {
  return sections.flatMap((s) => s.items);
}

export type StaffHamburgerMenuLayout = {
  /** Tam genişlik üst buton (ör. acil durum) */
  primary: StaffHamburgerMenuItem | null;
  /** Gezinti / modüller / yönetim — primary hariç */
  sections: StaffHamburgerMenuSection[];
};

/** Menü: acil üstte; kalan öğeler bölüm başlıklarıyla. */
export function buildStaffHamburgerMenuLayout(
  t: (key: string) => string,
  staff: StaffHamburgerStaff | null | undefined,
  orgUiFeatures?: OrganizationUiFeaturesConfig | null
): StaffHamburgerMenuLayout {
  const rawSections = buildStaffHamburgerMenuSections(t, staff, orgUiFeatures);
  const all = flattenStaffHamburgerMenu(rawSections);
  const emergencyItem = all.find((i) => i.id === 'emergency') ?? null;
  const kitchenPrimary =
    staff && isKitchenStaffMember(staff) && canAccessKitchenOps(staff)
      ? all.find((i) => i.id === 'kitchen_ops') ?? null
      : null;

  /** Acil durum her zaman anasayfa ve diğer menülerin üstünde (admin + personel). */
  const primary = emergencyItem ?? kitchenPrimary ?? null;
  const used = new Set<string>();
  if (primary) used.add(primary.id);

  const sections = rawSections
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => !used.has(i.id)),
    }))
    .filter((s) => s.items.length > 0);

  return { primary, sections };
}
