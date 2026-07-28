import { supabase } from '@/lib/supabase';
import { normalizeGuestDocumentNumber } from '@/lib/kbsGuestDocumentIdentity';

export type KbsGuestNoteTag = 'info' | 'good' | 'problematic' | 'incident' | 'vip';

export type KbsGuestNote = {
  id: string;
  hotel_id: string;
  guest_id: string;
  guest_document_id: string | null;
  document_number: string | null;
  tag: KbsGuestNoteTag;
  body: string;
  created_by_auth_id: string | null;
  created_by_staff_name: string | null;
  created_at: string;
  updated_at: string;
};

export const KBS_GUEST_NOTE_TAG_META: Record<
  KbsGuestNoteTag,
  { label: string; color: string; bg: string; icon: string }
> = {
  info: { label: 'Bilgi', color: '#475569', bg: '#f1f5f9', icon: 'information-circle-outline' },
  good: { label: 'İyi müşteri', color: '#047857', bg: '#ecfdf5', icon: 'happy-outline' },
  problematic: { label: 'Sorunlu', color: '#b45309', bg: '#fff7ed', icon: 'warning-outline' },
  incident: { label: 'Olay', color: '#b91c1c', bg: '#fef2f2', icon: 'alert-circle-outline' },
  vip: { label: 'VIP', color: '#6d28d9', bg: '#f5f3ff', icon: 'star-outline' },
};

export type KbsGuestNoteSummary = {
  guestId: string;
  documentNumber: string | null;
  count: number;
  latestTag: KbsGuestNoteTag;
  latestBody: string;
  hasAttention: boolean;
  tags: KbsGuestNoteTag[];
};

function isNoteTag(v: unknown): v is KbsGuestNoteTag {
  return v === 'info' || v === 'good' || v === 'problematic' || v === 'incident' || v === 'vip';
}

function mapNote(row: Record<string, unknown>): KbsGuestNote {
  return {
    id: String(row.id),
    hotel_id: String(row.hotel_id),
    guest_id: String(row.guest_id),
    guest_document_id: row.guest_document_id ? String(row.guest_document_id) : null,
    document_number: row.document_number ? String(row.document_number) : null,
    tag: isNoteTag(row.tag) ? row.tag : 'info',
    body: String(row.body ?? ''),
    created_by_auth_id: row.created_by_auth_id ? String(row.created_by_auth_id) : null,
    created_by_staff_name: row.created_by_staff_name ? String(row.created_by_staff_name) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Misafir + belge no ile notları getir (yeniden gelen için belge no yedek eşleşme). */
export async function fetchKbsGuestNotes(opts: {
  guestId: string;
  hotelId?: string | null;
  documentNumber?: string | null;
  limit?: number;
}): Promise<KbsGuestNote[]> {
  const limit = opts.limit ?? 50;
  const docNo = normalizeGuestDocumentNumber(opts.documentNumber);
  const seen = new Set<string>();
  const out: KbsGuestNote[] = [];

  const collect = (rows: unknown[] | null) => {
    for (const raw of rows ?? []) {
      const note = mapNote(raw as Record<string, unknown>);
      if (seen.has(note.id)) continue;
      seen.add(note.id);
      out.push(note);
    }
  };

  let byGuest = supabase
    .schema('ops')
    .from('guest_notes')
    .select(
      'id, hotel_id, guest_id, guest_document_id, document_number, tag, body, created_by_auth_id, created_by_staff_name, created_at, updated_at'
    )
    .eq('guest_id', opts.guestId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.hotelId) byGuest = byGuest.eq('hotel_id', opts.hotelId);

  const guestRes = await byGuest;
  if (guestRes.error) throw new Error(guestRes.error.message);
  collect(guestRes.data);

  if (docNo) {
    let byDoc = supabase
      .schema('ops')
      .from('guest_notes')
      .select(
        'id, hotel_id, guest_id, guest_document_id, document_number, tag, body, created_by_auth_id, created_by_staff_name, created_at, updated_at'
      )
      .ilike('document_number', docNo)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (opts.hotelId) byDoc = byDoc.eq('hotel_id', opts.hotelId);
    const docRes = await byDoc;
    if (docRes.error) throw new Error(docRes.error.message);
    collect(docRes.data);
  }

  out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return out.slice(0, limit);
}

/** Liste için özet: guest_id → not özeti (batch). */
export async function fetchKbsGuestNoteSummaries(opts: {
  guestIds: string[];
  hotelIds?: string[] | null;
}): Promise<Map<string, KbsGuestNoteSummary>> {
  const map = new Map<string, KbsGuestNoteSummary>();
  const guestIds = [...new Set(opts.guestIds.filter(Boolean))];
  if (guestIds.length === 0) return map;

  // PostgREST URL limiti için parçala
  const chunkSize = 80;
  const allRows: KbsGuestNote[] = [];

  for (let i = 0; i < guestIds.length; i += chunkSize) {
    const chunk = guestIds.slice(i, i + chunkSize);
    let query = supabase
      .schema('ops')
      .from('guest_notes')
      .select('id, hotel_id, guest_id, guest_document_id, document_number, tag, body, created_by_auth_id, created_by_staff_name, created_at, updated_at')
      .in('guest_id', chunk)
      .order('created_at', { ascending: false })
      .limit(500);

    if (opts.hotelIds?.length) query = query.in('hotel_id', opts.hotelIds);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    for (const raw of data ?? []) {
      allRows.push(mapNote(raw as Record<string, unknown>));
    }
  }

  const byGuest = new Map<string, KbsGuestNote[]>();
  for (const note of allRows) {
    const list = byGuest.get(note.guest_id) ?? [];
    list.push(note);
    byGuest.set(note.guest_id, list);
  }

  for (const [guestId, notes] of byGuest) {
    map.set(guestId, buildSummary(guestId, notes));
  }

  return map;
}

/** Belge no ile özet ara (liste satırı için). */
export function noteSummaryForRow(
  summariesByGuest: Map<string, KbsGuestNoteSummary>,
  guestId: string
): KbsGuestNoteSummary | null {
  return summariesByGuest.get(guestId) ?? null;
}

function buildSummary(guestId: string, notes: KbsGuestNote[]): KbsGuestNoteSummary {
  const sorted = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const tags = [...new Set(sorted.map((n) => n.tag))];
  const latest = sorted[0]!;
  return {
    guestId,
    documentNumber: latest.document_number,
    count: notes.length,
    latestTag: latest.tag,
    latestBody: latest.body,
    hasAttention: tags.some((t) => t === 'problematic' || t === 'incident'),
    tags,
  };
}

export async function createKbsGuestNote(input: {
  hotelId: string;
  guestId: string;
  guestDocumentId?: string | null;
  documentNumber?: string | null;
  tag: KbsGuestNoteTag;
  body: string;
  createdByAuthId?: string | null;
  createdByStaffName?: string | null;
}): Promise<{ ok: true; note: KbsGuestNote } | { ok: false; message: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, message: 'Not boş olamaz' };
  if (body.length > 4000) return { ok: false, message: 'Not çok uzun (max 4000)' };

  const { data, error } = await supabase
    .schema('ops')
    .from('guest_notes')
    .insert({
      hotel_id: input.hotelId,
      guest_id: input.guestId,
      guest_document_id: input.guestDocumentId ?? null,
      document_number: normalizeGuestDocumentNumber(input.documentNumber),
      tag: input.tag,
      body,
      created_by_auth_id: input.createdByAuthId ?? null,
      created_by_staff_name: input.createdByStaffName?.trim() || null,
    })
    .select(
      'id, hotel_id, guest_id, guest_document_id, document_number, tag, body, created_by_auth_id, created_by_staff_name, created_at, updated_at'
    )
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, note: mapNote(data as Record<string, unknown>) };
}

export async function deleteKbsGuestNote(
  noteId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.schema('ops').from('guest_notes').delete().eq('id', noteId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export function formatKbsNoteTime(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
