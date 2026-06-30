import { translateText } from '@/lib/translateText';
import type { KitchenMenuI18nFields } from '@/lib/kitchenMenuI18n';

async function translateField(text: string, targetLang: 'en' | 'ar'): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const { translated } = await translateText(trimmed, { targetLang, sourceLang: 'tr' });
    const out = translated.trim();
    return out && out !== trimmed ? out : out || null;
  } catch {
    return null;
  }
}

/** Yeni/güncellenen menü kalemi için EN + AR çevirileri (staff oturumu gerekir). */
export async function buildKitchenMenuItemI18nFields(input: {
  categoryTitle: string;
  name: string;
  description?: string | null;
}): Promise<KitchenMenuI18nFields> {
  const categoryTitle = input.categoryTitle.trim();
  const name = input.name.trim();
  const description = input.description?.trim() || '';

  const [nameEn, nameAr, categoryTitleEn, categoryTitleAr, descriptionEn, descriptionAr] =
    await Promise.all([
      translateField(name, 'en'),
      translateField(name, 'ar'),
      translateField(categoryTitle, 'en'),
      translateField(categoryTitle, 'ar'),
      description ? translateField(description, 'en') : Promise.resolve(null),
      description ? translateField(description, 'ar') : Promise.resolve(null),
    ]);

  return {
    nameEn,
    nameAr,
    categoryTitleEn,
    categoryTitleAr,
    descriptionEn,
    descriptionAr,
  };
}
