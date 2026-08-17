import type { TFunction } from 'i18next';
import type {
  StaffHamburgerMenuItem,
  StaffHamburgerMenuLayout,
  StaffHamburgerMenuSection,
} from '@/lib/staffHamburgerTypes';
import {
  canAccessKitchenFinance,
  canAccessKitchenOps,
  canAccessKitchenReceptionAccounting,
  canManageHotelKitchenMenu,
  canAccessReservationSales,
  canViewStaffKitchenMenuOrders,
  type StaffPermissionSlice,
} from '@/lib/staffPermissions';

export type ShortcutChildrenOpts = {
  financeStaffIds?: string[] | null;
};

function normHref(href: string): string {
  return href.replace(/\/+$/, '') || '/';
}

type ChildDef = {
  id: string;
  labelKey?: string;
  label?: string;
  href: string;
  icon: StaffHamburgerMenuItem['icon'];
  accent: string;
  visible: (staff: StaffPermissionSlice, opts: ShortcutChildrenOpts) => boolean;
};

function kitchenFinanceVisible(staff: StaffPermissionSlice, opts: ShortcutChildrenOpts) {
  return canAccessKitchenFinance(staff, opts.financeStaffIds);
}

function kitchenOpsVisible(staff: StaffPermissionSlice) {
  return canAccessKitchenOps(staff);
}

/** Mutfak Operasyon alt kısayolları */
const KITCHEN_OPS_CHILDREN: ChildDef[] = [
  {
    id: 'kitchen_revenue_enter',
    labelKey: 'staffKitchenRevenueEnter',
    href: '/staff/kitchen-ops/revenue/new',
    icon: 'cash-outline',
    accent: '#059669',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_revenue_list',
    labelKey: 'staffKitchenRevenue',
    href: '/staff/kitchen-ops/revenue',
    icon: 'wallet-outline',
    accent: '#059669',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_expense_enter',
    labelKey: 'staffKitchenExpenseEnter',
    href: '/staff/kitchen-ops/expenses/new',
    icon: 'receipt-outline',
    accent: '#ea580c',
    visible: (staff, opts) =>
      kitchenFinanceVisible(staff, opts) || canAccessKitchenReceptionAccounting(staff),
  },
  {
    id: 'kitchen_expenses_list',
    labelKey: 'staffKitchenExpenses',
    href: '/staff/kitchen-ops/expenses',
    icon: 'document-text-outline',
    accent: '#ea580c',
    visible: (staff, opts) =>
      kitchenFinanceVisible(staff, opts) || canAccessKitchenReceptionAccounting(staff),
  },
  {
    id: 'kitchen_stock_entry',
    labelKey: 'staffKitchenStockAdd',
    href: '/staff/kitchen-ops/stock/entry',
    icon: 'add-circle-outline',
    accent: '#059669',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_stock_exit',
    labelKey: 'staffKitchenStockExit',
    href: '/staff/kitchen-ops/stock/exit',
    icon: 'remove-circle-outline',
    accent: '#d97706',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_stock_current',
    labelKey: 'staffKitchenCurrentStock',
    href: '/staff/kitchen-ops/stock/current',
    icon: 'layers-outline',
    accent: '#2563eb',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_stock_low',
    labelKey: 'staffKitchenLowStock',
    href: '/staff/kitchen-ops/stock/low',
    icon: 'alert-circle-outline',
    accent: '#dc2626',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_stock_scan',
    labelKey: 'staffKitchenBarcodeScan',
    href: '/staff/kitchen-ops/stock/scan',
    icon: 'scan-outline',
    accent: '#7c3aed',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_menu_orders_child',
    labelKey: 'staffKitchenMenuOrdersTitle',
    href: '/staff/kitchen-ops/menu-orders',
    icon: 'bag-handle-outline',
    accent: '#d97706',
    visible: (staff) => canViewStaffKitchenMenuOrders(staff),
  },
  {
    id: 'kitchen_shortages',
    labelKey: 'staffKitchenShortages',
    href: '/staff/kitchen-ops/shortages',
    icon: 'clipboard-outline',
    accent: '#E67E22',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_handovers',
    labelKey: 'staffKitchenHandovers',
    href: '/staff/kitchen-ops/handovers',
    icon: 'swap-horizontal-outline',
    accent: '#0d9488',
    visible: kitchenOpsVisible,
  },
  {
    id: 'kitchen_pos',
    labelKey: 'staffKitchenPos',
    href: '/staff/kitchen-ops/pos',
    icon: 'card-outline',
    accent: '#dc2626',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_finance_bridge',
    label: 'Mutfak ↔ Resepsiyon Finans',
    href: '/staff/kitchen-ops/finance-bridge',
    icon: 'git-compare-outline',
    accent: '#4f46e5',
    visible: (staff, opts) =>
      kitchenFinanceVisible(staff, opts) || canAccessKitchenReceptionAccounting(staff),
  },
  {
    id: 'kitchen_personnel',
    labelKey: 'staffKitchenPersonnelPayments',
    href: '/staff/kitchen-ops/personnel',
    icon: 'people-outline',
    accent: '#2563eb',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_suppliers',
    labelKey: 'staffKitchenSupplierDebts',
    href: '/staff/kitchen-ops/suppliers',
    icon: 'storefront-outline',
    accent: '#7c3aed',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_cari',
    labelKey: 'staffKitchenHotelCari',
    href: '/staff/kitchen-ops/cari',
    icon: 'git-compare-outline',
    accent: '#0d9488',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_settlements',
    labelKey: 'staffKitchenSettlements',
    href: '/staff/kitchen-ops/settlements',
    icon: 'hand-left-outline',
    accent: '#b45309',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_finance_summary',
    labelKey: 'staffKitchenFinanceSummary',
    href: '/staff/kitchen-ops/finance',
    icon: 'pie-chart-outline',
    accent: '#4f46e5',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'kitchen_reception_child',
    labelKey: 'staffKitchenReceptionAccounting',
    href: '/staff/kitchen-ops/reception',
    icon: 'business-outline',
    accent: '#64748b',
    visible: (staff) => canAccessKitchenReceptionAccounting(staff),
  },
  {
    id: 'kitchen_day_close',
    labelKey: 'staffKitchenDayClose',
    href: '/staff/kitchen-ops/day-close',
    icon: 'moon-outline',
    accent: '#334155',
    visible: (staff, opts) =>
      kitchenFinanceVisible(staff, opts) || canAccessKitchenReceptionAccounting(staff),
  },
];

/** F&B Merkezi alt kısayolları — aynı rota için kitchen_ops ile ortak id */
const FNB_HUB_CHILDREN: ChildDef[] = [
  {
    id: 'kitchen_revenue_enter',
    labelKey: 'staffKitchenRevenueEnter',
    href: '/staff/kitchen-ops/revenue/new',
    icon: 'cash-outline',
    accent: '#059669',
    visible: kitchenFinanceVisible,
  },
  {
    id: 'fnb_sales_new',
    label: 'Anlık satış gir',
    href: '/staff/sales/new',
    icon: 'add-circle-outline',
    accent: '#10b981',
    visible: (staff) => canAccessReservationSales(staff),
  },
  {
    id: 'kitchen_finance_bridge',
    label: 'Mutfak ↔ Resepsiyon Finans',
    href: '/staff/kitchen-ops/finance-bridge',
    icon: 'git-compare-outline',
    accent: '#4f46e5',
    visible: (staff, opts) =>
      kitchenFinanceVisible(staff, opts) || canAccessKitchenReceptionAccounting(staff),
  },
  {
    id: 'fnb_menu_manage',
    label: 'Menü yönet',
    href: '/staff/hotel-menu/manage',
    icon: 'restaurant-outline',
    accent: '#ea580c',
    visible: (staff) => canManageHotelKitchenMenu(staff),
  },
];

/** Parent menü id → alt kısayol tanımları */
const CHILDREN_BY_PARENT: Record<string, ChildDef[]> = {
  kitchen_ops: KITCHEN_OPS_CHILDREN,
  fnb_hub: FNB_HUB_CHILDREN,
};

/** Hub ekranından basılı tutunca pinlenecek rota → menü id */
const HREF_TO_SHORTCUT_PIN_ID: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const defs of Object.values(CHILDREN_BY_PARENT)) {
    for (const def of defs) {
      const key = normHref(def.href);
      if (!map.has(key)) map.set(key, def.id);
    }
  }
  return map;
})();

function resolveChildLabel(t: TFunction, def: ChildDef): string {
  if (def.labelKey) {
    const translated = t(def.labelKey);
    if (translated && translated !== def.labelKey) return translated;
  }
  return def.label ?? def.id;
}

function toMenuItem(t: TFunction, def: ChildDef): StaffHamburgerMenuItem {
  return {
    id: def.id,
    label: resolveChildLabel(t, def),
    href: def.href,
    icon: def.icon,
    accent: def.accent,
  };
}

/** Mutfak / F&B hub rotasını hamburger pin id’sine çevirir. */
export function resolveShortcutPinIdForHref(href: string | null | undefined): string | null {
  if (!href) return null;
  return HREF_TO_SHORTCUT_PIN_ID.get(normHref(href)) ?? null;
}

export function listShortcutParentIds(): string[] {
  return Object.keys(CHILDREN_BY_PARENT);
}

/**
 * Yetkili hub alt özelliklerini menüye ekler — yalnızca hub görünmesin, alt sekmeler de listelensin.
 * Aynı href zaten menüdeyse atlanır.
 */
export function expandLayoutWithShortcutChildren(
  layout: StaffHamburgerMenuLayout | null | undefined,
  t: TFunction,
  staff: StaffPermissionSlice | null | undefined,
  opts: ShortcutChildrenOpts = {}
): StaffHamburgerMenuLayout | null {
  if (!layout || !staff) return layout ?? null;

  const parentIds = listShortcutParentIds().filter((id) => parentHasShortcutChildren(id));
  const children = collectShortcutChildPool(t, staff, parentIds, opts);
  if (!children.length) return layout;

  const seenHrefs = new Set<string>();
  const mark = (item: StaffHamburgerMenuItem | null | undefined) => {
    if (!item?.href) return;
    seenHrefs.add(normHref(item.href));
  };
  mark(layout.primary);
  for (const h of layout.hubs ?? []) mark(h);
  for (const section of layout.sections ?? []) {
    for (const item of section.items ?? []) mark(item);
  }

  const toAdd = children.filter((item) => !seenHrefs.has(normHref(item.href)));
  if (!toAdd.length) return layout;

  const preferKitchen = toAdd.some((i) => i.href.includes('/kitchen-ops/'));
  const targetSectionId = preferKitchen ? 'kitchen' : 'ops';
  const sectionTitle =
    targetSectionId === 'kitchen' ? t('staffMenuSectionKitchen') : t('staffMenuSectionOps');

  const sections: StaffHamburgerMenuSection[] = [...(layout.sections ?? [])];
  const idx = sections.findIndex((s) => s.id === targetSectionId);
  if (idx >= 0) {
    sections[idx] = {
      ...sections[idx],
      items: [...(sections[idx].items ?? []), ...toAdd],
    };
  } else {
    const fnbIdx = sections.findIndex((s) => s.id === 'fnb');
    const insertAt = targetSectionId === 'kitchen' ? (fnbIdx >= 0 ? fnbIdx + 1 : 0) : sections.length;
    sections.splice(insertAt, 0, {
      id: targetSectionId,
      title: sectionTitle,
      items: toAdd,
    });
  }

  return { ...layout, sections };
}

export function buildShortcutChildrenForParent(
  t: TFunction,
  parentId: string,
  staff: StaffPermissionSlice,
  opts: ShortcutChildrenOpts = {}
): StaffHamburgerMenuItem[] {
  if (!staff) return [];
  const defs = CHILDREN_BY_PARENT[parentId];
  if (!defs?.length) return [];
  return defs.filter((d) => d.visible(staff, opts)).map((d) => toMenuItem(t, d));
}

/** Seçicide drill-down için parent → children haritası (yalnızca menüde görünen parent’lar). */
export function buildShortcutChildrenByParentId(
  t: TFunction,
  staff: StaffPermissionSlice,
  availableParentIds: Iterable<string>,
  opts: ShortcutChildrenOpts = {}
): Record<string, StaffHamburgerMenuItem[]> {
  const out: Record<string, StaffHamburgerMenuItem[]> = {};
  if (!staff) return out;
  for (const parentId of availableParentIds) {
    if (!CHILDREN_BY_PARENT[parentId]) continue;
    const children = buildShortcutChildrenForParent(t, parentId, staff, opts);
    if (children.length) out[parentId] = children;
  }
  return out;
}

/** Pin çözümleme havuzu — layout + tüm yetkili alt kısayollar. */
export function collectShortcutChildPool(
  t: TFunction,
  staff: StaffPermissionSlice,
  availableParentIds: Iterable<string>,
  opts: ShortcutChildrenOpts = {}
): StaffHamburgerMenuItem[] {
  const byParent = buildShortcutChildrenByParentId(t, staff, availableParentIds, opts);
  const seen = new Set<string>();
  const out: StaffHamburgerMenuItem[] = [];
  for (const children of Object.values(byParent)) {
    for (const item of children) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

export function parentHasShortcutChildren(parentId: string): boolean {
  return Boolean(CHILDREN_BY_PARENT[parentId]?.length);
}
