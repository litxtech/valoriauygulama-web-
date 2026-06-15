import i18n from '@/i18n';

/** Oda temizliği toplu onay kontrol listesi — `cleaningCheck_*` i18n anahtarları */
export const ROOM_CLEANING_CHECKLIST_KEYS = [
  'outlets',
  'lighting',
  'bed_top_bottom',
  'wall_lamps',
  'under_beds',
  'balconies',
  'tv_remotes',
  'glasses',
  'coffee_tea_sets',
  'bathroom_general',
  'ceiling_cobwebs',
] as const;

export type RoomCleaningChecklistKey = (typeof ROOM_CLEANING_CHECKLIST_KEYS)[number];

export type RoomCleaningChecklistState = Partial<Record<RoomCleaningChecklistKey, boolean>>;

export function cleaningChecklistLabel(key: RoomCleaningChecklistKey): string {
  const k = `cleaningCheck_${key}`;
  const v = i18n.t(k);
  return v === k ? key : v;
}

export function isCleaningChecklistComplete(state: RoomCleaningChecklistState | null | undefined): boolean {
  return ROOM_CLEANING_CHECKLIST_KEYS.every((key) => state?.[key] === true);
}

export function emptyCleaningChecklist(): Record<RoomCleaningChecklistKey, boolean> {
  return Object.fromEntries(ROOM_CLEANING_CHECKLIST_KEYS.map((k) => [k, false])) as Record<
    RoomCleaningChecklistKey,
    boolean
  >;
}

export function parseCleaningChecklist(raw: unknown): Record<RoomCleaningChecklistKey, boolean> {
  const base = emptyCleaningChecklist();
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  for (const key of ROOM_CLEANING_CHECKLIST_KEYS) {
    if (o[key] === true) base[key] = true;
  }
  return base;
}

export function checklistSummaryLines(state: RoomCleaningChecklistState): string[] {
  return ROOM_CLEANING_CHECKLIST_KEYS.filter((k) => state[k] === true).map((k) => cleaningChecklistLabel(k));
}
