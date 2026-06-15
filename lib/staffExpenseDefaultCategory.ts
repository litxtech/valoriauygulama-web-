import { supabase } from '@/lib/supabase';
import { isTransientSupabaseDbError, sleepMs } from '@/lib/supabaseTransientErrors';

let cachedDefaultCategoryId: string | null = null;

async function fetchDefaultExpenseCategoryId(): Promise<string> {
  const { data: diger } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('is_active', true)
    .ilike('name', 'Diğer')
    .maybeSingle();

  if (diger?.id) return diger.id as string;

  const { data: first, error } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!first?.id) {
    throw new Error('Harcama kategorisi yapılandırılmamış. Yöneticinize bildirin.');
  }
  return first.id as string;
}

/** UI kategori seçimi yok; kayıt için varsayılan «Diğer» (veya ilk aktif) kategori. */
export async function getDefaultExpenseCategoryId(): Promise<string> {
  if (cachedDefaultCategoryId) return cachedDefaultCategoryId;

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const id = await fetchDefaultExpenseCategoryId();
      cachedDefaultCategoryId = id;
      return id;
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (attempt < 5 && isTransientSupabaseDbError(err)) {
        await sleepMs(350 * attempt);
        continue;
      }
      throw e;
    }
  }

  throw new Error('Harcama kategorisi alınamadı');
}

/** Yeni harcama ekranı açılınca kategori önbelleğe alınır (522 anında tek istek azalır). */
export function prefetchDefaultExpenseCategoryId(): void {
  void getDefaultExpenseCategoryId().catch(() => {});
}
