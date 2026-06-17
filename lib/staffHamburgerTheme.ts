import type { StaffHamburgerMenuSectionId } from '@/lib/staffHamburgerTypes';

const HEX = /^#[0-9a-fA-F]{6}$/;

export type StaffHamburgerLayoutMode = 'classic' | 'compact' | 'grid';
export type StaffHamburgerHeaderStyle = 'gradient' | 'solid' | 'minimal';
export type StaffHamburgerItemStyle = 'list' | 'grid' | 'pill';
export type StaffHamburgerThemePreset =
  | 'default'
  | 'indigo'
  | 'emerald'
  | 'rose'
  | 'slate'
  | 'amber'
  | 'night'
  | 'minimal'
  | 'grid';

export type StaffHamburgerThemeConfig = {
  preset?: StaffHamburgerThemePreset;
  layoutMode?: StaffHamburgerLayoutMode;
  headerStyle?: StaffHamburgerHeaderStyle;
  itemStyle?: StaffHamburgerItemStyle;
  headerGradient?: string[] | null;
  headerSolidColor?: string | null;
  drawerBackground?: string | null;
  backdropColor?: string | null;
  primaryButtonColor?: string | null;
  primaryButtonGradient?: string[] | null;
  cardBackground?: string | null;
  cardBorder?: string | null;
  textColor?: string | null;
  mutedTextColor?: string | null;
  chevronColor?: string | null;
  sectionColors?: Record<string, string>;
  itemAccents?: Record<string, string>;
  sectionTitles?: Record<string, string>;
  showSearch?: boolean;
  showRecentFlyout?: boolean;
  showHubCards?: boolean;
  showSectionIcons?: boolean;
  showSectionLabels?: boolean;
  searchMinItems?: number;
  drawerBorderRadius?: number;
};

export type ResolvedStaffHamburgerTheme = {
  preset: StaffHamburgerThemePreset;
  layoutMode: StaffHamburgerLayoutMode;
  headerStyle: StaffHamburgerHeaderStyle;
  itemStyle: StaffHamburgerItemStyle;
  headerGradient: readonly string[];
  headerSolidColor: string;
  drawerBackground: string | null;
  backdropColor: string;
  primaryButtonColor: string;
  primaryButtonGradient: readonly string[];
  cardBackground: string | null;
  cardBorder: string | null;
  textColor: string | null;
  mutedTextColor: string | null;
  chevronColor: string | null;
  sectionColors: Record<StaffHamburgerMenuSectionId, string>;
  itemAccents: Record<string, string>;
  sectionTitles: Record<string, string>;
  showSearch: boolean;
  showRecentFlyout: boolean;
  showHubCards: boolean;
  showSectionIcons: boolean;
  showSectionLabels: boolean;
  searchMinItems: number;
  drawerBorderRadius: number;
};

export const DEFAULT_SECTION_COLORS: Record<StaffHamburgerMenuSectionId, string> = {
  fnb: '#ea580c',
  kitchen: '#ea580c',
  nav: '#6366f1',
  staff: '#ea580c',
  hotel: '#0d9488',
  payments: '#635bff',
  ops: '#2563eb',
  admin: '#7c3aed',
};

const DEFAULT_HEADER_GRADIENT = ['#6366f1', '#8b5cf6', '#d946ef', '#fb7185'] as const;
const DEFAULT_PRIMARY_GRADIENT = ['#dc2626', '#ef4444', '#f87171'] as const;

export const HAMBURGER_THEME_PRESET_META: {
  id: StaffHamburgerThemePreset;
  labelTr: string;
  descriptionTr: string;
}[] = [
  { id: 'default', labelTr: 'Varsayılan', descriptionTr: 'Mor-indigo gradient, liste düzeni' },
  { id: 'indigo', labelTr: 'İndigo', descriptionTr: 'Canlı mor-mavi tonlar' },
  { id: 'emerald', labelTr: 'Zümrüt', descriptionTr: 'Yeşil-teal otel hissi' },
  { id: 'rose', labelTr: 'Gül', descriptionTr: 'Sıcak pembe-kırmızı vurgu' },
  { id: 'slate', labelTr: 'Kurumsal', descriptionTr: 'Lacivert-solid header, sade' },
  { id: 'amber', labelTr: 'Altın', descriptionTr: 'Otel altın vurgusu' },
  { id: 'night', labelTr: 'Gece', descriptionTr: 'Koyu drawer ve kartlar' },
  { id: 'minimal', labelTr: 'Minimal', descriptionTr: 'Sade header, kompakt liste' },
  { id: 'grid', labelTr: 'Izgara', descriptionTr: 'İkonlu 2 sütun karo düzeni' },
];

export const HAMBURGER_THEME_PRESETS: Record<StaffHamburgerThemePreset, Partial<StaffHamburgerThemeConfig>> = {
  default: {},
  indigo: {
    headerGradient: ['#6366f1', '#8b5cf6', '#a855f7'],
    backdropColor: 'rgba(88,28,135,0.32)',
    primaryButtonGradient: ['#6366f1', '#818cf8', '#a5b4fc'],
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#6366f1', ops: '#4f46e5' },
  },
  emerald: {
    headerGradient: ['#047857', '#0d9488', '#14b8a6'],
    backdropColor: 'rgba(4,120,87,0.28)',
    primaryButtonGradient: ['#047857', '#10b981', '#34d399'],
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#0d9488', hotel: '#059669', ops: '#0284c7' },
  },
  rose: {
    headerGradient: ['#be123c', '#e11d48', '#fb7185'],
    backdropColor: 'rgba(190,18,60,0.26)',
    primaryButtonGradient: ['#be123c', '#f43f5e', '#fb7185'],
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#e11d48', staff: '#f97316' },
  },
  slate: {
    headerStyle: 'solid',
    headerSolidColor: '#0f172a',
    drawerBackground: '#f8fafc',
    backdropColor: 'rgba(15,23,42,0.45)',
    primaryButtonColor: '#0f172a',
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#334155', admin: '#475569' },
  },
  amber: {
    headerGradient: ['#b45309', '#d97706', '#f59e0b'],
    backdropColor: 'rgba(180,83,9,0.28)',
    primaryButtonGradient: ['#b45309', '#d97706', '#fbbf24'],
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#d97706', hotel: '#0d9488', fnb: '#ea580c' },
  },
  night: {
    headerStyle: 'solid',
    headerSolidColor: '#1e293b',
    drawerBackground: '#0f172a',
    cardBackground: '#1e293b',
    cardBorder: '#334155',
    textColor: '#f1f5f9',
    mutedTextColor: '#94a3b8',
    backdropColor: 'rgba(0,0,0,0.55)',
    primaryButtonColor: '#dc2626',
    sectionColors: { ...DEFAULT_SECTION_COLORS, nav: '#818cf8', ops: '#60a5fa' },
  },
  minimal: {
    headerStyle: 'minimal',
    layoutMode: 'compact',
    itemStyle: 'list',
    showHubCards: false,
    headerSolidColor: '#f8fafc',
    drawerBackground: '#ffffff',
    textColor: '#0f172a',
  },
  grid: {
    layoutMode: 'grid',
    itemStyle: 'grid',
    headerGradient: ['#2563eb', '#7c3aed'],
    backdropColor: 'rgba(37,99,235,0.25)',
  },
};

export function normalizeHamburgerHexColor(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX.test(withHash) ? withHash.toLowerCase() : null;
}

function pickColor(raw: string | null | undefined, fallback: string): string {
  return normalizeHamburgerHexColor(raw) ?? fallback;
}

function normalizeStringArray(raw: unknown, max = 4): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => normalizeHamburgerHexColor(x) ?? x.trim())
    .filter((x) => x.length > 0)
    .slice(0, max);
  return out.length ? out : undefined;
}

function normalizeStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== 'string') continue;
    const color = normalizeHamburgerHexColor(v);
    if (color) out[k] = color;
    else if (v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : undefined;
}

function isPreset(v: string): v is StaffHamburgerThemePreset {
  return HAMBURGER_THEME_PRESET_META.some((p) => p.id === v);
}

function isLayoutMode(v: string): v is StaffHamburgerLayoutMode {
  return v === 'classic' || v === 'compact' || v === 'grid';
}

function isHeaderStyle(v: string): v is StaffHamburgerHeaderStyle {
  return v === 'gradient' || v === 'solid' || v === 'minimal';
}

function isItemStyle(v: string): v is StaffHamburgerItemStyle {
  return v === 'list' || v === 'grid' || v === 'pill';
}

export function normalizeStaffHamburgerTheme(raw: unknown): StaffHamburgerThemeConfig | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const preset = typeof o.preset === 'string' && isPreset(o.preset) ? o.preset : undefined;
  const layoutMode = typeof o.layoutMode === 'string' && isLayoutMode(o.layoutMode) ? o.layoutMode : undefined;
  const headerStyle = typeof o.headerStyle === 'string' && isHeaderStyle(o.headerStyle) ? o.headerStyle : undefined;
  const itemStyle = typeof o.itemStyle === 'string' && isItemStyle(o.itemStyle) ? o.itemStyle : undefined;

  const theme: StaffHamburgerThemeConfig = {
    preset,
    layoutMode,
    headerStyle,
    itemStyle,
    headerGradient: normalizeStringArray(o.headerGradient),
    headerSolidColor: normalizeHamburgerHexColor(o.headerSolidColor as string) ?? undefined,
    drawerBackground: normalizeHamburgerHexColor(o.drawerBackground as string) ?? undefined,
    backdropColor: typeof o.backdropColor === 'string' && o.backdropColor.trim() ? o.backdropColor.trim() : undefined,
    primaryButtonColor: normalizeHamburgerHexColor(o.primaryButtonColor as string) ?? undefined,
    primaryButtonGradient: normalizeStringArray(o.primaryButtonGradient, 3),
    cardBackground: normalizeHamburgerHexColor(o.cardBackground as string) ?? undefined,
    cardBorder: normalizeHamburgerHexColor(o.cardBorder as string) ?? undefined,
    textColor: normalizeHamburgerHexColor(o.textColor as string) ?? undefined,
    mutedTextColor: normalizeHamburgerHexColor(o.mutedTextColor as string) ?? undefined,
    chevronColor: normalizeHamburgerHexColor(o.chevronColor as string) ?? undefined,
    sectionColors: normalizeStringRecord(o.sectionColors),
    itemAccents: normalizeStringRecord(o.itemAccents),
    sectionTitles: normalizeStringRecord(o.sectionTitles),
    showSearch: typeof o.showSearch === 'boolean' ? o.showSearch : undefined,
    showRecentFlyout: typeof o.showRecentFlyout === 'boolean' ? o.showRecentFlyout : undefined,
    showHubCards: typeof o.showHubCards === 'boolean' ? o.showHubCards : undefined,
    showSectionIcons: typeof o.showSectionIcons === 'boolean' ? o.showSectionIcons : undefined,
    showSectionLabels: typeof o.showSectionLabels === 'boolean' ? o.showSectionLabels : undefined,
    searchMinItems: typeof o.searchMinItems === 'number' && o.searchMinItems >= 0 ? Math.floor(o.searchMinItems) : undefined,
    drawerBorderRadius:
      typeof o.drawerBorderRadius === 'number' && o.drawerBorderRadius >= 0
        ? Math.min(40, Math.floor(o.drawerBorderRadius))
        : undefined,
  };

  const hasValue = Object.values(theme).some((v) => v !== undefined);
  return hasValue ? theme : undefined;
}

export function hamburgerThemeColorErrors(theme: StaffHamburgerThemeConfig): string[] {
  const errors: string[] = [];
  const check = (val: string | null | undefined, label: string) => {
    if (val?.trim() && !normalizeHamburgerHexColor(val) && !val.includes('rgba')) {
      errors.push(`${label} geçersiz`);
    }
  };
  check(theme.headerSolidColor, 'Header rengi');
  check(theme.drawerBackground, 'Drawer arka plan');
  check(theme.primaryButtonColor, 'Birincil buton rengi');
  check(theme.cardBackground, 'Kart arka plan');
  check(theme.textColor, 'Metin rengi');
  for (const c of theme.headerGradient ?? []) check(c, 'Header gradient');
  for (const c of theme.primaryButtonGradient ?? []) check(c, 'Birincil buton gradient');
  for (const c of Object.values(theme.sectionColors ?? {})) check(c, 'Bölüm rengi');
  return errors;
}

const FALLBACK_RESOLVED_THEME: ResolvedStaffHamburgerTheme = {
  preset: 'default',
  layoutMode: 'classic',
  headerStyle: 'gradient',
  itemStyle: 'list',
  headerGradient: ['#6366f1', '#8b5cf6', '#d946ef', '#fb7185'],
  headerSolidColor: '#0f172a',
  drawerBackground: null,
  backdropColor: 'rgba(88,28,135,0.28)',
  primaryButtonColor: '#dc2626',
  primaryButtonGradient: ['#dc2626', '#ef4444', '#f87171'],
  cardBackground: null,
  cardBorder: null,
  textColor: null,
  mutedTextColor: null,
  chevronColor: null,
  sectionColors: {
    fnb: '#ea580c',
    kitchen: '#ea580c',
    nav: '#6366f1',
    staff: '#ea580c',
    hotel: '#0d9488',
    payments: '#635bff',
    ops: '#2563eb',
    admin: '#7c3aed',
  },
  itemAccents: {},
  sectionTitles: {},
  showSearch: true,
  showRecentFlyout: true,
  showHubCards: true,
  showSectionIcons: true,
  showSectionLabels: true,
  searchMinItems: 6,
  drawerBorderRadius: 26,
};

let cachedDefaultResolvedTheme: ResolvedStaffHamburgerTheme | null = null;

/** Stable fallback when config is missing or module init is mid-cycle (Fast Refresh). */
export function getDefaultResolvedStaffHamburgerTheme(): ResolvedStaffHamburgerTheme {
  if (cachedDefaultResolvedTheme) return cachedDefaultResolvedTheme;
  try {
    cachedDefaultResolvedTheme = resolveStaffHamburgerTheme(null);
    if (
      !cachedDefaultResolvedTheme?.headerGradient?.length ||
      !cachedDefaultResolvedTheme?.primaryButtonGradient?.length
    ) {
      cachedDefaultResolvedTheme = FALLBACK_RESOLVED_THEME;
    }
  } catch {
    cachedDefaultResolvedTheme = FALLBACK_RESOLVED_THEME;
  }
  return cachedDefaultResolvedTheme;
}

export function isResolvedStaffHamburgerTheme(
  theme: ResolvedStaffHamburgerTheme | StaffHamburgerThemeConfig | null | undefined
): theme is ResolvedStaffHamburgerTheme {
  return (
    !!theme &&
    typeof (theme as ResolvedStaffHamburgerTheme).headerStyle === 'string' &&
    Array.isArray((theme as ResolvedStaffHamburgerTheme).headerGradient) &&
    Array.isArray((theme as ResolvedStaffHamburgerTheme).primaryButtonGradient) &&
    typeof (theme as ResolvedStaffHamburgerTheme).showSearch === 'boolean'
  );
}

export function resolveStaffHamburgerTheme(raw: StaffHamburgerThemeConfig | null | undefined): ResolvedStaffHamburgerTheme {
  const presetId = raw?.preset && isPreset(raw.preset) ? raw.preset : 'default';
  const preset = HAMBURGER_THEME_PRESETS[presetId] ?? {};
  const merged: StaffHamburgerThemeConfig = { ...preset, ...raw, preset: presetId };

  const layoutMode =
    merged.layoutMode ??
    (presetId === 'grid' ? 'grid' : presetId === 'minimal' ? 'compact' : 'classic');
  const itemStyle =
    merged.itemStyle ?? (layoutMode === 'grid' ? 'grid' : presetId === 'minimal' ? 'list' : 'list');

  const sectionColors = { ...DEFAULT_SECTION_COLORS, ...(preset.sectionColors ?? {}), ...(merged.sectionColors ?? {}) };

  return {
    preset: presetId,
    layoutMode,
    headerStyle: merged.headerStyle ?? preset.headerStyle ?? 'gradient',
    itemStyle,
    headerGradient: (merged.headerGradient?.length
      ? merged.headerGradient
      : preset.headerGradient?.length
        ? preset.headerGradient
        : DEFAULT_HEADER_GRADIENT) as readonly string[],
    headerSolidColor: pickColor(merged.headerSolidColor ?? preset.headerSolidColor, '#0f172a'),
    drawerBackground: merged.drawerBackground ?? preset.drawerBackground ?? null,
    backdropColor:
      merged.backdropColor ?? preset.backdropColor ?? (presetId === 'night' ? 'rgba(0,0,0,0.55)' : 'rgba(88,28,135,0.28)'),
    primaryButtonColor: pickColor(merged.primaryButtonColor ?? preset.primaryButtonColor, '#dc2626'),
    primaryButtonGradient: (merged.primaryButtonGradient?.length
      ? merged.primaryButtonGradient
      : preset.primaryButtonGradient?.length
        ? preset.primaryButtonGradient
        : DEFAULT_PRIMARY_GRADIENT) as readonly string[],
    cardBackground: merged.cardBackground ?? preset.cardBackground ?? null,
    cardBorder: merged.cardBorder ?? preset.cardBorder ?? null,
    textColor: merged.textColor ?? preset.textColor ?? null,
    mutedTextColor: merged.mutedTextColor ?? preset.mutedTextColor ?? null,
    chevronColor: merged.chevronColor ?? preset.chevronColor ?? null,
    sectionColors,
    itemAccents: { ...(merged.itemAccents ?? {}) },
    sectionTitles: { ...(merged.sectionTitles ?? {}) },
    showSearch: merged.showSearch ?? true,
    showRecentFlyout: merged.showRecentFlyout ?? true,
    showHubCards: merged.showHubCards ?? preset.showHubCards ?? true,
    showSectionIcons: merged.showSectionIcons ?? true,
    showSectionLabels: merged.showSectionLabels ?? true,
    searchMinItems: merged.searchMinItems ?? 6,
    drawerBorderRadius: merged.drawerBorderRadius ?? 26,
  };
}

export function coalesceStaffHamburgerTheme(
  theme: ResolvedStaffHamburgerTheme | StaffHamburgerThemeConfig | null | undefined
): ResolvedStaffHamburgerTheme {
  if (isResolvedStaffHamburgerTheme(theme)) return theme;
  try {
    const resolved = resolveStaffHamburgerTheme(theme ?? null);
    if (!resolved?.headerGradient?.length || !resolved?.primaryButtonGradient?.length) {
      return getDefaultResolvedStaffHamburgerTheme();
    }
    return resolved;
  } catch {
    return getDefaultResolvedStaffHamburgerTheme();
  }
}

export function resolveMenuItemAccent(itemId: string, defaultAccent: string, theme: ResolvedStaffHamburgerTheme): string {
  return theme.itemAccents[itemId] ?? defaultAccent;
}

export function resolveMenuSectionColor(sectionId: StaffHamburgerMenuSectionId, theme: ResolvedStaffHamburgerTheme): string {
  return theme.sectionColors[sectionId] ?? DEFAULT_SECTION_COLORS[sectionId];
}

export function applyStaffHamburgerSectionTitles<T extends { id: string; title: string }>(
  sections: T[],
  theme: StaffHamburgerThemeConfig | null | undefined
): T[] {
  const titles = theme?.sectionTitles;
  if (!titles || !Object.keys(titles).length) return sections;
  return sections.map((s) => ({
    ...s,
    title: titles[s.id]?.trim() || s.title,
  }));
}

export function themeToPayload(theme: StaffHamburgerThemeConfig): StaffHamburgerThemeConfig {
  const out: StaffHamburgerThemeConfig = {};
  if (theme.preset && theme.preset !== 'default') out.preset = theme.preset;
  if (theme.layoutMode && theme.layoutMode !== 'classic') out.layoutMode = theme.layoutMode;
  if (theme.headerStyle && theme.headerStyle !== 'gradient') out.headerStyle = theme.headerStyle;
  if (theme.itemStyle && theme.itemStyle !== 'list') out.itemStyle = theme.itemStyle;
  const assignColor = (key: keyof StaffHamburgerThemeConfig, val?: string | null) => {
    const n = normalizeHamburgerHexColor(val ?? undefined);
    if (n) (out as Record<string, unknown>)[key] = n;
  };
  assignColor('headerSolidColor', theme.headerSolidColor);
  assignColor('drawerBackground', theme.drawerBackground);
  assignColor('primaryButtonColor', theme.primaryButtonColor);
  assignColor('cardBackground', theme.cardBackground);
  assignColor('cardBorder', theme.cardBorder);
  assignColor('textColor', theme.textColor);
  assignColor('mutedTextColor', theme.mutedTextColor);
  assignColor('chevronColor', theme.chevronColor);
  if (theme.backdropColor?.trim()) out.backdropColor = theme.backdropColor.trim();
  if (theme.headerGradient?.length) {
    out.headerGradient = theme.headerGradient.map((c) => normalizeHamburgerHexColor(c) ?? c).filter(Boolean);
  }
  if (theme.primaryButtonGradient?.length) {
    out.primaryButtonGradient = theme.primaryButtonGradient.map((c) => normalizeHamburgerHexColor(c) ?? c).filter(Boolean);
  }
  if (theme.sectionColors && Object.keys(theme.sectionColors).length) out.sectionColors = theme.sectionColors;
  if (theme.itemAccents && Object.keys(theme.itemAccents).length) out.itemAccents = theme.itemAccents;
  if (theme.sectionTitles && Object.keys(theme.sectionTitles).length) out.sectionTitles = theme.sectionTitles;
  if (theme.showSearch === false) out.showSearch = false;
  if (theme.showRecentFlyout === false) out.showRecentFlyout = false;
  if (theme.showHubCards === false) out.showHubCards = false;
  if (theme.showSectionIcons === false) out.showSectionIcons = false;
  if (theme.showSectionLabels === false) out.showSectionLabels = false;
  if (theme.searchMinItems != null && theme.searchMinItems !== 6) out.searchMinItems = theme.searchMinItems;
  if (theme.drawerBorderRadius != null && theme.drawerBorderRadius !== 26) out.drawerBorderRadius = theme.drawerBorderRadius;
  return out;
}

export function defaultStaffHamburgerTheme(): StaffHamburgerThemeConfig {
  return { preset: 'default' };
}
