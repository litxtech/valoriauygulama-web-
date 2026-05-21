/**
 * Denetim modülü: kategoriler, oturumlar, pano RPC.
 */
import { supabase } from '@/lib/supabase';
import { monthKey } from '@/lib/financeLedger';
import { unwrapFeedRelation } from '@/lib/feedAuthorJoin';

export const AUDIT_THRESHOLD = 70;

export type AuditCategoryRow = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

export type AuditCriterionRow = {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  max_points: number;
  weight: number;
  is_critical: boolean;
  sort_order: number;
  is_active: boolean;
};

export type AuditSessionRow = {
  id: string;
  organization_id: string;
  category_id: string;
  auditor_staff_id: string;
  status: 'draft' | 'submitted';
  area_note: string | null;
  session_score: number | null;
  month_key: string;
  conducted_at: string;
  submitted_at: string | null;
  category?: { name: string; slug: string; icon: string } | null;
  auditor?: { full_name: string | null } | null;
};

export type DepartmentLeaderboardRow = {
  category_id: string;
  name: string;
  slug: string;
  icon: string;
  avg_score: number | null;
  audit_count: number;
  rank: number;
  trend_delta: number;
  prev_avg: number | null;
};

export type StaffAuditRecentRow = {
  id: string;
  session_score: number;
  conducted_at: string;
  month_key: string;
  category_name: string;
  category_slug: string;
  reason_summary: string | null;
};

export type AuditSessionItemLine = {
  title: string;
  points_awarded: number;
  max_points: number;
};

export async function fetchAuditSessionItemLines(
  sessionId: string
): Promise<AuditSessionItemLine[]> {
  const { data, error } = await supabase
    .from('audit_session_items')
    .select('points_awarded, max_points, criterion:audit_criteria(title)')
    .eq('session_id', sessionId);
  if (error) return [];
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const crit = unwrapFeedRelation(
      r.criterion as { title: string } | { title: string }[]
    );
    return {
      title: crit?.title ?? 'Kriter',
      points_awarded: Number(r.points_awarded) || 0,
      max_points: Number(r.max_points) || 0,
    };
  });
}

export function auditScoreColor(score: number | null | undefined): string {
  if (score == null) return '#64748b';
  if (score >= 85) return '#16a34a';
  if (score >= AUDIT_THRESHOLD) return '#ca8a04';
  return '#dc2626';
}

export function auditScoreLabel(score: number | null | undefined): string {
  if (score == null) return '—';
  return `${Math.round(score)}/100`;
}

export async function ensureAuditDefaults(orgId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('seed_audit_defaults_for_org', { p_org_id: orgId });
  if (error) return { error: error.message };
  return {};
}

function normalizeCriterionRow(row: Record<string, unknown>): AuditCriterionRow {
  return {
    id: String(row.id),
    category_id: String(row.category_id),
    title: String(row.title ?? ''),
    description: (row.description as string | null) ?? null,
    max_points: Number(row.max_points) || 0,
    weight: Number(row.weight) || 1,
    is_critical: Boolean(row.is_critical),
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
  };
}

export async function fetchAuditCategories(orgId: string): Promise<{
  data: AuditCategoryRow[];
  error?: string;
}> {
  const seed = await ensureAuditDefaults(orgId);
  if (seed.error) return { data: [], error: seed.error };
  const { data, error } = await supabase
    .from('audit_categories')
    .select('id, organization_id, slug, name, icon, sort_order, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as AuditCategoryRow[] };
}

export async function fetchAuditCriteria(
  categoryId: string,
  orgId?: string
): Promise<{
  data: AuditCriterionRow[];
  error?: string;
}> {
  const query = async () => {
    const { data, error } = await supabase
      .from('audit_criteria')
      .select('id, category_id, title, description, max_points, weight, is_critical, sort_order, is_active')
      .eq('category_id', categoryId)
      .eq('is_active', true)
      .order('sort_order');
    if (error) return { data: [] as AuditCriterionRow[], error: error.message };
    return {
      data: (data ?? []).map((r) => normalizeCriterionRow(r as Record<string, unknown>)),
    };
  };

  let result = await query();
  if (orgId && !result.error && result.data.length === 0) {
    const seed = await ensureAuditDefaults(orgId);
    if (seed.error) return { data: [], error: seed.error };
    result = await query();
  }
  return result;
}

export async function fetchDepartmentLeaderboard(
  orgId: string,
  ym?: string
): Promise<{ monthKey: string; departments: DepartmentLeaderboardRow[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_audit_department_leaderboard', {
    p_organization_id: orgId,
    p_month_key: ym ?? monthKey(),
  });
  if (error) return { monthKey: ym ?? monthKey(), departments: [], error: error.message };
  const payload = data as { month_key?: string; departments?: DepartmentLeaderboardRow[] } | null;
  return {
    monthKey: payload?.month_key ?? ym ?? monthKey(),
    departments: payload?.departments ?? [],
  };
}

export async function fetchRecentAuditSessions(
  orgId: string,
  limit = 15
): Promise<{ data: AuditSessionRow[]; error?: string }> {
  const { data, error } = await supabase
    .from('audit_sessions')
    .select(
      `
      id, organization_id, category_id, auditor_staff_id, status, area_note,
      session_score, month_key, conducted_at, submitted_at,
      category:audit_categories(name, slug, icon),
      auditor:staff!audit_sessions_auditor_staff_id_fkey(full_name)
    `
    )
    .eq('organization_id', orgId)
    .eq('status', 'submitted')
    .order('conducted_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as unknown as AuditSessionRow[] };
}

export async function fetchAuditSessionDetail(sessionId: string): Promise<{
  session: AuditSessionRow | null;
  items: {
    id: string;
    points_awarded: number;
    max_points: number;
    comment: string | null;
    criterion: { title: string; is_critical: boolean } | null;
  }[];
  staff: { staff_id: string; role: string; full_name: string | null }[];
  media: {
    id: string;
    media_type: string;
    url: string;
    caption: string | null;
    session_item_id: string | null;
  }[];
  error?: string;
}> {
  const [sRes, iRes, stRes, mRes] = await Promise.all([
    supabase
      .from('audit_sessions')
      .select(
        `
        id, organization_id, category_id, auditor_staff_id, status, area_note,
        session_score, month_key, conducted_at, submitted_at,
        category:audit_categories(name, slug, icon),
        auditor:staff!audit_sessions_auditor_staff_id_fkey(full_name)
      `
      )
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('audit_session_items')
      .select('id, points_awarded, max_points, comment, criterion:audit_criteria(title, is_critical)')
      .eq('session_id', sessionId),
    supabase.from('audit_session_staff').select('staff_id, role').eq('session_id', sessionId),
    supabase
      .from('audit_session_media')
      .select('id, media_type, url, caption, session_item_id')
      .eq('session_id', sessionId)
      .order('sort_order'),
  ]);

  if (sRes.error) return { session: null, items: [], staff: [], media: [], error: sRes.error.message };

  const rawSession = sRes.data as Record<string, unknown> | null;
  const sessionNorm = rawSession
    ? ({
        ...rawSession,
        session_score:
          rawSession.session_score != null ? Number(rawSession.session_score) : null,
        category: unwrapFeedRelation(
          rawSession.category as AuditSessionRow['category'] | AuditSessionRow['category'][]
        ),
        auditor: unwrapFeedRelation(
          rawSession.auditor as AuditSessionRow['auditor'] | AuditSessionRow['auditor'][]
        ),
      } as AuditSessionRow)
    : null;

  const staffIds = (stRes.data ?? []).map((r) => (r as { staff_id: string }).staff_id);
  let nameMap: Record<string, string | null> = {};
  if (staffIds.length) {
    const { data: names } = await supabase.from('staff').select('id, full_name').in('id', staffIds);
    for (const n of names ?? []) {
      const row = n as { id: string; full_name: string | null };
      nameMap[row.id] = row.full_name;
    }
  }

  const itemsNorm = (iRes.data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const crit = unwrapFeedRelation(
      r.criterion as { title: string; is_critical: boolean } | { title: string; is_critical: boolean }[]
    );
    return {
      id: String(r.id),
      points_awarded: Number(r.points_awarded) || 0,
      max_points: Number(r.max_points) || 0,
      comment: (r.comment as string | null) ?? null,
      criterion: crit
        ? { title: crit.title, is_critical: Boolean(crit.is_critical) }
        : null,
    };
  });

  return {
    session: sessionNorm,
    items: itemsNorm,
    staff: (stRes.data ?? []).map((r) => {
      const row = r as { staff_id: string; role: string };
      return { ...row, full_name: nameMap[row.staff_id] ?? null };
    }),
    media: (mRes.data ?? []) as {
      id: string;
      media_type: string;
      url: string;
      caption: string | null;
      session_item_id: string | null;
    }[],
  };
}

export type CriterionScoreInput = {
  criterionId: string;
  pointsAwarded: number;
  maxPoints: number;
  weight: number;
  comment?: string;
};

export async function createAndSubmitAuditSession(params: {
  organizationId: string;
  categoryId: string;
  auditorStaffId: string;
  areaNote?: string;
  staffIds: string[];
  criterionScores: CriterionScoreInput[];
  mediaUrls: {
    url: string;
    mediaType: 'image' | 'video';
    caption?: string;
    criterionId: string;
  }[];
}): Promise<{ sessionId?: string; sessionScore?: number; error?: string }> {
  const ym = monthKey();
  const { data: sess, error: sessErr } = await supabase
    .from('audit_sessions')
    .insert({
      organization_id: params.organizationId,
      category_id: params.categoryId,
      auditor_staff_id: params.auditorStaffId,
      status: 'draft',
      area_note: params.areaNote?.trim() || null,
      month_key: ym,
    })
    .select('id')
    .single();

  if (sessErr || !sess) return { error: sessErr?.message ?? 'Oturum oluşturulamadı' };
  const sessionId = sess.id as string;

  const itemIdByCriterion = new Map<string, string>();
  if (params.criterionScores.length) {
    const { data: insertedItems, error: itemsErr } = await supabase
      .from('audit_session_items')
      .insert(
        params.criterionScores.map((c) => ({
          session_id: sessionId,
          criterion_id: c.criterionId,
          points_awarded: c.pointsAwarded,
          max_points: c.maxPoints,
          weight: c.weight,
          comment: c.comment?.trim() || null,
        }))
      )
      .select('id, criterion_id');
    if (itemsErr) return { error: itemsErr.message };
    for (const row of insertedItems ?? []) {
      const r = row as { id: string; criterion_id: string };
      itemIdByCriterion.set(r.criterion_id, r.id);
    }
  }

  if (params.staffIds.length) {
    const { error: stErr } = await supabase.from('audit_session_staff').insert(
      params.staffIds.map((id, i) => ({
        session_id: sessionId,
        staff_id: id,
        role: i === 0 ? 'responsible' : 'assistant',
      }))
    );
    if (stErr) return { error: stErr.message };
  }

  if (params.mediaUrls.length) {
    const { error: medErr } = await supabase.from('audit_session_media').insert(
      params.mediaUrls.map((m, i) => ({
        session_id: sessionId,
        session_item_id: itemIdByCriterion.get(m.criterionId) ?? null,
        media_type: m.mediaType,
        url: m.url,
        caption: m.caption?.trim() || null,
        sort_order: i,
      }))
    );
    if (medErr) return { error: medErr.message };
  }

  const { data: submitData, error: submitErr } = await supabase.rpc('submit_audit_session', {
    p_session_id: sessionId,
  });
  if (submitErr) return { error: submitErr.message };

  const result = submitData as { session_score?: number } | null;
  return { sessionId, sessionScore: result?.session_score };
}

export async function fetchStaffAuditSummary(staffId: string): Promise<{
  evaluationAudit: number | null;
  belowThreshold: boolean;
  recent: StaffAuditRecentRow[];
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_staff_audit_summary', { p_staff_id: staffId });
  if (error) {
    return { evaluationAudit: null, belowThreshold: false, recent: [], error: error.message };
  }
  const p = data as {
    evaluation_audit?: number | null;
    below_threshold?: boolean;
    recent?: StaffAuditRecentRow[];
  } | null;
  return {
    evaluationAudit: p?.evaluation_audit ?? null,
    belowThreshold: !!p?.below_threshold,
    recent: p?.recent ?? [],
  };
}

export async function upsertAuditCategory(params: {
  organizationId: string;
  name: string;
  slug: string;
  icon?: string;
  id?: string;
}): Promise<{ id?: string; error?: string }> {
  const slug = params.slug.trim().toLowerCase().replace(/\s+/g, '_');
  if (params.id) {
    const { error } = await supabase
      .from('audit_categories')
      .update({
        name: params.name.trim(),
        slug,
        icon: params.icon ?? 'layers-outline',
      })
      .eq('id', params.id);
    return error ? { error: error.message } : { id: params.id };
  }
  const { data, error } = await supabase
    .from('audit_categories')
    .insert({
      organization_id: params.organizationId,
      name: params.name.trim(),
      slug,
      icon: params.icon ?? 'layers-outline',
      sort_order: 500,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { id: data?.id as string };
}

export async function upsertAuditCriterion(params: {
  categoryId: string;
  title: string;
  maxPoints: number;
  id?: string;
  isCritical?: boolean;
}): Promise<{ error?: string }> {
  if (params.id) {
    const { error } = await supabase
      .from('audit_criteria')
      .update({
        title: params.title.trim(),
        max_points: params.maxPoints,
        is_critical: params.isCritical ?? false,
      })
      .eq('id', params.id);
    return error ? { error: error.message } : {};
  }
  const { error } = await supabase.from('audit_criteria').insert({
    category_id: params.categoryId,
    title: params.title.trim(),
    max_points: params.maxPoints,
    weight: 1,
    is_critical: params.isCritical ?? false,
    sort_order: 500,
  });
  return error ? { error: error.message } : {};
}
