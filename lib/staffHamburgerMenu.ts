import { Ionicons } from '@expo/vector-icons';
import { canSeeBreakfastModule } from '@/lib/breakfastConfirm';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  orderQuickAccessIds,
  resolvePromotedQuickId,
  type StaffQuickSlotSignals,
} from '@/lib/staffHamburgerQuickSlot';
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

export type StaffHamburgerMenuSection = {
  id: 'nav' | 'tools' | 'admin';
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
};

function normHref(href: string): string {
  return href.replace(/\/+$/, '') || '/';
}

type MenuBuilder = {
  push: (section: StaffHamburgerMenuSection['id'], item: Omit<StaffHamburgerMenuItem, 'id'> & { id: string }) => void;
};

function createBuilder(): { push: MenuBuilder['push']; sections: Record<StaffHamburgerMenuSection['id'], StaffHamburgerMenuItem[]> } {
  const seen = new Set<string>();
  const sections: Record<StaffHamburgerMenuSection['id'], StaffHamburgerMenuItem[]> = {
    nav: [],
    tools: [],
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

  // —— Gezinti (sekmeler / sık kullanılan) ——
  push('nav', { id: 'home', label: t('staffHome'), href: '/staff', icon: 'home-outline', accent: ACCENTS.home });
  push('nav', { id: 'map', label: t('mapTab'), href: '/staff/map', icon: 'map-outline', accent: ACCENTS.map });
  push('nav', { id: 'tasks', label: t('tasks'), href: '/staff/tasks', icon: 'checkbox-outline', accent: ACCENTS.tasks });
  push('nav', {
    id: 'attendance',
    label: t('staffAttendanceNavTitle'),
    href: '/staff/attendance',
    icon: 'time-outline',
    accent: ACCENTS.attendance,
  });
  push('nav', { id: 'board', label: t('staffBoardTitle'), href: '/staff/board', icon: 'eye-outline', accent: ACCENTS.board });
  push('nav', { id: 'guests', label: t('adminGuests'), href: '/staff/guests', icon: 'people-outline', accent: ACCENTS.guests });
  push('nav', { id: 'stock', label: t('stockTab'), href: '/staff/stock', icon: 'cube-outline', accent: ACCENTS.stock });
  if (!isAdmin) {
    push('nav', {
      id: 'transfer',
      label: t('transferTourNavTitle'),
      href: '/staff/transfer-tour',
      icon: 'car-outline',
      accent: ACCENTS.transfer,
    });
    push('nav', {
      id: 'dining',
      label: t('diningVenuesNavTitle'),
      href: '/staff/dining-venues',
      icon: 'restaurant-outline',
      accent: ACCENTS.dining,
    });
  }
  // —— Modüller (eski profil hızlı erişim + yetkiler) ——
  push('tools', {
    id: 'missing',
    label: t('screenMissingItems'),
    href: '/staff/missing-items',
    icon: 'alert-circle-outline',
    accent: ACCENTS.missing,
  });
  if (canAccessFacilityJournal(staff)) {
    const fjBase = isAdmin ? '/admin/facility-journal' : '/staff/facility-journal';
    push('tools', {
      id: 'facility_journal_new',
      label: 'Tesis günlüğü — yeni kayıt',
      href: `${fjBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.facility_journal,
    });
    push('tools', {
      id: 'facility_journal',
      label: 'Tesis günlüğü',
      href: fjBase,
      icon: 'clipboard-outline',
      accent: ACCENTS.facility_journal,
    });
  }
  if (canAccessLostFound(staff)) {
    const lfBase = isAdmin ? '/admin/lost-found' : '/staff/lost-found';
    push('tools', {
      id: 'lost_found_new',
      label: t('lfQuickFound'),
      href: `${lfBase}/new`,
      icon: 'add-circle-outline',
      accent: ACCENTS.lost_found,
    });
    push('tools', {
      id: 'lost_found',
      label: t('screenLostFound'),
      href: lfBase,
      icon: 'briefcase-outline',
      accent: ACCENTS.lost_found,
    });
  }
  push('tools', {
    id: 'perf',
    label: t('perfDashboardTitle'),
    href: '/staff/performance',
    icon: 'stats-chart-outline',
    accent: ACCENTS.perf,
  });
  push('tools', {
    id: 'meal',
    label: t('staffMealMenuTitle'),
    href: '/staff/meal-menu',
    icon: 'fast-food-outline',
    accent: ACCENTS.meal,
  });
  push('tools', {
    id: 'hotel_kitchen_menu',
    label: t('screenHotelKitchenMenu'),
    href: '/staff/hotel-menu',
    icon: 'restaurant-outline',
    accent: ACCENTS.meal,
  });
  if (canManageHotelKitchenMenu(staff)) {
    push('tools', {
      id: 'hotel_kitchen_menu_manage',
      label: t('hotelKitchenMenuManageCta'),
      href: '/staff/hotel-menu/manage',
      icon: 'create-outline',
      accent: ACCENTS.meal_edit,
    });
  }
  if (canManageStaffMealMenu(staff)) {
    push('tools', {
      id: 'meal_edit',
      label: t('profileUiMealMenuManage'),
      href: '/staff/meal-menu-edit',
      icon: 'create-outline',
      accent: ACCENTS.meal_edit,
    });
  }
  push('tools', {
    id: 'meal_hist',
    label: t('staffMealHistoryTitle'),
    href: '/staff/meal-menu-history',
    icon: 'time-outline',
    accent: ACCENTS.meal_hist,
  });
  push('tools', {
    id: 'salary_history',
    label: t('salaryHistory'),
    href: '/staff/salary-history',
    icon: 'wallet-outline',
    accent: ACCENTS.salary_history,
  });
  push('tools', {
    id: 'area_guide_staff',
    label: t('localAreaGuideScreenTitle'),
    href: '/staff/local-area-guide',
    icon: 'trail-sign-outline',
    accent: ACCENTS.area_guide,
  });
  push('tools', {
    id: 'official_warnings',
    label: t('staffOfficialWarningsNavTitle'),
    href: '/staff/warnings',
    icon: 'warning-outline',
    accent: ACCENTS.warnings,
  });

  if (canStaffCreateAssignments(staff)) {
    push('tools', {
      id: 'assign',
      label: t('profileUiNewTaskAssign'),
      href: '/admin/tasks/assign',
      icon: 'add-circle-outline',
      accent: ACCENTS.assign,
    });
  }

  if (isFullAdmin) {
    push('tools', {
      id: 'accounting',
      label: t('profileUiAccountingHub'),
      href: '/admin/accounting',
      icon: 'calculator-outline',
      accent: ACCENTS.accounting,
    });
    push('tools', {
      id: 'expenses_all',
      label: t('profileUiAllExpenses'),
      href: '/admin/expenses/all',
      icon: 'list-outline',
      accent: ACCENTS.expenses,
    });
  } else {
    push('tools', {
      id: 'expenses_mine',
      label: t('profileUiMyExpenses'),
      href: '/staff/expenses',
      icon: 'wallet-outline',
      accent: ACCENTS.expenses,
    });
  }

  if (!isAdmin) {
    push('tools', {
      id: 'emergency',
      label: t('screenEmergencyButton'),
      href: '/staff/emergency',
      icon: 'warning-outline',
      accent: ACCENTS.emergency,
    });
  }

  if (isAdmin || perms.yarin_oda_temizlik_listesi) {
    push('tools', {
      id: 'cleaning',
      label: t('staffCleaningNavTitle'),
      href: '/staff/cleaning-plan',
      icon: 'checkbox-outline',
      accent: ACCENTS.cleaning,
    });
  }

  if (canAccessDocumentManagement(staff)) {
    push('tools', {
      id: 'docs',
      label: t('profileUiDocumentManagement'),
      href: '/staff/documents',
      icon: 'folder-open-outline',
      accent: ACCENTS.docs,
    });
  }
  if (canAccessIncidentReports(staff)) {
    push('tools', {
      id: 'incident',
      label: t('profileUiIncidentCreate'),
      href: '/staff/incident-reports/new',
      icon: 'document-text-outline',
      accent: ACCENTS.incident,
    });
  }
  if (canAccessReservationSales(staff)) {
    push('tools', {
      id: 'sales',
      label: t('profileUiSalesCommission'),
      href: '/staff/sales',
      icon: 'cash-outline',
      accent: ACCENTS.sales,
    });
  }
  if (canSeeBreakfastModule(staff)) {
    push('tools', {
      id: 'breakfast_staff',
      label: t('profileUiBreakfastUpload'),
      href: '/staff/breakfast-confirm',
      icon: 'cafe-outline',
      accent: ACCENTS.breakfast,
    });
  }
  if (canStaffUseMrzScan(staff)) {
    push('tools', {
      id: 'passports',
      label: t('staffPassportsTitle'),
      href: '/staff/profile/passports',
      icon: 'id-card-outline',
      accent: ACCENTS.mrz,
    });
  }

  push('tools', {
    id: 'complaint',
    label: t('profileUiStaffComplaint'),
    href: '/staff/internal-complaints/new',
    icon: 'alert-circle-outline',
    accent: ACCENTS.complaint,
  });
  push('tools', {
    id: 'demirbas',
    label: t('profileUiFixedAssets'),
    href: '/staff/demirbaslar',
    icon: 'library-outline',
    accent: ACCENTS.assets,
  });
  push('tools', {
    id: 'my_stock',
    label: t('myStocks'),
    href: '/staff/stock/my-movements',
    icon: 'list',
    accent: ACCENTS.my_stock,
  });
  push('tools', {
    id: 'debts',
    label: t('staffDebtReceivable'),
    href: '/staff/debts',
    icon: 'swap-horizontal-outline',
    accent: ACCENTS.debts,
  });

  if (perms.tum_sozlesmeler && !isAdmin) {
    push('tools', {
      id: 'contracts_staff',
      label: t('contractsShortcut'),
      href: '/staff/contracts/all',
      icon: 'document-text-outline',
      accent: ACCENTS.contracts,
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

  const sectionTitles: Record<StaffHamburgerMenuSection['id'], string> = {
    nav: t('staffMenuSectionNav'),
    tools: t('staffMenuSectionTools'),
    admin: t('staffMenuSectionAdmin'),
  };

  const built = (['nav', 'tools', 'admin'] as const)
    .filter((id) => sections[id].length > 0)
    .map((id) => ({ id, title: sectionTitles[id], items: sections[id] }));

  return filterStaffMenuSectionsByHidden(built, staff);
}

/** Düz liste (geriye uyumluluk) */
export function flattenStaffHamburgerMenu(sections: StaffHamburgerMenuSection[]) {
  return sections.flatMap((s) => s.items);
}

export type StaffHamburgerQuickAccessEntry = StaffHamburgerMenuItem & {
  /** Öncelikli sinyal — 4. slotta vurgulanır */
  promoted?: boolean;
};

export type StaffHamburgerMenuLayout = {
  /** Tam genişlik üst buton (ör. acil durum) */
  primary: StaffHamburgerMenuItem | null;
  /** Üst hızlı erişim — sık kullanılan 4 kısayol (dinamik sıra) */
  quickAccess: StaffHamburgerQuickAccessEntry[];
  /** Gezinti / modüller / yönetim — primary ve quickAccess hariç */
  sections: StaffHamburgerMenuSection[];
  /** Hangi modül öne çıkarıldı (yoksa varsayılan sıra) */
  promotedQuickId: string | null;
};

export type { StaffQuickSlotSignals };

function pickByIds(all: StaffHamburgerMenuItem[], ids: string[]): StaffHamburgerMenuItem[] {
  const map = new Map(all.map((i) => [i.id, i]));
  const out: StaffHamburgerMenuItem[] = [];
  for (const id of ids) {
    const item = map.get(id);
    if (item) out.push(item);
  }
  return out;
}

/** Menü: acil + hızlı erişim üstte; kalan öğeler bölüm başlıklarıyla. */
export function buildStaffHamburgerMenuLayout(
  t: (key: string) => string,
  staff: StaffHamburgerStaff | null | undefined,
  signals?: StaffQuickSlotSignals | null
): StaffHamburgerMenuLayout {
  const rawSections = buildStaffHamburgerMenuSections(t, staff);
  const all = flattenStaffHamburgerMenu(rawSections);
  const isAdmin = staff?.role === 'admin';
  const canLf = canAccessLostFound(staff);

  const primaryId = isAdmin ? null : 'emergency';
  const defaultQuickIds = isAdmin
    ? canLf
      ? ['lost_found_new', 'missing', 'admin_tab', 'tasks']
      : ['missing', 'admin_tab', 'tasks', 'board']
    : canLf
      ? ['lost_found_new', 'missing', 'tasks', 'board']
      : ['missing', 'tasks', 'board', 'attendance'];

  const availableIds = new Set(all.map((i) => i.id));
  const promotedQuickId =
    signals != null ? resolvePromotedQuickId(isAdmin, signals, availableIds) : null;
  const quickIds = orderQuickAccessIds(defaultQuickIds, promotedQuickId);

  const primary = primaryId ? all.find((i) => i.id === primaryId) ?? null : null;
  const used = new Set<string>();
  if (primary) used.add(primary.id);

  const quickAccess = pickByIds(all, quickIds)
    .filter((i) => {
      if (used.has(i.id)) return false;
      used.add(i.id);
      return true;
    })
    .map((item) => ({
      ...item,
      promoted: promotedQuickId != null && item.id === promotedQuickId,
    }));

  const sections = rawSections
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => !used.has(i.id)),
    }))
    .filter((s) => s.items.length > 0);

  return { primary, quickAccess, sections, promotedQuickId };
}
