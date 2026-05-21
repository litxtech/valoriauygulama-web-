import type { QRDesign, QRFrameStyle } from '@/components/DesignableQR';

export type QrHubPreset = {
  id: string;
  name: string;
  tag: string;
  design: QRDesign;
  frame: QRFrameStyle;
  /** Kart şeridi + footer gradient */
  swatch: [string, string];
  /** QR alanı hafif arka plan */
  surface: string;
};

const base = (partial: QRDesign): QRDesign => ({
  useLogo: false,
  shape: 'rounded',
  quietZone: 12,
  ecl: 'M',
  ...partial,
});

/** Tatlı / pastel + kurumsal QR renk şablonları */
export const QR_HUB_PRESETS: QrHubPreset[] = [
  {
    id: 'valoria-classic',
    name: 'Valoria',
    tag: 'Kurumsal',
    swatch: ['#1e3a5f', '#2dd4bf'],
    surface: '#f8fafc',
    frame: 'modern',
    design: base({ backgroundColor: '#FFFFFF', foregroundColor: '#1a365d', gradient: { from: '#1a365d', to: '#14b8a6' } }),
  },
  {
    id: 'peach-cream',
    name: 'Şeftali Krem',
    tag: 'Tatlı',
    swatch: ['#fb923c', '#fecdd3'],
    surface: '#fff7ed',
    frame: 'elegant',
    design: base({ backgroundColor: '#FFFBEB', foregroundColor: '#c2410c', gradient: { from: '#f97316', to: '#fda4af' } }),
  },
  {
    id: 'mint-menu',
    name: 'Nane Şeker',
    tag: 'Taze',
    swatch: ['#34d399', '#a7f3d0'],
    surface: '#ecfdf5',
    frame: 'modern',
    design: base({ backgroundColor: '#F0FDF4', foregroundColor: '#047857', gradient: { from: '#10b981', to: '#6ee7b7' } }),
  },
  {
    id: 'lavender-milk',
    name: 'Lavanta Süt',
    tag: 'Yumuşak',
    swatch: ['#a78bfa', '#e9d5ff'],
    surface: '#faf5ff',
    frame: 'elegant',
    design: base({ backgroundColor: '#FAF5FF', foregroundColor: '#6d28d9', gradient: { from: '#8b5cf6', to: '#d8b4fe' } }),
  },
  {
    id: 'sky-cotton',
    name: 'Gökyüzü Pamuk',
    tag: 'Serin',
    swatch: ['#38bdf8', '#bae6fd'],
    surface: '#f0f9ff',
    frame: 'modern',
    design: base({ backgroundColor: '#F0F9FF', foregroundColor: '#0369a1', gradient: { from: '#0ea5e9', to: '#7dd3fc' } }),
  },
  {
    id: 'rose-macaron',
    name: 'Gül Makaron',
    tag: 'Tatlı',
    swatch: ['#f472b6', '#fbcfe8'],
    surface: '#fdf2f8',
    frame: 'elegant',
    design: base({ backgroundColor: '#FFF1F2', foregroundColor: '#be185d', gradient: { from: '#ec4899', to: '#f9a8d4' } }),
  },
  {
    id: 'honey-gold',
    name: 'Bal Altın',
    tag: 'Premium',
    swatch: ['#f59e0b', '#fde68a'],
    surface: '#fffbeb',
    frame: 'bordered',
    design: base({ backgroundColor: '#FFFBEB', foregroundColor: '#92400e', gradient: { from: '#d97706', to: '#fcd34d' } }),
  },
  {
    id: 'berry-sorbet',
    name: 'Orman Meyvesi',
    tag: 'Canlı',
    swatch: ['#c026d3', '#f0abfc'],
    surface: '#fdf4ff',
    frame: 'modern',
    design: base({ backgroundColor: '#FDF4FF', foregroundColor: '#86198f', gradient: { from: '#a21caf', to: '#e879f9' } }),
  },
  {
    id: 'aqua-candy',
    name: 'Akuamarin',
    tag: 'Tatlı',
    swatch: ['#22d3ee', '#99f6e4'],
    surface: '#ecfeff',
    frame: 'modern',
    design: base({ backgroundColor: '#ECFEFF', foregroundColor: '#0e7490', gradient: { from: '#06b6d4', to: '#5eead4' } }),
  },
  {
    id: 'coral-blush',
    name: 'Mercan Allık',
    tag: 'Sıcak',
    swatch: ['#fb7185', '#fecaca'],
    surface: '#fff1f2',
    frame: 'elegant',
    design: base({ backgroundColor: '#FFF1F2', foregroundColor: '#e11d48', gradient: { from: '#f43f5e', to: '#fda4af' } }),
  },
  {
    id: 'lilac-dream',
    name: 'Leylak Rüya',
    tag: 'Pastel',
    swatch: ['#818cf8', '#c7d2fe'],
    surface: '#eef2ff',
    frame: 'elegant',
    design: base({ backgroundColor: '#EEF2FF', foregroundColor: '#4338ca', gradient: { from: '#6366f1', to: '#a5b4fc' } }),
  },
  {
    id: 'sage-olive',
    name: 'Adaçayı',
    tag: 'Doğal',
    swatch: ['#65a30d', '#bef264'],
    surface: '#f7fee7',
    frame: 'modern',
    design: base({ backgroundColor: '#F7FEE7', foregroundColor: '#3f6212', gradient: { from: '#65a30d', to: '#a3e635' } }),
  },
  {
    id: 'contract-indigo',
    name: 'İndigo Resmi',
    tag: 'Resmi',
    swatch: ['#4f46e5', '#a5b4fc'],
    surface: '#ffffff',
    frame: 'bordered',
    design: base({ backgroundColor: '#FFFFFF', foregroundColor: '#312e81', gradient: { from: '#4338ca', to: '#818cf8' } }),
  },
  {
    id: 'maliye-teal',
    name: 'Teal Güven',
    tag: 'Maliye',
    swatch: ['#0d9488', '#99f6e4'],
    surface: '#f0fdfa',
    frame: 'modern',
    design: base({ backgroundColor: '#F0FDFA', foregroundColor: '#115e59', gradient: { from: '#0f766e', to: '#2dd4bf' } }),
  },
  {
    id: 'sunset-sorbet',
    name: 'Gün Batımı',
    tag: 'Tatlı',
    swatch: ['#f97316', '#fde047'],
    surface: '#fff7ed',
    frame: 'modern',
    design: base({ backgroundColor: '#FFFBEB', foregroundColor: '#c2410c', gradient: { from: '#ea580c', to: '#facc15' } }),
  },
  {
    id: 'blueberry-milk',
    name: 'Yaban Mersini',
    tag: 'Pastel',
    swatch: ['#3b82f6', '#bfdbfe'],
    surface: '#eff6ff',
    frame: 'elegant',
    design: base({ backgroundColor: '#EFF6FF', foregroundColor: '#1d4ed8', gradient: { from: '#2563eb', to: '#93c5fd' } }),
  },
];

export const DEFAULT_QR_HUB_PRESET_ID = 'valoria-classic';

export function getQrHubPreset(id: string): QrHubPreset {
  return QR_HUB_PRESETS.find((p) => p.id === id) ?? QR_HUB_PRESETS[0]!;
}

export function defaultPresetIdForHubVariant(variant?: 'menu' | 'contract' | 'maliye' | 'general'): string {
  if (variant === 'menu') return 'mint-menu';
  if (variant === 'contract') return 'contract-indigo';
  if (variant === 'maliye') return 'maliye-teal';
  return DEFAULT_QR_HUB_PRESET_ID;
}
