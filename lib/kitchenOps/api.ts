import { supabase } from '@/lib/supabase';
import type { KitchenCategory, KitchenDaySummary, KitchenStockItem, KitchenStockMovement } from './types';
import { EMPTY_KITCHEN_DAY_SUMMARY } from './types';
import { isKitchenStockLow } from './stockStatus';

type KitchenMovementPhotoRow = {
  item_id: string;
  product_photo_url: string | null;
  photo_url?: string | null;
  package_photo_url?: string | null;
  created_at: string;
};

async function hydrateKitchenItemImages(items: KitchenStockItem[]): Promise<KitchenStockItem[]> {
  const missing = items.filter((i) => !i.image_url).map((i) => i.id);
  if (missing.length === 0) return items;

  const { data, error } = await supabase
    .from('kitchen_stock_movements')
    .select('item_id, product_photo_url, photo_url, package_photo_url, created_at')
    .in('item_id', missing)
    .not('product_photo_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error || !data?.length) return items;

  const latestByItem = new Map<string, string>();
  for (const row of data as KitchenMovementPhotoRow[]) {
    const url = (row.product_photo_url ?? row.photo_url ?? row.package_photo_url ?? '').trim();
    if (!url) continue;
    if (!latestByItem.has(row.item_id)) latestByItem.set(row.item_id, url);
  }

  return items.map((item) => ({
    ...item,
    image_url: item.image_url ?? latestByItem.get(item.id) ?? null,
  }));
}

export async function fetchKitchenCategories(): Promise<KitchenCategory[]> {
  const { data, error } = await supabase
    .from('kitchen_stock_categories')
    .select('id, name, sort_order')
    .eq('active', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []) as KitchenCategory[];
}

/** Var olan kategoriyi bulur veya org için yeni kayıt oluşturur. */
export async function ensureKitchenCategory(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc('kitchen_stock_ensure_category', { p_name: trimmed });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function searchKitchenItems(query: string, limit = 8): Promise<KitchenStockItem[]> {
  const q = query.trim();
  if (!q) return [];
  const { data, error } = await supabase
    .from('kitchen_stock_items')
    .select('id, name, unit, current_quantity, minimum_quantity, last_purchase_price, barcode, category_id, category:kitchen_stock_categories(name)')
    .eq('active', true)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as KitchenStockItem[];
}

export async function fetchKitchenItemByBarcode(barcode: string): Promise<KitchenStockItem | null> {
  const { data, error } = await supabase
    .from('kitchen_stock_items')
    .select('id, name, unit, current_quantity, minimum_quantity, last_purchase_price, barcode, category_id, image_url, last_in_at, last_out_at, nearest_expires_at, category:kitchen_stock_categories(name)')
    .eq('barcode', barcode.trim())
    .eq('active', true)
    .maybeSingle();
  if (error) throw error;
  const item = (data as KitchenStockItem | null) ?? null;
  if (!item) return null;
  const [hydrated] = await hydrateKitchenItemImages([item]);
  return hydrated ?? item;
}

export async function fetchKitchenItems(options?: { lowOnly?: boolean }): Promise<KitchenStockItem[]> {
  let q = supabase
    .from('kitchen_stock_items')
    .select('id, name, unit, current_quantity, minimum_quantity, last_purchase_price, last_in_at, last_out_at, nearest_expires_at, image_url, barcode, category_id, category:kitchen_stock_categories(name)')
    .eq('active', true)
    .order('name');
  const { data, error } = await q;
  if (error) throw error;
  let items = await hydrateKitchenItemImages((data ?? []) as KitchenStockItem[]);
  if (options?.lowOnly) {
    items = items.filter(isKitchenStockLow);
  }
  return items;
}

export async function fetchKitchenItem(id: string): Promise<KitchenStockItem | null> {
  const { data, error } = await supabase
    .from('kitchen_stock_items')
    .select('id, name, unit, current_quantity, minimum_quantity, last_purchase_price, last_in_at, last_out_at, nearest_expires_at, image_url, barcode, category_id, category:kitchen_stock_categories(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  const item = (data as KitchenStockItem | null) ?? null;
  if (!item) return null;
  const [hydrated] = await hydrateKitchenItemImages([item]);
  return hydrated ?? item;
}

export async function fetchKitchenItemMovements(itemId: string, limit = 30): Promise<KitchenStockMovement[]> {
  const { data, error } = await supabase
    .from('kitchen_stock_movements')
    .select('id, movement_type, quantity, reason, note, created_at, source, created_by, staff:created_by(full_name)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as KitchenStockMovement[];
}

export async function upsertKitchenItem(params: {
  name: string;
  unit?: string;
  categoryId?: string | null;
  barcode?: string | null;
  minimumQuantity?: number;
  imageUrl?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('kitchen_stock_upsert_item', {
    p_name: params.name,
    p_unit: params.unit ?? 'adet',
    p_category_id: params.categoryId ?? null,
    p_barcode: params.barcode ?? null,
    p_minimum_quantity: params.minimumQuantity ?? 0,
    p_image_url: params.imageUrl ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function applyKitchenMovement(params: {
  itemId: string;
  movementType: 'in' | 'out' | 'waste' | 'return' | 'correction';
  quantity: number;
  reason?: string | null;
  note?: string | null;
  unitPrice?: number | null;
  supplierName?: string | null;
  expiresAt?: string | null;
  photoUrl?: string | null;
  invoicePhotoUrl?: string | null;
  productPhotoUrl?: string | null;
  packagePhotoUrl?: string | null;
  source?: 'manual' | 'barcode' | 'quick_button';
}): Promise<string> {
  const { data, error } = await supabase.rpc('kitchen_stock_apply_movement', {
    p_item_id: params.itemId,
    p_movement_type: params.movementType,
    p_quantity: params.quantity,
    p_reason: params.reason ?? null,
    p_note: params.note ?? null,
    p_unit_price: params.unitPrice ?? null,
    p_supplier_name: params.supplierName ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_photo_url: params.photoUrl ?? null,
    p_invoice_photo_url: params.invoicePhotoUrl ?? null,
    p_product_photo_url: params.productPhotoUrl ?? null,
    p_package_photo_url: params.packagePhotoUrl ?? null,
    p_source: params.source ?? 'manual',
  });
  if (error) throw error;
  return data as string;
}

export async function fetchUnresolvedAlertCount(): Promise<number> {
  const { count, error } = await supabase
    .from('kitchen_stock_alerts')
    .select('id', { count: 'exact', head: true })
    .eq('resolved', false);
  if (error) throw error;
  return count ?? 0;
}

function normalizeKitchenDaySummary(raw: unknown): KitchenDaySummary {
  if (raw == null) return { ...EMPTY_KITCHEN_DAY_SUMMARY };
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...EMPTY_KITCHEN_DAY_SUMMARY };
    }
  }
  if (typeof parsed !== 'object') return { ...EMPTY_KITCHEN_DAY_SUMMARY };
  const o = parsed as Record<string, unknown>;
  return {
    total_revenue: Number(o.total_revenue ?? 0),
    total_pos: Number(o.total_pos ?? 0),
    total_cash: Number(o.total_cash ?? 0),
    total_expenses: Number(o.total_expenses ?? 0),
    personnel_expenses: Number(o.personnel_expenses ?? 0),
    supplier_debt: Number(o.supplier_debt ?? 0),
    kitchen_owes_hotel: Number(o.kitchen_owes_hotel ?? 0),
    hotel_owes_kitchen: Number(o.hotel_owes_kitchen ?? 0),
    cari_net: Number(o.cari_net ?? 0),
    net_remaining: Number(o.net_remaining ?? 0),
  };
}

export async function fetchDaySummary(date?: string): Promise<KitchenDaySummary> {
  const { data, error } = await supabase.rpc('kitchen_day_closure_summary', {
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return normalizeKitchenDaySummary(data);
}

export async function checkPosMismatch(date?: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('kitchen_check_pos_mismatch', {
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return !!data;
}

export type KitchenPosTransactionRow = {
  id: string;
  entry_date: string;
  amount: number;
  net_amount: number;
  commission_rate?: number;
  description: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  creator_name?: string | null;
};

export async function fetchKitchenPosTransactions(limit = 50): Promise<KitchenPosTransactionRow[]> {
  const { data, error } = await supabase
    .from('kitchen_pos_transactions')
    .select('id, entry_date, amount, net_amount, commission_rate, description, status, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as KitchenPosTransactionRow[];
  const staffIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  if (staffIds.length === 0) return rows;

  const { data: staffRows } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
  const nameById = new Map((staffRows ?? []).map((s) => [s.id as string, (s.full_name as string | null) ?? null]));
  return rows.map((r) => ({
    ...r,
    creator_name: r.created_by ? nameById.get(r.created_by) ?? null : null,
  }));
}

export async function advanceKitchenPosStatus(transactionId: string): Promise<string> {
  const { data, error } = await supabase.rpc('kitchen_pos_advance_status', {
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return String(data ?? '');
}

export type KitchenDayClosureRow = {
  id: string;
  closure_date: string;
  total_revenue: number;
  total_pos: number;
  net_remaining: number;
  status: string;
  submitted_at: string | null;
};

export async function fetchPendingDayClosures(): Promise<KitchenDayClosureRow[]> {
  const { data, error } = await supabase
    .from('kitchen_day_closures')
    .select('id, closure_date, total_revenue, total_pos, net_remaining, status, submitted_at')
    .in('status', ['submitted', 'draft'])
    .order('closure_date', { ascending: false })
    .limit(14);
  if (error) throw error;
  return (data ?? []) as KitchenDayClosureRow[];
}

export async function approveKitchenDayClosure(closureId: string): Promise<void> {
  const { error } = await supabase.rpc('kitchen_day_closure_approve', { p_closure_id: closureId });
  if (error) throw error;
}

export async function fetchCariNetBalance(): Promise<number> {
  const { data, error } = await supabase.rpc('kitchen_cari_net_balance');
  if (error) throw error;
  return Number(data ?? 0);
}
