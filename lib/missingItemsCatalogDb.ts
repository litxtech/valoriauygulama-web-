import { supabase } from '@/lib/supabase';
import {
  getBuiltinMissingCatalog,
  type MissingItemArea,
  type ResolvedMissingCatalogCategory,
} from '@/lib/missingItemsCatalog';

type DbCategory = {
  id: string;
  slug: string;
  title: string;
  icon: string;
  sort_order: number;
  items: { id: string; item_key: string; label: string; sort_order: number }[];
};

export async function fetchMissingItemCatalog(
  area: MissingItemArea
): Promise<{ data: ResolvedMissingCatalogCategory[]; fromDb: boolean; error?: string }> {
  const { data, error } = await supabase
    .from('missing_item_catalog_categories')
    .select(
      'id, slug, title, icon, sort_order, items:missing_item_catalog_items(id, item_key, label, sort_order)'
    )
    .eq('area', area)
    .order('sort_order', { ascending: true });

  if (error) return { data: getBuiltinMissingCatalog(area), fromDb: false, error: error.message };
  const rows = (data ?? []) as DbCategory[];
  if (rows.length === 0) {
    return { data: getBuiltinMissingCatalog(area), fromDb: false };
  }

  const mapped: ResolvedMissingCatalogCategory[] = rows.map((cat) => ({
    id: cat.slug,
    title: cat.title,
    icon: cat.icon || 'cube',
    items: [...(cat.items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => ({
        key: item.item_key,
        label: item.label,
      })),
  }));

  return { data: mapped, fromDb: true };
}

export async function seedMissingItemCatalogFromDefaults(area: MissingItemArea): Promise<{ error?: string }> {
  const { count, error: countErr } = await supabase
    .from('missing_item_catalog_categories')
    .select('id', { count: 'exact', head: true })
    .eq('area', area);

  if (countErr) return { error: countErr.message };
  if ((count ?? 0) > 0) return {};

  const builtin = getBuiltinMissingCatalog(area);
  for (let ci = 0; ci < builtin.length; ci++) {
    const cat = builtin[ci]!;
    const { data: inserted, error: catErr } = await supabase
      .from('missing_item_catalog_categories')
      .insert({
        area,
        slug: cat.id,
        title: cat.title,
        icon: cat.icon,
        sort_order: ci,
      })
      .select('id')
      .single();

    if (catErr || !inserted) return { error: catErr?.message ?? 'Kategori eklenemedi' };

    const itemRows = cat.items.map((item, ii) => ({
      category_id: inserted.id,
      item_key: item.key,
      label: item.label,
      sort_order: ii,
    }));
    if (itemRows.length > 0) {
      const { error: itemsErr } = await supabase.from('missing_item_catalog_items').insert(itemRows);
      if (itemsErr) return { error: itemsErr.message };
    }
  }
  return {};
}

export async function upsertMissingCatalogCategory(params: {
  area: MissingItemArea;
  slug: string;
  title: string;
  icon: string;
  sortOrder: number;
  existingCategoryUuid?: string;
}): Promise<{ id?: string; error?: string }> {
  const slug = params.slug.trim().toLowerCase().replace(/\s+/g, '_');
  const title = params.title.trim();
  if (!slug || !title) return { error: 'Kategori adı gerekli' };

  if (params.existingCategoryUuid) {
    const { error } = await supabase
      .from('missing_item_catalog_categories')
      .update({ title, icon: params.icon, sort_order: params.sortOrder })
      .eq('id', params.existingCategoryUuid);
    return error ? { error: error.message } : { id: params.existingCategoryUuid };
  }

  const { data, error } = await supabase
    .from('missing_item_catalog_categories')
    .insert({
      area: params.area,
      slug,
      title,
      icon: params.icon,
      sort_order: params.sortOrder,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  return { id: data.id };
}

export async function deleteMissingCatalogCategory(categoryUuid: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('missing_item_catalog_categories').delete().eq('id', categoryUuid);
  return error ? { error: error.message } : {};
}

export async function upsertMissingCatalogItem(params: {
  categoryUuid: string;
  itemKey: string;
  label: string;
  sortOrder: number;
  existingItemUuid?: string;
}): Promise<{ error?: string }> {
  const label = params.label.trim();
  const itemKey = params.itemKey.trim().toLowerCase().replace(/\s+/g, '_');
  if (!label || !itemKey) return { error: 'Kalem adı gerekli' };

  if (params.existingItemUuid) {
    const { error } = await supabase
      .from('missing_item_catalog_items')
      .update({ label, sort_order: params.sortOrder })
      .eq('id', params.existingItemUuid);
    return error ? { error: error.message } : {};
  }

  const { error } = await supabase.from('missing_item_catalog_items').insert({
    category_id: params.categoryUuid,
    item_key: itemKey,
    label,
    sort_order: params.sortOrder,
  });
  return error ? { error: error.message } : {};
}

export async function deleteMissingCatalogItem(itemUuid: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('missing_item_catalog_items').delete().eq('id', itemUuid);
  return error ? { error: error.message } : {};
}

/** Düzenleme ekranı: DB satırları + uuid eşlemesi */
export type MissingCatalogEditorCategory = ResolvedMissingCatalogCategory & {
  dbId: string;
  items: (ResolvedMissingCatalogCategory['items'][number] & { dbId?: string })[];
};

export async function fetchMissingItemCatalogForEditor(
  area: MissingItemArea
): Promise<{ data: MissingCatalogEditorCategory[]; error?: string }> {
  await seedMissingItemCatalogFromDefaults(area);

  const { data, error } = await supabase
    .from('missing_item_catalog_categories')
    .select(
      'id, slug, title, icon, sort_order, items:missing_item_catalog_items(id, item_key, label, sort_order)'
    )
    .eq('area', area)
    .order('sort_order', { ascending: true });

  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as DbCategory[];
  return {
    data: rows.map((cat) => ({
      id: cat.slug,
      dbId: cat.id,
      title: cat.title,
      icon: cat.icon || 'cube',
      items: [...(cat.items ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({
          key: item.item_key,
          label: item.label,
          dbId: item.id,
        })),
    })),
  };
}
