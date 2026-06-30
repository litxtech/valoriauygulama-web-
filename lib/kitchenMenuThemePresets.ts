import type { KitchenMenuLayoutMode, KitchenMenuPublicTheme } from '@/lib/kitchenMenuTheme';

export type KitchenMenuThemePreset = {
  id: string;
  name: string;
  tag: string;
  theme: KitchenMenuPublicTheme;
};

/** Web menü — tek dokunuşla modern görünüm şablonları */
export const KITCHEN_MENU_THEME_PRESETS: KitchenMenuThemePreset[] = [
  {
    id: 'midnight-gold',
    name: 'Gece Altın',
    tag: 'Önerilen',
    theme: {
      layout: 'featured',
      primaryColor: '#d4a84b',
      navyColor: '#0c1424',
      accentLightColor: '#f3ead8',
      heroTitle: 'Dijital Menü',
      heroSubtitle: 'Taze lezzetler, anlık güncellenen fiyatlar.',
    },
  },
  {
    id: 'emerald-luxe',
    name: 'Zümrüt',
    tag: 'Modern',
    theme: {
      layout: 'featured',
      primaryColor: '#34d399',
      navyColor: '#0f1f1a',
      accentLightColor: '#d1fae5',
      heroTitle: 'Restoran Menüsü',
      heroSubtitle: 'Sezonluk seçimler ve özel tarifler.',
    },
  },
  {
    id: 'warm-terracotta',
    name: 'Terrakota',
    tag: 'Sıcak',
    theme: {
      layout: 'classic',
      primaryColor: '#ea580c',
      navyColor: '#1c1917',
      accentLightColor: '#ffedd5',
      heroTitle: 'Otel Mutfağı',
      heroSubtitle: 'Günün önerileri ve kahvaltı köşesi.',
    },
  },
  {
    id: 'slate-minimal',
    name: 'Minimal',
    tag: 'Sade',
    theme: {
      layout: 'compact',
      primaryColor: '#64748b',
      navyColor: '#0f172a',
      accentLightColor: '#f1f5f9',
      heroTitle: 'Menü',
      heroSubtitle: 'Hızlı göz atın, sipariş verin.',
    },
  },
];

export function getKitchenMenuThemePreset(id: string): KitchenMenuThemePreset | undefined {
  return KITCHEN_MENU_THEME_PRESETS.find((p) => p.id === id);
}

export const DEFAULT_KITCHEN_MENU_LAYOUT: KitchenMenuLayoutMode = 'featured';
