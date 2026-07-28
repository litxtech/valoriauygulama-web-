/**
 * Valoria — Personel Denetim ve Performans Sistemi (tek puan).
 */
import { supabase } from '@/lib/supabase';
import { getPerfBand, type PerfBand } from '@/lib/staffPerfBands';

export const STAFF_PERF_MEDIA_BUCKET = 'audit-media';

export type StaffPerfCategory = {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

export type StaffPerfCriterion = {
  id: string;
  category_id: string;
  title: string;
  description: string | null;
  default_delta: number;
  sort_order: number;
  is_active: boolean;
};

export type StaffPerfEvent = {
  id: string;
  organization_id: string;
  staff_id: string;
  category_id: string | null;
  criterion_id: string | null;
  auditor_staff_id: string;
  report_number: string;
  title: string;
  note: string | null;
  delta_points: number;
  score_before: number;
  score_after: number;
  conducted_at: string;
  photo_urls: string[];
  video_urls: string[];
  evidence_urls: string[];
  signature_data: string | null;
  signature_name: string | null;
  created_at: string;
};

export type StaffPerfScoreLog = {
  id: string;
  organization_id: string;
  staff_id: string;
  event_id: string | null;
  auditor_staff_id: string | null;
  score_before: number;
  score_after: number;
  delta_points: number;
  reason: string;
  logged_at: string;
};

export type StaffPerfBoardRow = {
  staff_id: string;
  full_name: string | null;
  department: string | null;
  role: string | null;
  profile_image: string | null;
  performance_score: number;
  performance_score_updated_at: string | null;
  event_count: number;
  positive_count: number;
  negative_count: number;
};

export type StaffPerfDossier = {
  staff: Record<string, unknown>;
  events: StaffPerfEvent[];
  score_log: StaffPerfScoreLog[];
  ai_evaluations: Record<string, unknown>[];
  warnings: Record<string, unknown>[];
  salary_history: Record<string, unknown>[];
};

export type ApplyPerfEventResult = {
  event_id: string;
  report_number: string;
  score_before: number;
  score_after: number;
  delta_points: number;
};

export async function ensureStaffPerfDefaults(orgId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('seed_staff_perf_defaults_for_org', { p_org_id: orgId });
  if (error) return { error: error.message };
  return {};
}

export async function fetchStaffPerfCategories(orgId: string): Promise<{
  data: StaffPerfCategory[];
  error?: string;
}> {
  const seed = await ensureStaffPerfDefaults(orgId);
  if (seed.error) return { data: [], error: seed.error };
  const { data, error } = await supabase
    .from('staff_perf_categories')
    .select('id, organization_id, slug, name, icon, sort_order, is_active')
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as StaffPerfCategory[] };
}

export async function fetchStaffPerfCriteria(categoryId: string): Promise<{
  data: StaffPerfCriterion[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('staff_perf_criteria')
    .select('id, category_id, title, description, default_delta, sort_order, is_active')
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('sort_order');
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as StaffPerfCriterion[] };
}

export async function fetchStaffPerfBoard(orgId: string): Promise<{
  data: StaffPerfBoardRow[];
  error?: string;
}> {
  const seed = await ensureStaffPerfDefaults(orgId);
  if (seed.error) return { data: [], error: seed.error };
  const { data, error } = await supabase.rpc('get_organization_staff_perf_board', {
    p_organization_id: orgId,
  });
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as StaffPerfBoardRow[] };
}

export async function fetchStaffPerfDossier(staffId: string): Promise<{
  data: StaffPerfDossier | null;
  error?: string;
}> {
  const { data, error } = await supabase.rpc('get_staff_perf_dossier', { p_staff_id: staffId });
  if (error) return { data: null, error: error.message };
  if (!data) return { data: null };
  const raw = data as StaffPerfDossier;
  return {
    data: {
      staff: raw.staff ?? {},
      events: (raw.events ?? []) as StaffPerfEvent[],
      score_log: (raw.score_log ?? []) as StaffPerfScoreLog[],
      ai_evaluations: raw.ai_evaluations ?? [],
      warnings: raw.warnings ?? [],
      salary_history: raw.salary_history ?? [],
    },
  };
}

export async function fetchStaffPerfEvents(staffId: string, limit = 50): Promise<{
  data: StaffPerfEvent[];
  error?: string;
}> {
  const { data, error } = await supabase
    .from('staff_perf_events')
    .select('*')
    .eq('staff_id', staffId)
    .order('conducted_at', { ascending: false })
    .limit(limit);
  if (error) return { data: [], error: error.message };
  return { data: (data ?? []) as StaffPerfEvent[] };
}

export async function applyStaffPerfEvent(params: {
  organizationId: string;
  staffId: string;
  auditorStaffId: string;
  title: string;
  deltaPoints: number;
  note?: string | null;
  categoryId?: string | null;
  criterionId?: string | null;
  conductedAt?: string | null;
  photoUrls?: string[];
  videoUrls?: string[];
  evidenceUrls?: string[];
  signatureData?: string | null;
  signatureName?: string | null;
}): Promise<{ data: ApplyPerfEventResult | null; error?: string }> {
  const { data, error } = await supabase.rpc('apply_staff_perf_event', {
    p_organization_id: params.organizationId,
    p_staff_id: params.staffId,
    p_auditor_staff_id: params.auditorStaffId,
    p_title: params.title.trim(),
    p_delta_points: params.deltaPoints,
    p_note: params.note?.trim() || null,
    p_category_id: params.categoryId ?? null,
    p_criterion_id: params.criterionId ?? null,
    p_conducted_at: params.conductedAt ?? new Date().toISOString(),
    p_photo_urls: params.photoUrls ?? [],
    p_video_urls: params.videoUrls ?? [],
    p_evidence_urls: params.evidenceUrls ?? [],
    p_signature_data: params.signatureData ?? null,
    p_signature_name: params.signatureName ?? null,
  });
  if (error) return { data: null, error: error.message };
  return { data: data as ApplyPerfEventResult };
}

export function scoreSummary(score: number): { band: PerfBand; label: string; color: string } {
  const band = getPerfBand(score);
  return { band, label: band.labelTr, color: band.color };
}

export async function updateStaffDossierFields(
  staffId: string,
  fields: Partial<{
    family_mother: string | null;
    family_father: string | null;
    family_spouse: string | null;
    family_children: string | null;
    education_detail: string | null;
    certificates_detail: string | null;
    dossier_notes: string | null;
    address: string | null;
    phone: string | null;
    achievements: string | null;
  }>
): Promise<{ error?: string }> {
  const { error } = await supabase.from('staff').update(fields).eq('id', staffId);
  return error ? { error: error.message } : {};
}
