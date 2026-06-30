import { supabase } from '@/lib/supabase';

export type TradePartnerCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type TradePartnerRow = {
  id: string;
  organization_id: string;
  category_id: string;
  company_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string;
  address: string | null;
  status: 'active' | 'suspended';
  notes: string | null;
  created_at: string;
  partner_trade_categories?: { name: string } | null;
};

export type TradeTransactionItem = {
  id: string;
  description: string;
  quantity: number;
  unit_label: string;
  unit_price: number;
  line_total: number;
  sort_order: number;
};

export type TradeTransactionRow = {
  id: string;
  organization_id: string;
  partner_id: string;
  reference_code: string | null;
  notes: string | null;
  status: 'pending_approval' | 'approved' | 'disputed' | 'cancelled';
  total_amount: number;
  currency: string;
  partner_response_at: string | null;
  partner_dispute_note: string | null;
  created_at: string;
  partner_trade_partners?: { company_name: string } | null;
  partner_trade_transaction_items?: TradeTransactionItem[];
};

export type TradeMovementRow = {
  id: string;
  movement_type: 'borc' | 'alacak';
  amount: number;
  note: string | null;
  transaction_id: string | null;
  created_at: string;
};

export type TradePartnerProfile = {
  partnerId: string;
  companyName: string;
  contactName: string | null;
  email: string;
  phone: string | null;
  address: string | null;
  categoryName: string;
  balance: number;
  isActive: boolean;
};

export type TradeTransactionItemInput = {
  description: string;
  quantity: number;
  unit_label?: string;
  unit_price: number;
};

const PROVIDER_ORG_SLUG = 'valoria';
let cachedProviderOrgId: string | null = null;

export function randomTradePartnerPassword(length = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function fetchTradePartnerProviderOrgId(): Promise<string> {
  if (cachedProviderOrgId) return cachedProviderOrgId;

  const { data: rpcId, error: rpcErr } = await supabase.rpc('partner_trade_provider_org_id');
  if (!rpcErr && rpcId) {
    cachedProviderOrgId = String(rpcId);
    return cachedProviderOrgId;
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', PROVIDER_ORG_SLUG)
    .maybeSingle();

  if (orgErr || !org?.id) {
    throw new Error('Partner Ticaret işletmesi bulunamadı (valoria).');
  }

  cachedProviderOrgId = org.id;
  return cachedProviderOrgId;
}

export async function ensureTradePartnerCategories(orgId: string): Promise<TradePartnerCategory[]> {
  await supabase.rpc('partner_trade_seed_categories', { p_org_id: orgId });
  const { data, error } = await supabase
    .from('partner_trade_categories')
    .select('id, name, sort_order, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('sort_order')
    .order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as TradePartnerCategory[];
}

export async function fetchTradePartners(orgId: string): Promise<TradePartnerRow[]> {
  const { data, error } = await supabase
    .from('partner_trade_partners')
    .select('*, partner_trade_categories(name)')
    .eq('organization_id', orgId)
    .order('company_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as TradePartnerRow[];
}

export async function fetchTradePartnerById(partnerId: string): Promise<TradePartnerRow | null> {
  const { data, error } = await supabase
    .from('partner_trade_partners')
    .select('*, partner_trade_categories(name)')
    .eq('id', partnerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TradePartnerRow | null) ?? null;
}

export async function fetchTradePartnerBalance(partnerId: string): Promise<number> {
  const { data, error } = await supabase.rpc('partner_trade_partner_balance', { p_partner_id: partnerId });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export async function fetchTradeTransactions(orgId: string, partnerId?: string): Promise<TradeTransactionRow[]> {
  let q = supabase
    .from('partner_trade_transactions')
    .select('*, partner_trade_partners(company_name), partner_trade_transaction_items(*)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (partnerId) q = q.eq('partner_id', partnerId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as TradeTransactionRow[];
}

export async function fetchTradeMovements(partnerId: string): Promise<TradeMovementRow[]> {
  const { data, error } = await supabase
    .from('partner_trade_movements')
    .select('id, movement_type, amount, note, transaction_id, created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TradeMovementRow[];
}

export async function createTradePartnerAccount(input: {
  organizationId: string;
  categoryId: string;
  email: string;
  password: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  accessToken: string;
}): Promise<{ partnerId: string; email: string } | { error: string }> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl) return { error: 'Supabase URL yapılandırılmamış' };

  const res = await fetch(`${supabaseUrl}/functions/v1/create-trade-partner`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
      ...(anonKey ? { apikey: anonKey } : {}),
    },
    body: JSON.stringify({
      organization_id: input.organizationId,
      category_id: input.categoryId,
      email: input.email.trim().toLowerCase(),
      password: input.password,
      company_name: input.companyName.trim(),
      contact_name: input.contactName?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      notes: input.notes?.trim() || null,
      access_token: input.accessToken,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; partner_id?: string; email?: string };
  if (!res.ok || data.error) return { error: data.error ?? `HTTP ${res.status}` };
  if (!data.partner_id) return { error: 'Partner oluşturulamadı' };
  return { partnerId: data.partner_id, email: data.email ?? input.email };
}

export async function createTradeTransaction(input: {
  partnerId: string;
  items: TradeTransactionItemInput[];
  notes?: string;
  referenceCode?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('partner_trade_create_transaction', {
    p_partner_id: input.partnerId,
    p_items: input.items.map((i) => ({
      description: i.description.trim(),
      quantity: i.quantity,
      unit_label: i.unit_label?.trim() || 'Adet',
      unit_price: i.unit_price,
    })),
    p_notes: input.notes?.trim() || null,
    p_reference_code: input.referenceCode?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function recordTradePayment(partnerId: string, amount: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('partner_trade_record_payment', {
    p_partner_id: partnerId,
    p_amount: amount,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function respondTradeTransaction(
  transactionId: string,
  action: 'approve' | 'dispute',
  disputeNote?: string
): Promise<void> {
  const { error } = await supabase.rpc('partner_trade_respond_transaction', {
    p_transaction_id: transactionId,
    p_action: action,
    p_dispute_note: disputeNote?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchTradePartnerProfileForAuth(): Promise<TradePartnerProfile | null> {
  const { data: partnerId, error: idErr } = await supabase.rpc('partner_trade_current_partner_id');
  if (idErr || !partnerId) return null;

  const row = await fetchTradePartnerById(String(partnerId));
  if (!row || row.status !== 'active') return null;

  const balance = await fetchTradePartnerBalance(row.id);

  return {
    partnerId: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    categoryName: row.partner_trade_categories?.name ?? '—',
    balance,
    isActive: row.status === 'active',
  };
}

export async function fetchPartnerPortalTransactions(limit = 50) {
  const { data, error } = await supabase.rpc('partner_trade_partner_transactions', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    reference_code: string | null;
    notes: string | null;
    status: string;
    total_amount: number;
    currency: string;
    partner_response_at: string | null;
    partner_dispute_note: string | null;
    created_at: string;
    item_count: number;
  }>;
}

export async function fetchPartnerPortalLedger(limit = 100): Promise<TradeMovementRow[]> {
  const { data, error } = await supabase.rpc('partner_trade_partner_ledger', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as TradeMovementRow[];
}

export function formatTradeMoney(amount: number, currency = 'TRY'): string {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function calcLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}
