import { supabase } from '@/lib/supabase';

export type SecurityBlacklistRow = {
  id: string;
  organization_id: string;
  reference_code: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  photo_storage_path: string | null;
  incident_description: string;
  additional_notes: string | null;
  hotel_note: string | null;
  family_note: string | null;
  nationality: string | null;
  id_document_ref: string | null;
  incident_date: string | null;
  is_removed: boolean;
  removed_at: string | null;
  removed_by_staff_id: string | null;
  removal_note: string | null;
  added_by_staff_id: string;
  created_at: string;
  updated_at: string;
  added_by?: { full_name: string | null } | null;
  removed_by?: { full_name: string | null } | null;
};

const LIST_SELECT = `
  id, organization_id, reference_code, first_name, last_name,
  photo_url, incident_description, additional_notes, hotel_note, family_note, nationality,
  id_document_ref, incident_date, is_removed, created_at, updated_at,
  added_by:staff!security_blacklist_entries_added_by_staff_id_fkey(full_name)
`;

const DETAIL_SELECT = `
  id, organization_id, reference_code, first_name, last_name,
  photo_url, photo_storage_path, incident_description, additional_notes,
  hotel_note, family_note,
  nationality, id_document_ref, incident_date, is_removed,
  removed_at, removed_by_staff_id, removal_note,
  added_by_staff_id, created_at, updated_at,
  added_by:staff!security_blacklist_entries_added_by_staff_id_fkey(full_name),
  removed_by:staff!security_blacklist_entries_removed_by_staff_id_fkey(full_name)
`;

export type CreateSecurityBlacklistInput = {
  firstName: string;
  lastName: string;
  incidentDescription: string;
  additionalNotes?: string | null;
  hotelNote?: string | null;
  familyNote?: string | null;
  nationality?: string | null;
  idDocumentRef?: string | null;
  incidentDate?: string | null;
  photoUrl?: string | null;
  photoStoragePath?: string | null;
};

export type UpdateSecurityBlacklistInput = Partial<CreateSecurityBlacklistInput>;

export async function listSecurityBlacklistEntries(params?: {
  includeRemoved?: boolean;
  search?: string;
}): Promise<{ data: SecurityBlacklistRow[]; error: string | null }> {
  let q = supabase
    .from('security_blacklist_entries')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false });

  if (!params?.includeRemoved) {
    q = q.eq('is_removed', false);
  }

  const { data, error } = await q;
  if (error) return { data: [], error: error.message };

  let rows = (data ?? []) as SecurityBlacklistRow[];
  const term = params?.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) => {
      const full = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (
        full.includes(term) ||
        r.reference_code.toLowerCase().includes(term) ||
        r.incident_description.toLowerCase().includes(term) ||
        (r.nationality ?? '').toLowerCase().includes(term) ||
        (r.id_document_ref ?? '').toLowerCase().includes(term) ||
        (r.hotel_note ?? '').toLowerCase().includes(term) ||
        (r.family_note ?? '').toLowerCase().includes(term)
      );
    });
  }
  return { data: rows, error: null };
}

export async function getSecurityBlacklistEntry(
  id: string
): Promise<{ data: SecurityBlacklistRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('security_blacklist_entries')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as SecurityBlacklistRow | null) ?? null, error: null };
}

export async function createSecurityBlacklistEntry(
  organizationId: string,
  staffId: string,
  input: CreateSecurityBlacklistInput
): Promise<{ data: SecurityBlacklistRow | null; error: string | null }> {
  const { data, error } = await supabase
    .from('security_blacklist_entries')
    .insert({
      organization_id: organizationId,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      incident_description: input.incidentDescription.trim(),
      additional_notes: input.additionalNotes?.trim() || null,
      hotel_note: input.hotelNote?.trim() || null,
      family_note: input.familyNote?.trim() || null,
      nationality: input.nationality?.trim() || null,
      id_document_ref: input.idDocumentRef?.trim() || null,
      incident_date: input.incidentDate || null,
      photo_url: input.photoUrl || null,
      photo_storage_path: input.photoStoragePath || null,
      added_by_staff_id: staffId,
    })
    .select(DETAIL_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as SecurityBlacklistRow, error: null };
}

export async function updateSecurityBlacklistEntry(
  id: string,
  input: UpdateSecurityBlacklistInput
): Promise<{ data: SecurityBlacklistRow | null; error: string | null }> {
  const patch: Record<string, unknown> = {};
  if (input.firstName !== undefined) patch.first_name = input.firstName.trim();
  if (input.lastName !== undefined) patch.last_name = input.lastName.trim();
  if (input.incidentDescription !== undefined) patch.incident_description = input.incidentDescription.trim();
  if (input.additionalNotes !== undefined) patch.additional_notes = input.additionalNotes?.trim() || null;
  if (input.hotelNote !== undefined) patch.hotel_note = input.hotelNote?.trim() || null;
  if (input.familyNote !== undefined) patch.family_note = input.familyNote?.trim() || null;
  if (input.nationality !== undefined) patch.nationality = input.nationality?.trim() || null;
  if (input.idDocumentRef !== undefined) patch.id_document_ref = input.idDocumentRef?.trim() || null;
  if (input.incidentDate !== undefined) patch.incident_date = input.incidentDate || null;
  if (input.photoUrl !== undefined) patch.photo_url = input.photoUrl || null;
  if (input.photoStoragePath !== undefined) patch.photo_storage_path = input.photoStoragePath || null;

  const { data, error } = await supabase
    .from('security_blacklist_entries')
    .update(patch)
    .eq('id', id)
    .select(DETAIL_SELECT)
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as SecurityBlacklistRow, error: null };
}

export async function removeSecurityBlacklistEntry(
  id: string,
  staffId: string,
  removalNote?: string | null
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('security_blacklist_entries')
    .update({
      is_removed: true,
      removed_at: new Date().toISOString(),
      removed_by_staff_id: staffId,
      removal_note: removalNote?.trim() || null,
    })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function restoreSecurityBlacklistEntry(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('security_blacklist_entries')
    .update({
      is_removed: false,
      removed_at: null,
      removed_by_staff_id: null,
      removal_note: null,
    })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export function securityBlacklistFullName(row: Pick<SecurityBlacklistRow, 'first_name' | 'last_name'>): string {
  return `${row.first_name} ${row.last_name}`.trim();
}

export type SecurityBlacklistScopeFilter = 'all' | 'hotel' | 'family';

export function securityBlacklistHasHotelNote(row: Pick<SecurityBlacklistRow, 'hotel_note'>): boolean {
  return Boolean(row.hotel_note?.trim());
}

export function securityBlacklistHasFamilyNote(row: Pick<SecurityBlacklistRow, 'family_note'>): boolean {
  return Boolean(row.family_note?.trim());
}

export function securityBlacklistMatchesScope(
  row: Pick<SecurityBlacklistRow, 'hotel_note' | 'family_note'>,
  scope: SecurityBlacklistScopeFilter
): boolean {
  if (scope === 'all') return true;
  if (scope === 'hotel') return securityBlacklistHasHotelNote(row);
  return securityBlacklistHasFamilyNote(row);
}
