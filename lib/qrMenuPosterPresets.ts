import type { QRDesign } from '@/components/DesignableQR';

export type QrMenuPosterLayout =
  | 'signature'
  | 'obsidian-gold'
  | 'floating-luxe'
  | 'arcadia'
  | 'table-stand'
  | 'boutique'
  | 'nordic'
  | 'midnight-glow';

export type QrMenuPosterTier = 'premium' | 'modern' | 'classic';

export type QrMenuPosterPreset = {
  id: string;
  name: string;
  tag: string;
  tier: QrMenuPosterTier;
  layout: QrMenuPosterLayout;
  design: QRDesign;
  accent: [string, string];
  surface: string;
  ink?: string;
};

const base = (partial: QRDesign): QRDesign => ({
  useLogo: false,
  shape: 'rounded',
  quietZone: 10,
  ecl: 'H',
  ...partial,
});

export const QR_MENU_POSTER_TIERS: { id: QrMenuPosterTier; labelKey: string }[] = [
  { id: 'premium', labelKey: 'qrMenuPosterTierPremium' },
  { id: 'modern', labelKey: 'qrMenuPosterTierModern' },
  { id: 'classic', labelKey: 'qrMenuPosterTierClassic' },
];

/** Otel web menüsü — üst düzey poster + QR renk kombinasyonları */
export const QR_MENU_POSTER_PRESETS: QrMenuPosterPreset[] = [
  {
    id: 'menu-obsidian-gold',
    name: 'Obsidyen Altın',
    tag: 'Premium',
    tier: 'premium',
    layout: 'obsidian-gold',
    accent: ['#0f172a', '#d4af37'],
    surface: '#1e293b',
    ink: '#f8fafc',
    design: base({
      shape: 'dots',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#0f172a',
      gradient: { from: '#1e293b', to: '#0f172a' },
    }),
  },
  {
    id: 'menu-boutique-cream',
    name: 'Butik Krem',
    tag: 'Lüks',
    tier: 'premium',
    layout: 'boutique',
    accent: ['#92400e', '#fde68a'],
    surface: '#faf8f5',
    ink: '#292524',
    design: base({
      shape: 'rounded',
      backgroundColor: '#FFFCF7',
      foregroundColor: '#78350f',
      gradient: { from: '#b45309', to: '#d97706' },
    }),
  },
  {
    id: 'menu-midnight-teal',
    name: 'Gece Işığı',
    tag: 'Premium',
    tier: 'premium',
    layout: 'midnight-glow',
    accent: ['#0f172a', '#2dd4bf'],
    surface: '#0b1220',
    ink: '#e2e8f0',
    design: base({
      shape: 'dots',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#0f766e',
      gradient: { from: '#0d9488', to: '#2dd4bf' },
    }),
  },
  {
    id: 'menu-arcadia-rose',
    name: 'Arcadia Gül',
    tag: 'Premium',
    tier: 'premium',
    layout: 'arcadia',
    accent: ['#be185d', '#fda4af'],
    surface: '#fff1f2',
    ink: '#ffffff',
    design: base({
      shape: 'rounded',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#9d174d',
      gradient: { from: '#db2777', to: '#f472b6' },
    }),
  },
  {
    id: 'menu-floating-slate',
    name: 'Yüzen Kart',
    tag: 'Modern',
    tier: 'modern',
    layout: 'floating-luxe',
    accent: ['#1e3a5f', '#64748b'],
    surface: '#ffffff',
    ink: '#0f172a',
    design: base({
      shape: 'dots',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#1e293b',
      gradient: { from: '#334155', to: '#0f172a' },
    }),
  },
  {
    id: 'menu-nordic-minimal',
    name: 'Nordik Minimal',
    tag: 'Modern',
    tier: 'modern',
    layout: 'nordic',
    accent: ['#e2e8f0', '#94a3b8'],
    surface: '#ffffff',
    ink: '#0f172a',
    design: base({
      shape: 'square',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#0f172a',
      quietZone: 14,
    }),
  },
  {
    id: 'menu-arcadia-ocean',
    name: 'Okyanus Cam',
    tag: 'Modern',
    tier: 'modern',
    layout: 'arcadia',
    accent: ['#0369a1', '#38bdf8'],
    surface: '#f0f9ff',
    ink: '#ffffff',
    design: base({
      shape: 'dots',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#075985',
      gradient: { from: '#0284c7', to: '#38bdf8' },
    }),
  },
  {
    id: 'menu-signature-valoria',
    name: 'Valoria İmza',
    tag: 'Klasik',
    tier: 'classic',
    layout: 'signature',
    accent: ['#1e3a5f', '#2dd4bf'],
    surface: '#f8fafc',
    ink: '#ffffff',
    design: base({
      backgroundColor: '#FFFFFF',
      foregroundColor: '#1a365d',
      gradient: { from: '#1a365d', to: '#14b8a6' },
    }),
  },
  {
    id: 'menu-table-stand-gold',
    name: 'Masa Standı',
    tag: 'Masa',
    tier: 'classic',
    layout: 'table-stand',
    accent: ['#1a365d', '#c9a227'],
    surface: '#fffbeb',
    ink: '#1a365d',
    design: base({
      backgroundColor: '#FFFFFF',
      foregroundColor: '#1a365d',
      gradient: { from: '#1e3a5f', to: '#c9a227' },
      ecl: 'H',
    }),
  },
  {
    id: 'menu-signature-mint',
    name: 'Nane Şeker',
    tag: 'Klasik',
    tier: 'classic',
    layout: 'signature',
    accent: ['#34d399', '#a7f3d0'],
    surface: '#ecfdf5',
    ink: '#ffffff',
    design: base({
      backgroundColor: '#F0FDF4',
      foregroundColor: '#047857',
      gradient: { from: '#10b981', to: '#6ee7b7' },
    }),
  },
];

export const DEFAULT_QR_MENU_POSTER_PRESET_ID = 'menu-obsidian-gold';

export function getQrMenuPosterPreset(id: string): QrMenuPosterPreset {
  return QR_MENU_POSTER_PRESETS.find((p) => p.id === id) ?? QR_MENU_POSTER_PRESETS[0]!;
}

export function qrMenuPosterPresetsForTier(tier: QrMenuPosterTier): QrMenuPosterPreset[] {
  return QR_MENU_POSTER_PRESETS.filter((p) => p.tier === tier);
}
