import { supabase } from '@/lib/supabase';
import type { GuestServiceRequestStatus, GuestServiceRequestType } from '@/lib/guestServiceRequestsI18n';

export type GuestServiceRequestRow = {
  id: string;
  guest_id: string;
  organization_id: string | null;
  request_type: GuestServiceRequestType;
  description: string;
  room_number: string | null;
  image_url: string | null;
  status: GuestServiceRequestStatus;
  staff_note: string | null;
  handled_by_staff_id: string | null;
  handled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateGuestServiceRequestInput = {
  guestId: string;
  organizationId?: string | null;
  requestType: GuestServiceRequestType;
  description: string;
  roomNumber?: string | null;
  imageUrl?: string | null;
};

export async function fetchMyGuestServiceRequests(): Promise<GuestServiceRequestRow[]> {
  const { data, error } = await supabase
    .from('guest_service_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GuestServiceRequestRow[];
}

export async function createGuestServiceRequest(input: CreateGuestServiceRequestInput): Promise<string> {
  const payload = {
    guest_id: input.guestId,
    organization_id: input.organizationId ?? null,
    request_type: input.requestType,
    description: input.description.trim(),
    room_number: input.roomNumber?.trim() || null,
    image_url: input.imageUrl ?? null,
  };
  let { data, error } = await supabase.from('guest_service_requests').insert(payload).select('id').single();
  if (error?.message?.includes('organization_id')) {
    const { organization_id: _o, ...withoutOrg } = payload;
    ({ data, error } = await supabase.from('guest_service_requests').insert(withoutOrg).select('id').single());
  }
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function fetchStaffGuestServiceRequests(orgId: string | null): Promise<GuestServiceRequestRow[]> {
  let q = supabase.from('guest_service_requests').select('*').order('created_at', { ascending: false }).limit(80);
  if (orgId) q = q.eq('organization_id', orgId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as GuestServiceRequestRow[];
}

export async function updateGuestServiceRequestStatus(params: {
  id: string;
  status: GuestServiceRequestStatus;
  staffNote?: string | null;
  staffId?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('guest_service_requests')
    .update({
      status: params.status,
      staff_note: params.staffNote ?? null,
      handled_by_staff_id: params.staffId ?? null,
      handled_at: new Date().toISOString(),
    })
    .eq('id', params.id);
  if (error) throw new Error(error.message);
}

export function buildGuestServiceRequestAdminPush(params: {
  requestType: GuestServiceRequestType;
  description: string;
  guestName: string | null;
  roomNumber: string | null;
}): { title: string; body: string } {
  const room = params.roomNumber?.trim() ? ` · Oda ${params.roomNumber.trim()}` : '';
  const who = params.guestName?.trim() || 'Misafir';
  const preview = params.description.trim().slice(0, 80);
  return {
    title: 'Misafir talebi',
    body: `${who}${room}: ${preview}`,
  };
}
