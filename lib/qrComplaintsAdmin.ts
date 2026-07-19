import { supabase } from '@/lib/supabase';

export type QrComplaintMedia = {
  url: string;
  type: 'image' | 'video';
  mime?: string;
  name?: string;
};

export type AdminQrComplaintRow = {
  id: string;
  topic_type: 'complaint' | 'suggestion' | 'thanks';
  category: string;
  description: string;
  contact_name: string | null;
  phone: string | null;
  room_number: string | null;
  media_urls: QrComplaintMedia[];
  status: string;
  admin_note: string | null;
  organization_id: string | null;
  created_at: string;
};

function normalizeMedia(raw: unknown): QrComplaintMedia[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const url = typeof row.url === 'string' ? row.url : '';
      if (!url) return null;
      const type = row.type === 'video' ? 'video' : 'image';
      return {
        url,
        type,
        mime: typeof row.mime === 'string' ? row.mime : undefined,
        name: typeof row.name === 'string' ? row.name : undefined,
      } satisfies QrComplaintMedia;
    })
    .filter(Boolean) as QrComplaintMedia[];
}

export async function fetchAdminQrComplaints(opts: {
  statusFilter?: string;
  orgScoped?: string | null;
}): Promise<{ rows: AdminQrComplaintRow[]; error?: string }> {
  let query = supabase
    .from('qr_complaints')
    .select(
      'id, topic_type, category, description, contact_name, phone, room_number, media_urls, status, admin_note, organization_id, created_at'
    )
    .order('created_at', { ascending: false });

  if (opts.statusFilter && opts.statusFilter !== 'all') {
    query = query.eq('status', opts.statusFilter);
  }
  if (opts.orgScoped) {
    query = query.eq('organization_id', opts.orgScoped);
  }

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };

  const rows = (data ?? []).map((row) => ({
    ...(row as Omit<AdminQrComplaintRow, 'media_urls'>),
    media_urls: normalizeMedia((row as { media_urls?: unknown }).media_urls),
  }));

  return { rows };
}

export async function countPendingQrComplaints(orgScoped?: string | null): Promise<number> {
  let query = supabase
    .from('qr_complaints')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (orgScoped) {
    query = query.eq('organization_id', orgScoped);
  }

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}
