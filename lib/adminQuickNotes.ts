import { supabase } from '@/lib/supabase';

export type AdminNoteTag = 'general' | 'room' | 'staff' | 'guest' | 'urgent';

export const ADMIN_NOTE_TAG_LABELS: Record<AdminNoteTag, string> = {
  general: 'Genel',
  room: 'Oda',
  staff: 'Personel',
  guest: 'Misafir',
  urgent: 'Acil',
};

export const ADMIN_NOTE_TAG_COLORS: Record<AdminNoteTag, { bg: string; text: string }> = {
  general: { bg: '#EEF2FF', text: '#4F46E5' },
  room: { bg: '#ECFEFF', text: '#0891B2' },
  staff: { bg: '#F0FDF4', text: '#059669' },
  guest: { bg: '#FFF7ED', text: '#EA580C' },
  urgent: { bg: '#FEF2F2', text: '#DC2626' },
};

export type AdminQuickNoteMediaRow = {
  id: string;
  note_id: string;
  media_type: 'image' | 'video';
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_at: string;
};

export type AdminQuickNoteRow = {
  id: string;
  organization_id: string;
  note_number: string;
  title: string | null;
  body_text: string;
  tag: AdminNoteTag;
  room_label: string | null;
  is_pinned: boolean;
  is_archived: boolean;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
  media?: AdminQuickNoteMediaRow[];
  creator?: { full_name: string | null; role: string | null } | null;
};

const NOTE_SELECT = `
  id, organization_id, note_number, title, body_text, tag, room_label,
  is_pinned, is_archived, created_by_staff_id, created_at, updated_at,
  media:admin_quick_note_media(id, note_id, media_type, storage_path, public_url, thumbnail_url, sort_order, created_at),
  creator:staff!admin_quick_notes_created_by_staff_id_fkey(full_name, role)
`;

export async function listAdminQuickNotes(params?: {
  includeArchived?: boolean;
  search?: string;
}): Promise<{ data: AdminQuickNoteRow[]; error: string | null }> {
  let q = supabase
    .from('admin_quick_notes')
    .select(NOTE_SELECT)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (!params?.includeArchived) {
    q = q.eq('is_archived', false);
  }

  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  let rows = (data ?? []) as AdminQuickNoteRow[];
  const term = params?.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter(
      (n) =>
        n.note_number.toLowerCase().includes(term) ||
        (n.title ?? '').toLowerCase().includes(term) ||
        n.body_text.toLowerCase().includes(term) ||
        (n.room_label ?? '').toLowerCase().includes(term)
    );
  }
  return { data: rows, error: null };
}

export async function getAdminQuickNote(id: string): Promise<{ data: AdminQuickNoteRow | null; error: string | null }> {
  const { data, error } = await supabase.from('admin_quick_notes').select(NOTE_SELECT).eq('id', id).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as AdminQuickNoteRow) ?? null, error: null };
}

export async function createAdminQuickNote(params: {
  organizationId: string;
  staffId: string;
  bodyText: string;
  title?: string | null;
  tag?: AdminNoteTag;
  roomLabel?: string | null;
  media?: Array<{
    storagePath: string;
    publicUrl: string;
    mediaType: 'image' | 'video';
    thumbnailUrl?: string | null;
    sortOrder: number;
  }>;
}): Promise<{ data: AdminQuickNoteRow | null; error: string | null }> {
  const { data: note, error } = await supabase
    .from('admin_quick_notes')
    .insert({
      organization_id: params.organizationId,
      created_by_staff_id: params.staffId,
      body_text: params.bodyText,
      title: params.title?.trim() || null,
      tag: params.tag ?? 'general',
      room_label: params.roomLabel?.trim() || null,
    })
    .select('id, note_number')
    .single();

  if (error || !note) return { data: null, error: error?.message ?? 'Not oluşturulamadı' };

  if (params.media?.length) {
    const { error: mediaErr } = await supabase.from('admin_quick_note_media').insert(
      params.media.map((m) => ({
        note_id: note.id,
        media_type: m.mediaType,
        storage_path: m.storagePath,
        public_url: m.publicUrl,
        thumbnail_url: m.thumbnailUrl ?? null,
        sort_order: m.sortOrder,
      }))
    );
    if (mediaErr) return { data: null, error: mediaErr.message };
  }

  return getAdminQuickNote(note.id);
}

export async function updateAdminQuickNote(
  id: string,
  patch: Partial<{
    bodyText: string;
    title: string | null;
    tag: AdminNoteTag;
    roomLabel: string | null;
    isPinned: boolean;
    isArchived: boolean;
  }>
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (patch.bodyText !== undefined) payload.body_text = patch.bodyText;
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.tag !== undefined) payload.tag = patch.tag;
  if (patch.roomLabel !== undefined) payload.room_label = patch.roomLabel;
  if (patch.isPinned !== undefined) payload.is_pinned = patch.isPinned;
  if (patch.isArchived !== undefined) payload.is_archived = patch.isArchived;

  const { error } = await supabase.from('admin_quick_notes').update(payload).eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteAdminQuickNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('admin_quick_notes').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export function adminNotePreview(body: string, max = 120): string {
  const t = body.replace(/\s+/g, ' ').trim();
  if (!t) return 'Boş not';
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function isStaffAuthoredQuickNote(note: AdminQuickNoteRow): boolean {
  return note.creator?.role != null && note.creator.role !== 'admin';
}

export function quickNoteAuthorLabel(note: AdminQuickNoteRow): string {
  if (note.creator?.role === 'admin') return 'Yönetici';
  return note.creator?.full_name?.trim() || 'Personel';
}

export function adminNoteDisplayTitle(note: AdminQuickNoteRow): string {
  return note.title?.trim() || adminNotePreview(note.body_text, 60);
}
