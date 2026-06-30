import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { DEFAULT_KITCHEN_MENU_LAYOUT } from '@/lib/kitchenMenuThemePresets';
import {
  DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS,
  kitchenMenuCheckoutFieldsToPayload,
  parseKitchenMenuCheckoutFields,
  type KitchenMenuCheckoutFields,
} from '@/lib/kitchenMenuCheckoutFields';

export type { KitchenMenuCheckoutFields, CheckoutFieldMode } from '@/lib/kitchenMenuCheckoutFields';

export type KitchenMenuLayoutMode = 'classic' | 'compact' | 'featured';

export type KitchenMenuLandingMode = 'hero' | 'explore';

export type KitchenMenuPublicTheme = {
  heroTitle?: string | null;
  heroSubtitle?: string | null;
  primaryColor?: string | null;
  navyColor?: string | null;
  accentLightColor?: string | null;
  layout?: KitchenMenuLayoutMode | null;
  heroImageUrl?: string | null;
  landingMode?: KitchenMenuLandingMode | null;
  checkoutFields?: KitchenMenuCheckoutFields | null;
};

export type ResolvedKitchenMenuTheme = {
  heroTitle: string | null;
  heroSubtitle: string | null;
  primaryColor: string;
  navyColor: string;
  accentLightColor: string;
  layout: KitchenMenuLayoutMode;
  heroImageUrl: string | null;
  landingMode: KitchenMenuLandingMode;
  checkoutFields: KitchenMenuCheckoutFields;
  webHeroGradient: readonly [string, string, string, string];
  webHeroGlow: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** #RRGGBB — başında # yoksa ekler; geçersizse null */
export function normalizeKitchenMenuHexColor(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const withHash = v.startsWith('#') ? v : `#${v}`;
  return HEX.test(withHash) ? withHash.toLowerCase() : null;
}

export function isKitchenMenuHexColor(raw: string | null | undefined): boolean {
  return normalizeKitchenMenuHexColor(raw) !== null;
}

function pickColor(raw: string | null | undefined, fallback: string): string {
  return normalizeKitchenMenuHexColor(raw) ?? fallback;
}

export function parseKitchenMenuPublicTheme(raw: unknown): KitchenMenuPublicTheme {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const o = raw as Record<string, unknown>;
  const layout = o.layout;
  return {
    heroTitle: typeof o.heroTitle === 'string' ? o.heroTitle : null,
    heroSubtitle: typeof o.heroSubtitle === 'string' ? o.heroSubtitle : null,
    primaryColor: typeof o.primaryColor === 'string' ? o.primaryColor : null,
    navyColor: typeof o.navyColor === 'string' ? o.navyColor : null,
    accentLightColor: typeof o.accentLightColor === 'string' ? o.accentLightColor : null,
    layout:
      layout === 'classic' || layout === 'compact' || layout === 'featured'
        ? layout
        : null,
    heroImageUrl: typeof o.heroImageUrl === 'string' ? o.heroImageUrl : null,
    landingMode: o.landingMode === 'hero' || o.landingMode === 'explore' ? o.landingMode : null,
    checkoutFields: parseKitchenMenuCheckoutFields(o.checkoutFields),
  };
}

export function resolveKitchenMenuTheme(
  raw: unknown,
  defaults?: { heroTitle?: string; heroSubtitle?: string }
): ResolvedKitchenMenuTheme {
  const theme = parseKitchenMenuPublicTheme(raw);
  const navy = pickColor(theme.navyColor, menuUi.navy);
  const primary = pickColor(theme.primaryColor, menuUi.accent);
  const accentLight = pickColor(theme.accentLightColor, menuUi.accentLight);
  const navyMid = blendHex(navy, '#ffffff', 0.22);
  const navySoft = blendHex(navy, '#ffffff', 0.35);

  return {
    heroTitle: theme.heroTitle?.trim() || defaults?.heroTitle || null,
    heroSubtitle: theme.heroSubtitle?.trim() || defaults?.heroSubtitle || null,
    primaryColor: primary,
    navyColor: navy,
    accentLightColor: accentLight,
    layout: theme.layout ?? DEFAULT_KITCHEN_MENU_LAYOUT,
    heroImageUrl: theme.heroImageUrl?.trim() || null,
    landingMode: theme.landingMode === 'explore' ? 'explore' : 'hero',
    checkoutFields: theme.checkoutFields ?? { ...DEFAULT_KITCHEN_MENU_CHECKOUT_FIELDS },
    webHeroGradient: [blendHex(navy, '#000000', 0.35), navy, navyMid, navySoft] as const,
    webHeroGlow: hexToRgba(primary, 0.18),
  };
}

export function kitchenMenuThemeToPayload(theme: KitchenMenuPublicTheme): KitchenMenuPublicTheme {
  const out: KitchenMenuPublicTheme = {};
  if (theme.heroTitle?.trim()) out.heroTitle = theme.heroTitle.trim();
  if (theme.heroSubtitle?.trim()) out.heroSubtitle = theme.heroSubtitle.trim();
  const primary = normalizeKitchenMenuHexColor(theme.primaryColor);
  const navy = normalizeKitchenMenuHexColor(theme.navyColor);
  const accentLight = normalizeKitchenMenuHexColor(theme.accentLightColor);
  if (primary) out.primaryColor = primary;
  if (navy) out.navyColor = navy;
  if (accentLight) out.accentLightColor = accentLight;
  if (theme.layout) out.layout = theme.layout;
  if (theme.heroImageUrl?.trim()) out.heroImageUrl = theme.heroImageUrl.trim();
  if (theme.landingMode) out.landingMode = theme.landingMode;
  if (theme.checkoutFields) out.checkoutFields = kitchenMenuCheckoutFieldsToPayload(theme.checkoutFields);
  return out;
}

/** Kaydetmeden önce kullanıcıya gösterilecek renk doğrulama mesajları */
export function kitchenMenuThemeColorErrors(theme: KitchenMenuPublicTheme): string[] {
  const errors: string[] = [];
  if (theme.primaryColor?.trim() && !normalizeKitchenMenuHexColor(theme.primaryColor)) {
    errors.push('Vurgu rengi geçersiz (#RRGGBB, örn. #D4A84B)');
  }
  if (theme.navyColor?.trim() && !normalizeKitchenMenuHexColor(theme.navyColor)) {
    errors.push('Ana lacivert geçersiz (#RRGGBB, örn. #1a365d)');
  }
  if (theme.accentLightColor?.trim() && !normalizeKitchenMenuHexColor(theme.accentLightColor)) {
    errors.push('Açık vurgu rengi geçersiz (#RRGGBB)');
  }
  return errors;
}

function blendHex(a: string, b: string, t: number): string {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(212, 168, 75, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
