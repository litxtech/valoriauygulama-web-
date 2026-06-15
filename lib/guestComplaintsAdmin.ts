import { supabase } from '@/lib/supabase';

export type AdminGuestComplaintRow = {
  id: string;
  topic_type: 'complaint' | 'suggestion' | 'thanks';
  category: string;
  description: string;
  phone: string | null;
  room_number: string | null;
  image_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  guest_id: string;
  organization_id?: string | null;
  guests: {
    id: string;
    full_name: string | null;
    photo_url: string | null;
    organization_id?: string | null;
  } | null;
};

const BASE_SELECT =
  'id, topic_type, category, description, phone, room_number, image_url, status, admin_note, created_at, guest_id, guests(id, full_name, photo_url, organization_id)';

const BASE_SELECT_WITH_ORG =
  `${BASE_SELECT.replace('guest_id,', 'guest_id, organization_id,')}`;

export function guestComplaintMatchesOrg(row: AdminGuestComplaintRow, orgId: string): boolean {
  const guestOrg = row.guests?.organization_id ?? null;
  const complaintOrg = row.organization_id ?? null;
  return guestOrg === orgId || complaintOrg === orgId;
}

export async function fetchAdminGuestComplaints(opts: {
  statusFilter?: string;
  orgScoped?: string | null;
}): Promise<{ rows: AdminGuestComplaintRow[]; error?: string }> {
  const runQuery = async (select: string, withComplaintOrgColumn: boolean) => {
    let query = supabase.from('guest_complaints').select(select).order('created_at', { ascending: false });
    if (opts.statusFilter && opts.statusFilter !== 'all') {
      query = query.eq('status', opts.statusFilter);
    }
    if (opts.orgScoped) {
      const orgId = opts.orgScoped;
      if (withComplaintOrgColumn) {
        query = query.or(`organization_id.eq.${orgId},guests.organization_id.eq.${orgId}`);
      } else {
        query = query.eq('guests.organization_id', orgId);
      }
    }
    return query;
  };

  let result = await runQuery(BASE_SELECT_WITH_ORG, true);
  if (result.error?.message?.includes('organization_id')) {
    result = await runQuery(BASE_SELECT, false);
  }

  if (result.error) {
    return { rows: [], error: result.error.message };
  }

  let rows = (result.data ?? []) as AdminGuestComplaintRow[];
  if (opts.orgScoped) {
    rows = rows.filter((row) => guestComplaintMatchesOrg(row, opts.orgScoped!));
  }

  return { rows };
}

export async function countPendingGuestComplaints(orgScoped?: string | null): Promise<number> {
  let query = supabase
    .from('guest_complaints')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  if (orgScoped) {
    query = query.eq('organization_id', orgScoped);
  }

  const { count, error } = await query;
  if (!error) return count ?? 0;

  if (orgScoped && error.message?.includes('organization_id')) {
    const fallback = await supabase
      .from('guest_complaints')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    return fallback.count ?? 0;
  }

  return 0;
}
