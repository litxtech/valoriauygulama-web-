export type KitchenStockStatus = 'ok' | 'low' | 'critical' | 'empty' | 'expired';

export type KitchenStockItem = {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  minimum_quantity: number;
  last_purchase_price: number | null;
  last_in_at: string | null;
  last_out_at: string | null;
  nearest_expires_at: string | null;
  image_url: string | null;
  barcode: string | null;
  category_id: string | null;
  category?: { name: string } | null;
};

export type KitchenStockMovement = {
  id: string;
  movement_type: 'in' | 'out' | 'waste' | 'return' | 'correction';
  quantity: number;
  reason: string | null;
  note: string | null;
  created_at: string;
  source: string;
  created_by: string | null;
  staff?: { full_name: string | null } | null;
};

export type KitchenStockAlert = {
  id: string;
  alert_type: string;
  severity: 'warning' | 'critical';
  message: string;
  resolved: boolean;
  created_at: string;
  item?: { name: string } | null;
};

export type KitchenDaySummary = {
  total_revenue: number;
  total_pos: number;
  total_cash: number;
  total_expenses: number;
  personnel_expenses: number;
  supplier_debt: number;
  kitchen_owes_hotel: number;
  hotel_owes_kitchen: number;
  cari_net: number;
  net_remaining: number;
};

export type KitchenCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export const EMPTY_KITCHEN_DAY_SUMMARY: KitchenDaySummary = {
  total_revenue: 0,
  total_pos: 0,
  total_cash: 0,
  total_expenses: 0,
  personnel_expenses: 0,
  supplier_debt: 0,
  kitchen_owes_hotel: 0,
  hotel_owes_kitchen: 0,
  cari_net: 0,
  net_remaining: 0,
};
