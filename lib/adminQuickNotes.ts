import { supabase } from '@/lib/supabase';
import { invalidateAdminQuickNotesListCache } from '@/lib/adminQuickNotesCache';
import { sleepMs } from '@/lib/supabaseTransientErrors';

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
  /** Liste sorgusunda kapak medyası dışındaki ek sayısı */
  media_count?: number;
  creator?: { full_name: string | null; role: string | null } | null;
};

const LIST_NOTES_SELECT = `
  id, organization_id, note_number, title, body_text, tag, room_label,
  is_pinned, is_archived, created_by_staff_id, created_at, updated_at,
  creator:staff!admin_quick_notes_created_by_staff_id_fkey(full_name, role)
`;

const LIST_MEDIA_SELECT = 'note_id, media_type, public_url, thumbnail_url, sort_order';

const NOTE_SELECT = `
  id, organization_id, note_number, title, body_text, tag, room_label,
  is_pinned, is_archived, created_by_staff_id, created_at, updated_at,
  media:admin_quick_note_media(id, note_id, media_type, storage_path, public_url, thumbnail_url, sort_order, created_at),
  creator:staff!admin_quick_notes_created_by_staff_id_fkey(full_name, role)
`;

const LIST_PAGE_SIZE = 120;
const NOTE_INSERT_MAX_ATTEMPTS = 3;

function isDuplicateNoteNumberError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  const m = (error.message ?? '').toLowerCase();
  return m.includes('duplicate') && m.includes('note_number');
}

type InsertedNoteRow = { id: string; note_number: string };

async function insertAdminQuickNoteRow(params: {
  organizationId: string;
  staffId: string;
  bodyText: string;
  title?: string | null;
  tag?: AdminNoteTag;
  roomLabel?: string | null;
}): Promise<{ data: InsertedNoteRow | null; error: string | null }> {
  let lastError: string | null = null;
  for (let attempt = 0; attempt < NOTE_INSERT_MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase
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

    if (!error && data) return { data: data as InsertedNoteRow, error: null };

    lastError = error?.message ?? 'Not oluşturulamadı';
    if (!isDuplicateNoteNumberError(error) || attempt >= NOTE_INSERT_MAX_ATTEMPTS - 1) {
      return { data: null, error: lastError };
    }
    await sleepMs(80 * (attempt + 1));
  }
  return { data: null, error: lastError ?? 'Not oluşturulamadı' };
}

type ListNoteMediaRow = {
  note_id: string;
  media_type: 'image' | 'video';
  public_url: string;
  thumbnail_url: string | null;
  sort_order: number;
};

function listMediaRowToNoteMedia(m: ListNoteMediaRow, noteId: string): AdminQuickNoteMediaRow {
  return {
    id: `${noteId}-${m.sort_order}`,
    note_id: noteId,
    media_type: m.media_type,
    storage_path: '',
    public_url: m.public_url,
    thumbnail_url: m.thumbnail_url,
    sort_order: m.sort_order,
    created_at: '',
  };
}

function attachListCoverMedia(
  notes: AdminQuickNoteRow[],
  mediaRows: ListNoteMediaRow[] | null
): AdminQuickNoteRow[] {
  if (!mediaRows?.length) {
    return notes.map((n) => ({ ...n, media: [], media_count: 0 }));
  }

  const byNote = new Map<string, ListNoteMediaRow[]>();
  for (const m of mediaRows) {
    const list = byNote.get(m.note_id) ?? [];
    list.push(m);
    byNote.set(m.note_id, list);
  }

  return notes.map((n) => {
    const sorted = (byNote.get(n.id) ?? []).sort((a, b) => a.sort_order - b.sort_order);
    const thumb = sorted.find((m) => m.media_type === 'image') ?? sorted[0];
    return {
      ...n,
      media_count: sorted.length,
      media: thumb ? [listMediaRowToNoteMedia(thumb, n.id)] : [],
    };
  });
}

/** Notlar + kapak medyası (gömülü join yerine iki sorgu — liste ekranı hızlı açılır). */
export async function listAdminQuickNotes(params?: {
  includeArchived?: boolean;
  search?: string;
}): Promise<{ data: AdminQuickNoteRow[]; error: string | null }> {
  let q = supabase
    .from('admin_quick_notes')
    .select(LIST_NOTES_SELECT)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(LIST_PAGE_SIZE);

  if (!params?.includeArchived) {
    q = q.eq('is_archived', false);
  }

  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  const rows = (data ?? []) as AdminQuickNoteRow[];
  if (rows.length === 0) return { data: [], error: null };

  const ids = rows.map((n) => n.id);
  const { data: media, error: mediaErr } = await supabase
    .from('admin_quick_note_media')
    .select(LIST_MEDIA_SELECT)
    .in('note_id', ids)
    .order('sort_order', { ascending: true });

  let withMedia = attachListCoverMedia(rows, mediaErr ? null : ((media ?? []) as ListNoteMediaRow[]));

  const term = params?.search?.trim().toLowerCase();
  if (term) {
    withMedia = withMedia.filter(
      (n) =>
        n.note_number.toLowerCase().includes(term) ||
        (n.title ?? '').toLowerCase().includes(term) ||
        n.body_text.toLowerCase().includes(term) ||
        (n.room_label ?? '').toLowerCase().includes(term) ||
        (n.creator?.full_name ?? '').toLowerCase().includes(term)
    );
  }
  return { data: withMedia, error: mediaErr?.message ?? null };
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
  const { data: note, error } = await insertAdminQuickNoteRow({
    organizationId: params.organizationId,
    staffId: params.staffId,
    bodyText: params.bodyText,
    title: params.title,
    tag: params.tag,
    roomLabel: params.roomLabel,
  });

  if (error || !note) return { data: null, error: error ?? 'Not oluşturulamadı' };

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

  invalidateAdminQuickNotesListCache();
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
  if (!error) invalidateAdminQuickNotesListCache();
  return { error: error?.message ?? null };
}

export async function deleteAdminQuickNoteMedia(mediaIds: string[]): Promise<{ error: string | null }> {
  if (!mediaIds.length) return { error: null };
  const { error } = await supabase.from('admin_quick_note_media').delete().in('id', mediaIds);
  return { error: error?.message ?? null };
}

export async function saveAdminQuickNoteEdit(params: {
  noteId: string;
  bodyText: string;
  title?: string | null;
  tag?: AdminNoteTag;
  roomLabel?: string | null;
  removedMediaIds?: string[];
  newMedia?: Array<{
    storagePath: string;
    publicUrl: string;
    mediaType: 'image' | 'video';
    thumbnailUrl?: string | null;
    sortOrder: number;
  }>;
}): Promise<{ data: AdminQuickNoteRow | null; error: string | null }> {
  const { error } = await updateAdminQuickNote(params.noteId, {
    bodyText: params.bodyText,
    title: params.title,
    tag: params.tag,
    roomLabel: params.roomLabel,
  });
  if (error) return { data: null, error };

  if (params.removedMediaIds?.length) {
    const { error: delErr } = await deleteAdminQuickNoteMedia(params.removedMediaIds);
    if (delErr) return { data: null, error: delErr };
  }

  if (params.newMedia?.length) {
    const { error: mediaErr } = await supabase.from('admin_quick_note_media').insert(
      params.newMedia.map((m) => ({
        note_id: params.noteId,
        media_type: m.mediaType,
        storage_path: m.storagePath,
        public_url: m.publicUrl,
        thumbnail_url: m.thumbnailUrl ?? null,
        sort_order: m.sortOrder,
      }))
    );
    if (mediaErr) return { data: null, error: mediaErr.message };
  }

  invalidateAdminQuickNotesListCache();
  return getAdminQuickNote(params.noteId);
}

export async function deleteAdminQuickNote(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('admin_quick_notes').delete().eq('id', id);
  if (!error) invalidateAdminQuickNotesListCache();
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
