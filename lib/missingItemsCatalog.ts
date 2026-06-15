import i18n from '@/i18n';

export type MissingItemArea = 'kitchen' | 'hotel';

export type MissingCatalogItem = {
  key: string;
  labelKey: string;
};

export type MissingCatalogCategory = {
  id: string;
  titleKey: string;
  icon: string;
  items: MissingCatalogItem[];
};

const AREA_COLORS: Record<MissingItemArea, { icon: string; color: string }> = {
  kitchen: { icon: 'restaurant', color: '#E67E22' },
  hotel: { icon: 'bed', color: '#3498DB' },
};

export function getMissingAreaMeta(area: MissingItemArea) {
  const base = AREA_COLORS[area];
  return {
    title: i18n.t(`missArea_${area}_title`),
    subtitle: i18n.t(`missArea_${area}_sub`),
    icon: base.icon,
    color: base.color,
  };
}

const KITCHEN_CATALOG: MissingCatalogCategory[] = [
  {
    id: 'ingredients',
    titleKey: 'missCat_kitchen_ingredients',
    icon: 'nutrition',
    items: [
      { key: 'oil', labelKey: 'missItem_oil' },
      { key: 'flour', labelKey: 'missItem_flour' },
      { key: 'sugar', labelKey: 'missItem_sugar' },
      { key: 'salt', labelKey: 'missItem_salt' },
      { key: 'spices', labelKey: 'missItem_spices' },
      { key: 'dairy', labelKey: 'missItem_dairy' },
      { key: 'meat', labelKey: 'missItem_meat' },
      { key: 'vegetables', labelKey: 'missItem_vegetables' },
      { key: 'fruits', labelKey: 'missItem_fruits' },
      { key: 'eggs', labelKey: 'missItem_eggs' },
      { key: 'bread', labelKey: 'missItem_bread' },
    ],
  },
  {
    id: 'disposables',
    titleKey: 'missCat_kitchen_disposables',
    icon: 'cube',
    items: [
      { key: 'gloves', labelKey: 'missItem_gloves' },
      { key: 'foil', labelKey: 'missItem_foil' },
      { key: 'containers', labelKey: 'missItem_containers' },
      { key: 'bags', labelKey: 'missItem_bags' },
      { key: 'napkins_k', labelKey: 'missItem_napkins_k' },
    ],
  },
  {
    id: 'equipment',
    titleKey: 'missCat_kitchen_equipment',
    icon: 'construct',
    items: [
      { key: 'knives', labelKey: 'missItem_knives' },
      { key: 'pans', labelKey: 'missItem_pans' },
      { key: 'oven_parts', labelKey: 'missItem_oven_parts' },
      { key: 'blender', labelKey: 'missItem_blender' },
      { key: 'thermometer', labelKey: 'missItem_thermometer' },
    ],
  },
  {
    id: 'cleaning_k',
    titleKey: 'missCat_kitchen_cleaning',
    icon: 'water',
    items: [
      { key: 'detergent_k', labelKey: 'missItem_detergent_k' },
      { key: 'degreaser', labelKey: 'missItem_degreaser' },
      { key: 'sponge', labelKey: 'missItem_sponge' },
    ],
  },
];

const HOTEL_CATALOG: MissingCatalogCategory[] = [
  {
    id: 'room_amenities',
    titleKey: 'missCat_hotel_room',
    icon: 'bed',
    items: [
      { key: 'shampoo', labelKey: 'missItem_shampoo' },
      { key: 'soap', labelKey: 'missItem_soap' },
      { key: 'lotion', labelKey: 'missItem_lotion' },
      { key: 'slippers', labelKey: 'missItem_slippers' },
      { key: 'dental', labelKey: 'missItem_dental' },
      { key: 'shower_cap', labelKey: 'missItem_shower_cap' },
      { key: 'coffee_tea', labelKey: 'missItem_coffee_tea' },
      { key: 'water', labelKey: 'missItem_water' },
    ],
  },
  {
    id: 'linen',
    titleKey: 'missCat_hotel_linen',
    icon: 'shirt',
    items: [
      { key: 'towels', labelKey: 'missItem_towels' },
      { key: 'sheets', labelKey: 'missItem_sheets' },
      { key: 'pillowcases', labelKey: 'missItem_pillowcases' },
      { key: 'duvet', labelKey: 'missItem_duvet' },
      { key: 'bathrobe', labelKey: 'missItem_bathrobe' },
    ],
  },
  {
    id: 'cleaning_h',
    titleKey: 'missCat_hotel_cleaning',
    icon: 'sparkles',
    items: [
      { key: 'detergent_h', labelKey: 'missItem_detergent_h' },
      { key: 'trash_bags', labelKey: 'missItem_trash_bags' },
      { key: 'toilet_paper', labelKey: 'missItem_toilet_paper' },
      { key: 'tissues', labelKey: 'missItem_tissues' },
    ],
  },
  {
    id: 'minibar',
    titleKey: 'missCat_hotel_minibar',
    icon: 'wine',
    items: [
      { key: 'minibar_drinks', labelKey: 'missItem_minibar_drinks' },
      { key: 'minibar_snacks', labelKey: 'missItem_minibar_snacks' },
      { key: 'minibar_alcohol', labelKey: 'missItem_minibar_alcohol' },
    ],
  },
  {
    id: 'general',
    titleKey: 'missCat_hotel_general',
    icon: 'business',
    items: [
      { key: 'light_bulb', labelKey: 'missItem_light_bulb' },
      { key: 'batteries', labelKey: 'missItem_batteries' },
      { key: 'keys_cards', labelKey: 'missItem_keys_cards' },
      { key: 'stationery', labelKey: 'missItem_stationery' },
    ],
  },
];

export type ResolvedMissingCatalogCategory = {
  id: string;
  title: string;
  icon: string;
  items: { key: string; label: string }[];
};

/** Uygulama içi varsayılan liste (DB boşken veya tohum için). */
export function getBuiltinMissingCatalog(area: MissingItemArea): ResolvedMissingCatalogCategory[] {
  const raw = area === 'kitchen' ? KITCHEN_CATALOG : HOTEL_CATALOG;
  return raw.map((cat) => ({
    id: cat.id,
    title: i18n.t(cat.titleKey),
    icon: cat.icon,
    items: cat.items.map((item) => ({
      key: item.key,
      label: i18n.t(item.labelKey),
    })),
  }));
}

/** @deprecated Yerel senkron kullanım — tercihen fetchMissingItemCatalog */
export function getMissingCatalog(area: MissingItemArea): ResolvedMissingCatalogCategory[] {
  return getBuiltinMissingCatalog(area);
}

export function findCatalogLabel(area: MissingItemArea, key: string): string | null {
  for (const cat of area === 'kitchen' ? KITCHEN_CATALOG : HOTEL_CATALOG) {
    const hit = cat.items.find((i) => i.key === key);
    if (hit) return i18n.t(hit.labelKey);
  }
  return null;
}

const KITCHEN_DEPARTMENTS = new Set([
  'kitchen',
  'kitchen_staff',
  'chef',
  'head_chef',
  'pastry',
  'restaurant',
  'bar',
  'service',
]);

/** Personelin varsayılan eksik alanı (mutfak departmanları → mutfak). */
export function defaultMissingAreaForDepartment(department: string | null | undefined): MissingItemArea {
  const d = (department ?? '').trim().toLowerCase();
  if (KITCHEN_DEPARTMENTS.has(d)) return 'kitchen';
  return 'hotel';
}

/** @deprecated use getMissingAreaMeta(area) */
export const MISSING_ITEM_AREA_META = {
  get kitchen() {
    return getMissingAreaMeta('kitchen');
  },
  get hotel() {
    return getMissingAreaMeta('hotel');
  },
};
