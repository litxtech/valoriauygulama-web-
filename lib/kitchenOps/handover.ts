import { supabase } from '@/lib/supabase';

export type KitchenHandoverListRow = {
  id: string;
  handover_date: string;
  handed_by_name: string;
  received_by_name: string;
  notes: string | null;
  created_at: string;
  item_count?: number;
};

export type KitchenHandoverItemImage = {
  id: string;
  image_url: string;
  sort_order: number;
};

export type KitchenHandoverItem = {
  id: string;
  material_name: string;
  quantity: number | null;
  unit: string;
  note: string | null;
  stock_item_id: string | null;
  images: KitchenHandoverItemImage[];
};

export type KitchenHandoverDetail = KitchenHandoverListRow & {
  items: KitchenHandoverItem[];
};

export type KitchenHandoverMaterialInput = {
  material_name: string;
  quantity?: number | null;
  unit?: string;
  stock_item_id?: string | null;
  note?: string | null;
  image_urls: string[];
};

export async function fetchKitchenHandovers(limit = 40): Promise<KitchenHandoverListRow[]> {
  const { data, error } = await supabase
    .from('kitchen_handovers')
    .select('id, handover_date, handed_by_name, received_by_name, notes, created_at')
    .order('handover_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as KitchenHandoverListRow[];
  if (rows.length === 0) return rows;

  const ids = rows.map((r) => r.id);
  const { data: counts } = await supabase.from('kitchen_handover_items').select('handover_id').in('handover_id', ids);
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) {
    const hid = (c as { handover_id: string }).handover_id;
    countMap.set(hid, (countMap.get(hid) ?? 0) + 1);
  }
  return rows.map((r) => ({ ...r, item_count: countMap.get(r.id) ?? 0 }));
}

export async function fetchKitchenHandover(id: string): Promise<KitchenHandoverDetail | null> {
  const { data: handover, error } = await supabase
    .from('kitchen_handovers')
    .select('id, handover_date, handed_by_name, received_by_name, notes, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!handover) return null;

  const { data: items, error: itemsErr } = await supabase
    .from('kitchen_handover_items')
    .select('id, material_name, quantity, unit, note, stock_item_id, sort_order')
    .eq('handover_id', id)
    .order('sort_order');
  if (itemsErr) throw itemsErr;

  const itemRows = items ?? [];
  const itemIds = itemRows.map((i) => i.id);
  let images: { handover_item_id: string; id: string; image_url: string; sort_order: number }[] = [];
  if (itemIds.length > 0) {
    const { data: imgs, error: imgErr } = await supabase
      .from('kitchen_handover_item_images')
      .select('id, handover_item_id, image_url, sort_order')
      .in('handover_item_id', itemIds)
      .order('sort_order');
    if (imgErr) throw imgErr;
    images = imgs ?? [];
  }

  const byItem = new Map<string, KitchenHandoverItemImage[]>();
  for (const img of images) {
    const list = byItem.get(img.handover_item_id) ?? [];
    list.push({ id: img.id, image_url: img.image_url, sort_order: img.sort_order });
    byItem.set(img.handover_item_id, list);
  }

  return {
    ...(handover as KitchenHandoverListRow),
    items: itemRows.map((i) => ({
      id: i.id,
      material_name: i.material_name,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      unit: i.unit,
      note: i.note,
      stock_item_id: i.stock_item_id,
      images: byItem.get(i.id) ?? [],
    })),
  };
}

export async function saveKitchenHandover(params: {
  handoverDate: string;
  handedByName: string;
  receivedByName: string;
  notes?: string | null;
  items: KitchenHandoverMaterialInput[];
}): Promise<string> {
  const payload = params.items.map((it) => ({
    material_name: it.material_name,
    quantity: it.quantity ?? null,
    unit: it.unit ?? 'adet',
    stock_item_id: it.stock_item_id ?? null,
    note: it.note ?? null,
    image_urls: it.image_urls,
  }));

  const { data, error } = await supabase.rpc('kitchen_save_handover', {
    p_handover_date: params.handoverDate,
    p_handed_by_name: params.handedByName,
    p_received_by_name: params.receivedByName,
    p_notes: params.notes ?? null,
    p_items: payload,
  });
  if (error) throw error;
  return data as string;
}

export async function addKitchenStockItemImages(itemId: string, imageUrls: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('kitchen_stock_add_item_images', {
    p_item_id: itemId,
    p_image_urls: imageUrls.filter(Boolean),
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchKitchenStockItemImages(itemId: string): Promise<KitchenHandoverItemImage[]> {
  const { data, error } = await supabase
    .from('kitchen_stock_item_images')
    .select('id, image_url, sort_order')
    .eq('item_id', itemId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as KitchenHandoverItemImage[];
}
