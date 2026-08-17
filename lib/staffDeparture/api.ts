import { supabase } from '@/lib/supabase';
import {
  notifyStaffDepartureCancelled,
  notifyStaffDepartureScheduled,
  notifyStaffDepartureUpdated,
} from './notify';
import type {
  BulkCreateStaffDepartureInput,
  CreateStaffDepartureInput,
  StaffDepartureListItem,
  StaffDepartureRow,
  UpdateStaffDepartureInput,
} from './types';

const LIST_SELECT = `
  id, organization_id, staff_id, departure_date, note, status,
  created_by, updated_by, created_at, updated_at,
  staff:staff!staff_departures_staff_id_fkey(full_name, department, role),
  creator:staff!staff_departures_created_by_fkey(full_name)
`;

function mapListRow(raw: Record<string, unknown>): StaffDepartureListItem {
  const staffRaw = Array.isArray(raw.staff) ? raw.staff[0] : raw.staff;
  const creatorRaw = Array.isArray(raw.creator) ? raw.creator[0] : raw.creator;
  const staff = staffRaw as { full_name?: string; department?: string; role?: string } | null;
  const creator = creatorRaw as { full_name?: string } | null;

  return {
    id: raw.id as string,
    organization_id: raw.organization_id as string,
    staff_id: raw.staff_id as string,
    departure_date: raw.departure_date as string,
    note: (raw.note as string | null) ?? null,
    status: raw.status as StaffDepartureListItem['status'],
    created_by: raw.created_by as string,
    updated_by: (raw.updated_by as string | null) ?? null,
    created_at: raw.created_at as string,
    updated_at: raw.updated_at as string,
    staff_name: staff?.full_name ?? null,
    staff_department: staff?.department ?? null,
    staff_role: staff?.role ?? null,
    creator_name: creator?.full_name ?? null,
  };
}

async function syncStaffTerminationDate(staffId: string, departureDate: string | null): Promise<void> {
  await supabase
    .from('staff')
    .update({ termination_date: departureDate })
    .eq('id', staffId);
}

export async function listStaffDepartures(params: {
  organizationId: string;
  status?: 'planned' | 'all';
  search?: string;
  limit?: number;
}): Promise<{ items: StaffDepartureListItem[]; error?: string }> {
  let q = supabase
    .from('staff_departures')
    .select(LIST_SELECT)
    .eq('organization_id', params.organizationId)
    .order('departure_date', { ascending: true })
    .limit(params.limit ?? 200);

  if (params.status !== 'all') {
    q = q.eq('status', 'planned');
  }

  const { data, error } = await q;
  if (error) return { items: [], error: error.message };

  let items = (data ?? []).map((row) => mapListRow(row as Record<string, unknown>));

  const needle = params.search?.trim().toLocaleLowerCase('tr');
  if (needle) {
    items = items.filter((row) => {
      const hay = `${row.staff_name ?? ''} ${row.staff_department ?? ''} ${row.note ?? ''} ${row.departure_date}`.toLocaleLowerCase('tr');
      return hay.includes(needle);
    });
  }

  return { items };
}

export async function createStaffDeparture(
  input: CreateStaffDepartureInput
): Promise<{ row: StaffDepartureRow | null; error?: string; notifyError?: string }> {
  const note = input.note?.trim() || null;

  const { data: existing } = await supabase
    .from('staff_departures')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('staff_id', input.staffId)
    .eq('status', 'planned')
    .maybeSingle();

  if (existing?.id) {
    return {
      row: null,
      error: 'Bu personel için zaten planlanmış bir ayrılış kaydı var. Önce düzenleyin veya iptal edin.',
    };
  }

  const { data, error } = await supabase
    .from('staff_departures')
    .insert({
      organization_id: input.organizationId,
      staff_id: input.staffId,
      departure_date: input.departureDate,
      note,
      status: 'planned',
      created_by: input.createdByStaffId,
    })
    .select('*')
    .single();

  if (error) return { row: null, error: error.message };
  const row = data as StaffDepartureRow;

  await syncStaffTerminationDate(input.staffId, input.departureDate);

  const { data: staffRow } = await supabase
    .from('staff')
    .select('full_name')
    .eq('id', input.staffId)
    .maybeSingle();

  const notify = await notifyStaffDepartureScheduled({
    departureId: row.id,
    subjectStaffId: input.staffId,
    departureDate: input.departureDate,
    note,
    createdByStaffId: input.createdByStaffId,
    staffName: (staffRow?.full_name as string | null) ?? null,
  });

  return { row, notifyError: notify.error };
}

export async function bulkCreateStaffDepartures(
  input: BulkCreateStaffDepartureInput
): Promise<{ created: number; skipped: string[]; errors: string[] }> {
  const skipped: string[] = [];
  const errors: string[] = [];
  let created = 0;

  for (const staffId of input.staffIds) {
    const result = await createStaffDeparture({
      organizationId: input.organizationId,
      staffId,
      departureDate: input.departureDate,
      note: input.note,
      createdByStaffId: input.createdByStaffId,
    });
    if (result.row) {
      created += 1;
    } else if (result.error?.includes('zaten planlanmış')) {
      skipped.push(staffId);
    } else if (result.error) {
      errors.push(result.error);
    }
    if (result.notifyError) {
      errors.push(result.notifyError);
    }
  }

  return { created, skipped, errors };
}

export async function updateStaffDeparture(
  input: UpdateStaffDepartureInput
): Promise<{ row: StaffDepartureRow | null; error?: string; notifyError?: string }> {
  const { data: prev, error: prevErr } = await supabase
    .from('staff_departures')
    .select('*')
    .eq('id', input.id)
    .maybeSingle();

  if (prevErr) return { row: null, error: prevErr.message };
  if (!prev) return { row: null, error: 'Kayıt bulunamadı.' };

  const prevRow = prev as StaffDepartureRow;
  const patch: Record<string, unknown> = {
    updated_by: input.updatedByStaffId,
  };

  if (input.departureDate !== undefined) patch.departure_date = input.departureDate;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await supabase
    .from('staff_departures')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();

  if (error) return { row: null, error: error.message };
  const row = data as StaffDepartureRow;

  if (row.status === 'planned' && input.departureDate !== undefined) {
    await syncStaffTerminationDate(row.staff_id, input.departureDate);
  }
  if (row.status === 'cancelled') {
    await syncStaffTerminationDate(row.staff_id, null);
  }
  if (row.status === 'completed') {
    await syncStaffTerminationDate(row.staff_id, row.departure_date);
  }

  let notifyError: string | undefined;
  if (input.status === 'cancelled') {
    const n = await notifyStaffDepartureCancelled({
      departureId: row.id,
      subjectStaffId: row.staff_id,
      departureDate: row.departure_date,
      updatedByStaffId: input.updatedByStaffId,
    });
    notifyError = n.error;
  } else if (
    input.departureDate !== undefined ||
    input.note !== undefined
  ) {
    const n = await notifyStaffDepartureUpdated({
      departureId: row.id,
      subjectStaffId: row.staff_id,
      departureDate: row.departure_date,
      note: row.note,
      updatedByStaffId: input.updatedByStaffId,
    });
    notifyError = n.error;
  }

  void prevRow;
  return { row, notifyError };
}

export async function deleteStaffDeparture(params: {
  id: string;
  updatedByStaffId: string;
}): Promise<{ error?: string }> {
  const { error } = await updateStaffDeparture({
    id: params.id,
    status: 'cancelled',
    updatedByStaffId: params.updatedByStaffId,
  });
  return { error };
}
