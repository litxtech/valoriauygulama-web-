/**
 * Hamburger hızlı erişim — öncelikli modül 4. slota taşınır (deneme).
 */
export type StaffQuickSlotSignals = {
  newAssignmentCount: number;
  unreadMessages: number;
  boardHasUnread: boolean;
  boardUnreadCount: number;
  adminWarningCount: number;
};

type PromoRule = {
  id: string;
  priority: number;
  match: (signals: StaffQuickSlotSignals, isAdmin: boolean) => boolean;
};

const PROMO_RULES: PromoRule[] = [
  { id: 'tasks', priority: 100, match: (s) => s.newAssignmentCount > 0 },
  { id: 'admin_tab', priority: 90, match: (s, isAdmin) => isAdmin && s.adminWarningCount > 0 },
  { id: 'board', priority: 70, match: (s) => s.boardHasUnread },
];

/** Aktif sinyali olan en yüksek öncelikli modül (menüde varsa). */
export function resolvePromotedQuickId(
  isAdmin: boolean,
  signals: StaffQuickSlotSignals,
  availableIds: ReadonlySet<string>
): string | null {
  let best: PromoRule | null = null;
  for (const rule of PROMO_RULES) {
    if (!rule.match(signals, isAdmin) || !availableIds.has(rule.id)) continue;
    if (!best || rule.priority > best.priority) best = rule;
  }
  return best?.id ?? null;
}

/**
 * Öne çıkan modül 4. (sağ alt) slota.
 * Gridde yoksa varsayılanın son kartının yerine geçer.
 */
export function orderQuickAccessIds(defaultQuickIds: string[], promotedId: string | null): string[] {
  if (!promotedId || defaultQuickIds.length === 0) return defaultQuickIds;
  if (defaultQuickIds.includes(promotedId)) {
    const first3 = defaultQuickIds.filter((id) => id !== promotedId).slice(0, 3);
    return [...first3, promotedId];
  }
  if (defaultQuickIds.length < 4) return [...defaultQuickIds, promotedId].slice(0, 4);
  return [...defaultQuickIds.slice(0, 3), promotedId];
}

export function quickAccessBadgeForId(
  id: string,
  signals: StaffQuickSlotSignals,
  menuSessionTasksBadge: number
): number | undefined {
  if (id === 'tasks') {
    const n = Math.max(menuSessionTasksBadge, signals.newAssignmentCount);
    return n > 0 ? n : undefined;
  }
  if (id === 'board' && signals.boardUnreadCount > 0) return signals.boardUnreadCount;
  if (id === 'admin_tab' && signals.adminWarningCount > 0) return signals.adminWarningCount;
  return undefined;
}
