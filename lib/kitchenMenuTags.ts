/** Menü ürün hızlı filtre etiketleri */
export const KITCHEN_MENU_TAG_IDS = [
  'meat',
  'vegetarian',
  'seafood',
  'vegan',
  'dessert',
  'breakfast',
  'drink',
] as const;

export type KitchenMenuTagId = (typeof KITCHEN_MENU_TAG_IDS)[number];

export function isKitchenMenuTagId(v: string): v is KitchenMenuTagId {
  return (KITCHEN_MENU_TAG_IDS as readonly string[]).includes(v);
}

export function normalizeKitchenMenuTags(tags: unknown): KitchenMenuTagId[] {
  if (!Array.isArray(tags)) return [];
  const out: KitchenMenuTagId[] = [];
  for (const raw of tags) {
    const t = String(raw ?? '')
      .trim()
      .toLowerCase();
    if (isKitchenMenuTagId(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

/** i18n key: kitchenMenuTagMeat, … */
export function kitchenMenuTagI18nKey(tag: KitchenMenuTagId): string {
  return `kitchenMenuTag${tag.charAt(0).toUpperCase()}${tag.slice(1)}`;
}
