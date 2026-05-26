import { Ionicons } from '@expo/vector-icons';
import { canSeeBreakfastModule } from '@/lib/breakfastConfirm';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  canAccessDocumentManagement,
  canAccessIncidentReports,
  canAccessFacilityJournal,
  canAccessLostFound,
  canAccessReservationSales,
  canStaffCreateAssignments,
  canManageStaffMealMenu,
  canManageHotelKitchenMenu,
  hasTechnicalAssetsStaffAccess,
  isGorevAtaOnlyUser,
  type StaffPermissionSlice,
} from '@/lib/staffPermissions';
import { filterStaffMenuSectionsByHidden } from '@/lib/staffMenuVisibility';

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

export type StaffHamburgerMenuSectionId = 'nav' | 'staff' | 'hotel' | 'ops' | 'admin';

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
  assets: '#7c3aed',
  my_stock: '#0d9488',
  facility_journal: '#0f766e',
  debts: '#0369a1',
  mrz: '#ca8a04',
  contracts: '#6366f1',
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

/**
 * Personel hamburger menüsü — gezinti, yetkiye bağlı modüller ve yönetim.
 * Profil “Hızlı erişim” kartlarıyla çakışmaması için tek kaynak.
 */
export function buildStaffHamburgerMenuSections(
  t: (key: string) => string,
  staff: StaffHamburgerStaff | null | undefined
): StaffHamburgerMenuSection[] {
  const { push, sections } = createBuilder();
  if (!staff) return [];

  const isAdmin = staff.role === 'admin';
  const isFullAdmin = isAdmin && !isGorevAtaOnlyUser(staff);
  const perms = staff.app_permissions ?? {};

  // —— Gezinti (ana sayfalar) ——
  push('nav', { id: 'home', label: t('staffHome'), href: '/staff', icon: 'home-outline', accent: ACCENTS.home });
  push('nav', { id: 'map', label: t('mapTab'), href: '/staff/map', icon: 'map-outline', accent: ACCENTS.map });
  push('nav', { id: 'board', label: t('staffBoardTitle'), href: '/staff/board', icon: 'eye-outline', accent: ACCENTS.board });
  if (!isAdmin) {
    push('nav', {
      id: 'emergency',
      label: t('screenEmergencyButton'),
      href: '/staff/emergency',
      icon: 'warning-outline',
      accent: ACCENTS.emergency,
    });
  }

  // —— Personel İşleri (personeli doğrudan ilgilendiren) ——
  push('staff', { id: 'tasks', label: t('tasks'), href: '/staff/tasks', icon: 'checkbox-outline', accent: ACCENTS.tasks });
  push('staff', {
    id: 'attendance',
    label: t('staffAttendanceNavTitle'),
    href: '/staff/attendance',
    icon: 'time-outline',
    accent: ACCENTS.attendance,
  });
  push('staff', {
    id: 'perf',
    label: t('perfDashboardTitle'),
    href: '/staff/performance',
    icon: 'stats-chart-outline',
    accent: ACCENTS.perf,
  });
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
  if (isAdmin || perms.yarin_oda_temizlik_listesi) {
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
  if (isFullAdmin) {
    push('staff', {
      id: 'expenses_all',
      label: t('profileUiAllExpenses'),
      href: '/admin/expenses/all',
      icon: 'list-outline',
      accent: ACCENTS.expenses,
    });
  } else {
    push('staff', {
      id: 'expenses_mine',
      label: t('profileUiMyExpenses'),
      href: '/staff/expenses',
      icon: 'wallet-outline',
      accent: ACCENTS.expenses,
    });
  }
  push('staff', {
    id: 'complaint',
    label: t('profileUiStaffComplaint'),
    href: '/staff/internal-complaints/new',
    icon: 'alert-circle-outline',
    accent: ACCENTS.complaint,
  });
  if (canStaffCreateAssignments(staff)) {
    push('staff', {
      id: 'assign',
      label: t('profileUiNewTaskAssign'),
      href: '/admin/tasks/assign',
      icon: 'add-circle-outline',
      accent: ACCENTS.assign,
    });
  }
  if (perms.tum_sozlesmeler && !isAdmin) {
    push('staff', {
      id: 'contracts_staff',
      label: t('contractsShortcut'),
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
  push('hotel', { id: 'guests', label: t('adminGuests'), href: '/staff/guests', icon: 'people-outline', accent: ACCENTS.guests });
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
  push('ops', {
    id: 'missing',
    label: t('screenMissingItems'),
    href: '/staff/missing-items',
    icon: 'alert-circle-outline',
    accent: ACCENTS.missing,
  });
  if (canAccessFacilityJournal(staff)) {
    const fjBase = isAdmin ? '/admin/facility-journal' : '/staff/facility-journal';
    push('ops', {
      id: 'facility_journal_new',
      label: 'Tesis günlüğü — yeni kayıt',
      href: `${fjBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.facility_journal,
    });
    push('ops', {
      id: 'facility_journal',
      label: 'Tesis günlüğü',
      href: fjBase,
      icon: 'clipboard-outline',
      accent: ACCENTS.facility_journal,
    });
  }
  if (canAccessLostFound(staff)) {
    const lfBase = isAdmin ? '/admin/lost-found' : '/staff/lost-found';
    push('ops', {
      id: 'lost_found_new',
      label: t('lfQuickFound'),
      href: `${lfBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.lost_found,
    });
    push('ops', {
      id: 'lost_found',
      label: t('screenLostFound'),
      href: lfBase,
      icon: 'briefcase-outline',
      accent: ACCENTS.lost_found,
    });
  }
  push('ops', { id: 'stock', label: t('stockTab'), href: '/staff/stock', icon: 'cube-outline', accent: ACCENTS.stock });
  push('ops', {
    id: 'my_stock',
    label: t('myStocks'),
    href: '/staff/stock/my-movements',
    icon: 'list',
    accent: ACCENTS.my_stock,
  });
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
  push('ops', {
    id: 'demirbas',
    label: t('profileUiFixedAssets'),
    href: '/staff/demirbaslar',
    icon: 'library-outline',
    accent: ACCENTS.assets,
  });
  push('ops', {
    id: 'debts',
    label: t('staffDebtReceivable'),
    href: '/staff/debts',
    icon: 'swap-horizontal-outline',
    accent: ACCENTS.debts,
  });
  if (isFullAdmin) {
    push('ops', {
      id: 'accounting',
      label: t('profileUiAccountingHub'),
      href: '/admin/accounting',
      icon: 'calculator-outline',
      accent: ACCENTS.accounting,
    });
  }

  // —— Yönetim ——
  if (isAdmin) {
    push('admin', { id: 'admin_tab', label: t('adminTab'), href: '/staff/admin', icon: 'shield-checkmark-outline', accent: ACCENTS.admin });
    push('admin', {
      id: 'audits',
      label: t('perfAuditBoard'),
      href: '/admin/audits',
      icon: 'clipboard-outline',
      accent: ACCENTS.audits,
    });
    push('admin', {
      id: 'staff_month_best',
      label: t('perfStaffOfMonth'),
      href: '/admin/performance',
      icon: 'trophy-outline',
      accent: ACCENTS.staff_month_best,
    });
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
    push('admin', {
      id: 'area_guide',
      label: t('profileUiAdminAreaGuide'),
      href: '/admin/local-area-guide',
      icon: 'map-outline',
      accent: ACCENTS.area_guide,
    });
    push('admin', {
      id: 'breakfast_admin',
      label: t('profileUiBreakfastRecords'),
      href: '/admin/breakfast-confirm',
      icon: 'cafe-outline',
      accent: ACCENTS.breakfast,
    });
    push('admin', {
      id: 'salary_all',
      label: t('profileUiAllPayments'),
      href: '/admin/salary/all',
      icon: 'cash-outline',
      accent: ACCENTS.salary_all,
    });
    push('admin', {
      id: 'contracts_all',
      label: t('profileUiAllContracts'),
      href: '/admin/contracts/all',
      icon: 'document-text-outline',
      accent: ACCENTS.contracts,
    });
    push('admin', {
      id: 'stock_all',
      label: t('profileUiAllStocks'),
      href: '/admin/stock/all',
      icon: 'layers-outline',
      accent: ACCENTS.stock,
    });
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

  const sectionTitles: Record<StaffHamburgerMenuSectionId, string> = {
    nav: t('staffMenuSectionNav'),
    staff: t('staffMenuSectionStaff'),
    hotel: t('staffMenuSectionHotel'),
    ops: t('staffMenuSectionOps'),
    admin: t('staffMenuSectionAdmin'),
  };

  const built = (['nav', 'staff', 'hotel', 'ops', 'admin'] as const)
    .filter((id) => sections[id].length > 0)
    .map((id) => ({ id, title: sectionTitles[id], items: sections[id] }));

  return filterStaffMenuSectionsByHidden(built, staff);
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
  staff: StaffHamburgerStaff | null | undefined
): StaffHamburgerMenuLayout {
  const rawSections = buildStaffHamburgerMenuSections(t, staff);
  const all = flattenStaffHamburgerMenu(rawSections);
  const isAdmin = staff?.role === 'admin';

  const primaryId = isAdmin ? null : 'emergency';
  const primary = primaryId ? all.find((i) => i.id === primaryId) ?? null : null;
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
