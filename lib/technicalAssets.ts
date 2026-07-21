import { supabase } from '@/lib/supabase';
import { getShareablePublicOrigin } from '@/lib/appPublicUrl';

/** QR içeriği (eski etiketler): valoria://tech-asset/<uuid> — pathname yalnızca /uuid olduğu için kök [id] yönlendirmesi gerekir. */
export const TECH_ASSET_QR_SCHEME = 'valoria://tech-asset/';
/** Yeni etiketler: doğrudan Expo Router yolu (pathname /staff/technical-assets/<uuid>). */
export const TECH_ASSET_QR_SCHEME_PATH = 'valoria:///staff/technical-assets/';

export type TechCriticality = 'low' | 'medium' | 'high' | 'critical';
export type TechAssetStatus = 'active' | 'inactive' | 'maintenance' | 'fault';

export const TECH_CATEGORY_GROUPS: { value: string; label: string }[] = [
  { value: 'electric', label: 'Elektrik' },
  { value: 'water', label: 'Su / Tesisat' },
  { value: 'security', label: 'Kamera / Güvenlik' },
  { value: 'internet', label: 'İnternet hattı' },
  { value: 'heating', label: 'Isıtma / Sıcak Su' },
  { value: 'room', label: 'Oda ekipmanı' },
  { value: 'kitchen', label: 'Mutfak ekipmanı' },
  { value: 'cleaning', label: 'Temizlik ekipmanı' },
  { value: 'furniture', label: 'Mobilya / Demirbaş' },
  { value: 'garden', label: 'Bahçe / Dış alan' },
  { value: 'product', label: 'Ürün / Malzeme' },
  { value: 'other', label: 'Diğer' },
];

export type TechBuildingRow = {
  id: string;
  organization_id: string;
  name: string;
  building_type: string | null;
  description: string | null;
  sort_order: number;
};

export type TechLocationRow = {
  id: string;
  organization_id: string;
  building_id: string;
  name: string;
  floor: string | null;
  description: string | null;
  sort_order: number;
};

export type TechAssetRow = {
  id: string;
  organization_id: string;
  asset_code: string;
  name: string;
  category_group: string;
  category_label: string;
  building_id: string;
  location_id: string;
  description: string | null;
  function_text: string | null;
  if_closed_effects: string | null;
  affected_areas: string | null;
  emergency_action: string | null;
  warning_text: string | null;
  who_can_close: string | null;
  who_can_open: string | null;
  criticality: TechCriticality;
  status: TechAssetStatus;
  photo_urls: string[] | unknown;
  qr_payload: string;
  label_tagline: string | null;
  usage_guide_text: string | null;
  usage_guide_video_url: string | null;
  public_token?: string | null;
  is_public?: boolean | null;
  created_at: string;
  updated_at: string;
};

export function techAssetHasUsageGuide(row: Pick<TechAssetRow, 'usage_guide_text' | 'usage_guide_video_url'>): boolean {
  return Boolean(row.usage_guide_text?.trim() || row.usage_guide_video_url?.trim());
}

export type TechAssetDetail = TechAssetRow & {
  buildingName?: string | null;
  locationName?: string | null;
  locationFloor?: string | null;
};

export type TechRelatedAsset = {
  id: string;
  relation_type: string;
  related_asset: { id: string; name: string; asset_code: string } | null;
};

/** Barkod/QR metninden teknik varlık uuid çıkarır (deep link, exp+ şema, sorgu parametreleri). */
export function parseTechnicalAssetIdFromScan(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const fromTechPath = (t: string) => {
    const mStaff = t.match(/staff\/technical-assets\/([0-9a-f-]{36})/i);
    if (mStaff?.[1] && uuidRe.test(mStaff[1])) return mStaff[1];
    const m = t.match(/tech-asset\/([0-9a-f-]{36})/i);
    return m?.[1] && uuidRe.test(m[1]) ? m[1] : null;
  };
  const fromQuery = (t: string) => {
    const m = t.match(/(?:[?&#])(?:id|assetId|asset_id)=([0-9a-f-]{36})/i);
    return m?.[1] && uuidRe.test(m[1]) ? m[1] : null;
  };

  const pathId = fromTechPath(s) ?? fromTechPath(decodeURIComponent(s));
  if (pathId) return pathId;
  const qId = fromQuery(s) ?? fromQuery(decodeURIComponent(s));
  if (qId) return qId;

  if (lower.startsWith(TECH_ASSET_QR_SCHEME_PATH.toLowerCase())) {
    const id = s.slice(TECH_ASSET_QR_SCHEME_PATH.length).trim().split(/[?#]/)[0];
    return uuidRe.test(id) ? id : null;
  }
  if (lower.startsWith(TECH_ASSET_QR_SCHEME.toLowerCase())) {
    const id = s.slice(TECH_ASSET_QR_SCHEME.length).trim().split(/[?#]/)[0];
    return uuidRe.test(id) ? id : null;
  }
  if (uuidRe.test(s)) return s;
  return null;
}

export function buildTechAssetQrPayload(assetId: string): string {
  return `${TECH_ASSET_QR_SCHEME_PATH}${assetId}`;
}

export function buildPublicTechAssetUrl(publicToken: string | null | undefined, origin?: string | null): string {
  const base = getShareablePublicOrigin(origin).replace(/\/$/, '');
  const token = String(publicToken ?? '').trim();
  if (!token) return `${base}/bilgi`;
  return `${base}/bilgi/${encodeURIComponent(token)}`;
}

export type PublicTechAsset = Pick<
  TechAssetRow,
  | 'id'
  | 'name'
  | 'asset_code'
  | 'category_label'
  | 'description'
  | 'function_text'
  | 'warning_text'
  | 'label_tagline'
  | 'photo_urls'
  | 'usage_guide_text'
  | 'usage_guide_video_url'
  | 'updated_at'
> & {
  building_name: string | null;
  location_name: string | null;
};

export async function fetchPublicTechAsset(
  publicToken: string
): Promise<{ data: PublicTechAsset | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_public_tech_asset', { p_token: publicToken });
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return { data: (row as PublicTechAsset | null) ?? null, error: null };
}

export async function fetchTechAssetDetail(assetId: string): Promise<{ data: TechAssetDetail | null; error: string | null }> {
  const { data: row, error } = await supabase.from('tech_assets').select('*').eq('id', assetId).maybeSingle();
  if (error) return { data: null, error: error.message };
  if (!row) return { data: null, error: null };
  const base = row as TechAssetRow;
  const [bRes, lRes] = await Promise.all([
    supabase.from('tech_buildings').select('name').eq('id', base.building_id).maybeSingle(),
    supabase.from('tech_locations').select('name, floor').eq('id', base.location_id).maybeSingle(),
  ]);
  const detail: TechAssetDetail = {
    ...base,
    buildingName: (bRes.data as { name?: string } | null)?.name ?? null,
    locationName: (lRes.data as { name?: string } | null)?.name ?? null,
    locationFloor: (lRes.data as { floor?: string | null } | null)?.floor ?? null,
  };
  return { data: detail, error: null };
}

/** Bu varlıktan çıkan bağlantılar (asset → related). */
export async function fetchRelatedAssets(assetId: string): Promise<TechRelatedAsset[]> {
  const { data: rels, error } = await supabase
    .from('tech_asset_relations')
    .select('id, relation_type, related_asset_id')
    .eq('asset_id', assetId);
  if (error || !rels?.length) return [];
  const ids = [...new Set(rels.map((r: { related_asset_id: string }) => r.related_asset_id))];
  const { data: assets } = await supabase.from('tech_assets').select('id, name, asset_code').in('id', ids);
  const map = new Map((assets ?? []).map((a) => [a.id, a as { id: string; name: string; asset_code: string }]));
  return (rels as { id: string; relation_type: string; related_asset_id: string }[]).map((r) => ({
    id: r.id,
    relation_type: r.relation_type,
    related_asset: map.get(r.related_asset_id) ?? null,
  }));
}

/** Başka varlıkların bu parçaya bağladığı ilişkiler (related = ben). */
export type TechParentRelation = {
  id: string;
  relation_type: string;
  parent_asset: { id: string; name: string; asset_code: string } | null;
};

export async function fetchParentRelationsForAsset(assetId: string): Promise<TechParentRelation[]> {
  const { data: rels, error } = await supabase
    .from('tech_asset_relations')
    .select('id, relation_type, asset_id')
    .eq('related_asset_id', assetId);
  if (error || !rels?.length) return [];
  const ids = [...new Set(rels.map((r: { asset_id: string }) => r.asset_id))];
  const { data: assets } = await supabase.from('tech_assets').select('id, name, asset_code').in('id', ids);
  const map = new Map((assets ?? []).map((a) => [a.id, a as { id: string; name: string; asset_code: string }]));
  return (rels as { id: string; relation_type: string; asset_id: string }[]).map((r) => ({
    id: r.id,
    relation_type: r.relation_type,
    parent_asset: map.get(r.asset_id) ?? null,
  }));
}

export async function fetchTechMaintenanceLogs(assetId: string, limit = 40) {
  const { data, error } = await supabase
    .from('tech_maintenance_logs')
    .select('id, action_type, note, photo_url, created_at, staff_id')
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];
  const rows = data as { id: string; action_type: string; note: string | null; photo_url: string | null; created_at: string; staff_id: string }[];
  const staffIds = [...new Set(rows.map((r) => r.staff_id))];
  const { data: staffRows } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
  const names = new Map((staffRows ?? []).map((s) => [s.id, (s as { full_name?: string | null }).full_name ?? null]));
  return rows.map((r) => ({ ...r, staff_name: names.get(r.staff_id) ?? null }));
}

export type TechMaintenanceLogRow = {
  id: string;
  action_type: string;
  note: string | null;
  photo_url: string | null;
  created_at: string;
  staff_id: string;
  asset_id: string;
};

/** İşletmedeki son müdahale kayıtları (varlık adı ile). */
export async function fetchRecentOrgMaintenanceLogs(limit = 100): Promise<
  (TechMaintenanceLogRow & { asset_name?: string | null; asset_code?: string | null })[]
> {
  const { data: logs, error } = await supabase
    .from('tech_maintenance_logs')
    .select('id, action_type, note, photo_url, created_at, staff_id, asset_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !logs?.length) return [];
  const assetIds = [...new Set((logs as TechMaintenanceLogRow[]).map((l) => l.asset_id))];
  const { data: assets } = await supabase.from('tech_assets').select('id, name, asset_code').in('id', assetIds);
  const map = new Map((assets ?? []).map((a) => [a.id, a as { name: string; asset_code: string }]));
  return (logs as TechMaintenanceLogRow[]).map((l) => ({
    ...l,
    asset_name: map.get(l.asset_id)?.name ?? null,
    asset_code: map.get(l.asset_id)?.asset_code ?? null,
  }));
}

export type TechFaultReportRow = {
  id: string;
  organization_id: string;
  asset_id: string | null;
  title: string;
  description: string | null;
  is_emergency: boolean;
  status: string;
  created_by_staff_id: string;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
};

export async function fetchOrgFaultReports(status?: 'open' | 'in_progress' | 'resolved' | 'cancelled' | 'all') {
  let q = supabase.from('tech_fault_reports').select('*');
  if (status && status !== 'all') q = q.eq('status', status);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []) as TechFaultReportRow[];
}

export function normalizePhotoUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === 'string' && u.length > 0) as string[];
  return [];
}

export function criticalityLabel(c: TechCriticality): string {
  switch (c) {
    case 'low':
      return 'Düşük';
    case 'medium':
      return 'Orta';
    case 'high':
      return 'Yüksek';
    case 'critical':
      return 'Kritik';
    default:
      return c;
  }
}
