import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { sendNotificationToStaffIds } from '@/lib/notificationService';
import { isValidUuid } from '@/lib/organizationScope';
import type {
  CreateManagedContractInput,
  ManagedContractAuditRow,
  ManagedContractDetail,
  ManagedContractRow,
  ManagedContractTemplateRow,
  PartyInput,
} from './types';
import type { ManagedContractStatus, SignatureMethod } from './constants';

function deviceInfo(): string {
  return Platform.OS;
}

function scopedOrgId(orgId?: string | null): string | undefined {
  if (!orgId || !isValidUuid(orgId)) return undefined;
  return orgId.trim();
}

export async function generateContractNumber(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_managed_contract_number', { p_org_id: orgId });
  if (error) throw error;
  return String(data);
}

export async function listManagedContracts(opts: {
  organizationId?: string | null;
  status?: ManagedContractStatus | ManagedContractStatus[];
  search?: string;
  limit?: number;
}): Promise<{ data: ManagedContractRow[]; error: Error | null }> {
  let q = supabase
    .from('managed_contracts')
    .select('*')
    .order('updated_at', { ascending: false });

  if (opts.organizationId) {
    const org = scopedOrgId(opts.organizationId);
    if (org) q = q.eq('organization_id', org);
  }
  if (opts.status) {
    const statuses = Array.isArray(opts.status) ? opts.status : [opts.status];
    q = q.in('status', statuses);
  }
  if (opts.search?.trim()) {
    const s = opts.search.trim();
    q = q.or(`title.ilike.%${s}%,contract_number.ilike.%${s}%`);
  }
  if (opts.limit) q = q.limit(opts.limit);

  const { data, error } = await q;
  return { data: (data ?? []) as ManagedContractRow[], error: error ? new Error(error.message) : null };
}

export async function getManagedContractDetail(contractId: string): Promise<{ data: ManagedContractDetail | null; error: Error | null }> {
  const [contractRes, partiesRes, sigRes, attRes, verRes, auditRes] = await Promise.all([
    supabase.from('managed_contracts').select('*').eq('id', contractId).maybeSingle(),
    supabase.from('managed_contract_parties').select('*').eq('contract_id', contractId).order('party_side'),
    supabase.from('managed_contract_signatures').select('*').eq('contract_id', contractId).order('signed_at'),
    supabase.from('managed_contract_attachments').select('*').eq('contract_id', contractId).order('created_at'),
    supabase.from('managed_contract_versions').select('*').eq('contract_id', contractId).order('version_no', { ascending: false }),
    supabase
      .from('managed_contract_audit_logs')
      .select('*, actor:staff!managed_contract_audit_logs_actor_staff_id_fkey(full_name)')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (contractRes.error) return { data: null, error: new Error(contractRes.error.message) };
  if (!contractRes.data) return { data: null, error: new Error('Sözleşme bulunamadı') };

  return {
    data: {
      contract: contractRes.data as ManagedContractRow,
      parties: (partiesRes.data ?? []) as ManagedContractDetail['parties'],
      signatures: (sigRes.data ?? []) as ManagedContractDetail['signatures'],
      attachments: (attRes.data ?? []) as ManagedContractDetail['attachments'],
      versions: (verRes.data ?? []) as ManagedContractDetail['versions'],
      auditLogs: (auditRes.data ?? []) as ManagedContractAuditRow[],
    },
    error: null,
  };
}

export async function logContractAudit(
  contractId: string,
  orgId: string,
  actionType: string,
  staffId?: string | null,
  detail?: Record<string, unknown>,
) {
  await supabase.from('managed_contract_audit_logs').insert({
    contract_id: contractId,
    organization_id: orgId,
    actor_staff_id: staffId ?? null,
    action_type: actionType,
    detail: detail ?? null,
    device_info: deviceInfo(),
  });
}

export async function createManagedContract(
  input: CreateManagedContractInput,
  staffId: string,
): Promise<{ data: ManagedContractRow | null; error: Error | null }> {
  const contractNumber = await generateContractNumber(input.organizationId);

  const { data: contract, error } = await supabase
    .from('managed_contracts')
    .insert({
      organization_id: input.organizationId,
      contract_number: contractNumber,
      title: input.title.trim(),
      contract_type: input.contractType,
      status: input.status ?? 'draft',
      start_date: input.startDate || null,
      end_date: input.endDate || null,
      body_text: input.bodyText,
      special_clauses: input.specialClauses?.trim() || null,
      visible_departments: input.visibleDepartments ?? [],
      created_by_staff_id: staffId,
      updated_by_staff_id: staffId,
    })
    .select('*')
    .single();

  if (error || !contract) return { data: null, error: new Error(error?.message ?? 'Oluşturulamadı') };

  const partyRows = input.parties.map((p) => ({
    contract_id: contract.id,
    organization_id: input.organizationId,
    party_side: p.party_side,
    party_role: p.party_role,
    full_name: p.full_name?.trim() || null,
    id_number: p.id_number?.trim() || null,
    phone: p.phone?.trim() || null,
    email: p.email?.trim() || null,
    address: p.address?.trim() || null,
    tax_number: p.tax_number?.trim() || null,
    company_name: p.company_name?.trim() || null,
    is_authority: p.is_authority ?? false,
    authority_title: p.authority_title?.trim() || null,
    linked_staff_id: p.linked_staff_id ?? null,
  }));

  if (partyRows.length > 0) {
    const { error: partyErr } = await supabase.from('managed_contract_parties').insert(partyRows);
    if (partyErr) return { data: null, error: new Error(partyErr.message) };
  }

  await logContractAudit(contract.id, input.organizationId, 'created', staffId, { contract_number: contractNumber });

  return { data: contract as ManagedContractRow, error: null };
}

export async function updateManagedContract(
  contractId: string,
  orgId: string,
  staffId: string,
  patch: Partial<{
    title: string;
    contract_type: string;
    start_date: string | null;
    end_date: string | null;
    body_text: string;
    special_clauses: string | null;
    visible_departments: string[];
    status: ManagedContractStatus;
  }>,
  parties?: PartyInput[],
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('managed_contracts')
    .update({ ...patch, updated_by_staff_id: staffId })
    .eq('id', contractId);

  if (error) return { error: new Error(error.message) };

  if (parties) {
    await supabase.from('managed_contract_parties').delete().eq('contract_id', contractId);
    const partyRows = parties.map((p) => ({
      contract_id: contractId,
      organization_id: orgId,
      party_side: p.party_side,
      party_role: p.party_role,
      full_name: p.full_name?.trim() || null,
      id_number: p.id_number?.trim() || null,
      phone: p.phone?.trim() || null,
      email: p.email?.trim() || null,
      address: p.address?.trim() || null,
      tax_number: p.tax_number?.trim() || null,
      company_name: p.company_name?.trim() || null,
      is_authority: p.is_authority ?? false,
      authority_title: p.authority_title?.trim() || null,
      linked_staff_id: p.linked_staff_id ?? null,
    }));
    if (partyRows.length > 0) {
      const { error: pErr } = await supabase.from('managed_contract_parties').insert(partyRows);
      if (pErr) return { error: new Error(pErr.message) };
    }
  }

  await logContractAudit(contractId, orgId, 'updated', staffId);
  return { error: null };
}

export async function submitContractForApproval(
  contractId: string,
  orgId: string,
  staffId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('managed_contracts')
    .update({ status: 'pending', updated_by_staff_id: staffId })
    .eq('id', contractId);

  if (error) return { error: new Error(error.message) };

  await logContractAudit(contractId, orgId, 'submitted', staffId);
  await notifyContractStakeholders(contractId, orgId, 'Sözleşme onay bekliyor', 'Onayınızı bekleyen yeni bir sözleşme var.', staffId);
  return { error: null };
}

export async function activateContract(
  contractId: string,
  orgId: string,
  staffId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('managed_contracts')
    .update({
      status: 'active',
      approved_by_staff_id: staffId,
      approved_at: new Date().toISOString(),
      updated_by_staff_id: staffId,
    })
    .eq('id', contractId);

  if (error) return { error: new Error(error.message) };

  await logContractAudit(contractId, orgId, 'approved', staffId);
  await notifyContractStakeholders(contractId, orgId, 'Sözleşme aktif', 'Sözleşme onaylandı ve yürürlüğe girdi.', staffId);
  return { error: null };
}

export async function terminateContract(
  contractId: string,
  orgId: string,
  staffId: string,
  reason: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('managed_contracts')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString(),
      termination_reason: reason.trim() || null,
      updated_by_staff_id: staffId,
    })
    .eq('id', contractId);

  if (error) return { error: new Error(error.message) };

  await logContractAudit(contractId, orgId, 'terminated', staffId, { reason });
  await notifyContractStakeholders(contractId, orgId, 'Sözleşme feshedildi', reason || 'Sözleşme feshedildi.', staffId);
  return { error: null };
}

export async function archiveContract(
  contractId: string,
  orgId: string,
  staffId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('managed_contracts')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
      updated_by_staff_id: staffId,
    })
    .eq('id', contractId);

  if (error) return { error: new Error(error.message) };

  await logContractAudit(contractId, orgId, 'archived', staffId);
  return { error: null };
}

export async function recordContractView(contractId: string, orgId: string, staffId: string) {
  await logContractAudit(contractId, orgId, 'viewed', staffId);
}

export async function addContractSignature(opts: {
  contractId: string;
  orgId: string;
  staffId: string;
  partyId?: string | null;
  signerName: string;
  signerTitle?: string;
  method: SignatureMethod;
  signatureData?: string | null;
  versionNo: number;
}): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('managed_contract_signatures').insert({
    contract_id: opts.contractId,
    organization_id: opts.orgId,
    party_id: opts.partyId ?? null,
    signer_name: opts.signerName.trim(),
    signer_title: opts.signerTitle?.trim() || null,
    signature_method: opts.method,
    signature_data: opts.signatureData ?? null,
    signed_by_staff_id: opts.staffId,
    device_info: deviceInfo(),
    version_no: opts.versionNo,
  });

  if (error) return { error: new Error(error.message) };

  await logContractAudit(opts.contractId, opts.orgId, 'signed', opts.staffId, {
    signer: opts.signerName,
    method: opts.method,
  });
  return { error: null };
}

export async function listContractTemplates(orgId?: string | null): Promise<ManagedContractTemplateRow[]> {
  let q = supabase.from('managed_contract_templates').select('*').eq('is_active', true);
  const org = scopedOrgId(orgId);
  if (org) {
    q = q.or(`organization_id.is.null,organization_id.eq.${org}`);
  } else {
    q = q.is('organization_id', null);
  }
  const { data } = await q.order('contract_type');
  return (data ?? []) as ManagedContractTemplateRow[];
}

export async function getContractCounts(orgId?: string | null) {
  const org = scopedOrgId(orgId);
  const base = () => {
    let q = supabase.from('managed_contracts').select('id', { count: 'exact', head: true });
    if (org) q = q.eq('organization_id', org);
    return q;
  };

  const [draft, pending, active, expired, terminated, archived] = await Promise.all([
    base().eq('status', 'draft'),
    base().eq('status', 'pending'),
    base().eq('status', 'active'),
    base().eq('status', 'expired'),
    base().eq('status', 'terminated'),
    base().eq('status', 'archived'),
  ]);

  return {
    draft: draft.count ?? 0,
    pending: pending.count ?? 0,
    active: active.count ?? 0,
    expired: expired.count ?? 0,
    terminated: terminated.count ?? 0,
    archived: archived.count ?? 0,
  };
}

async function notifyContractStakeholders(
  contractId: string,
  orgId: string,
  title: string,
  body: string,
  createdByStaffId?: string | null,
) {
  const { data: accessRows } = await supabase
    .from('managed_contract_staff_access')
    .select('staff_id')
    .eq('contract_id', contractId);

  const { data: partyRows } = await supabase
    .from('managed_contract_parties')
    .select('linked_staff_id')
    .eq('contract_id', contractId)
    .not('linked_staff_id', 'is', null);

  const ids = new Set<string>();
  for (const r of accessRows ?? []) if (r.staff_id) ids.add(r.staff_id);
  for (const r of partyRows ?? []) if (r.linked_staff_id) ids.add(r.linked_staff_id);

  if (ids.size === 0 || !createdByStaffId) return;

  await sendNotificationToStaffIds({
    staffIds: Array.from(ids),
    title,
    body,
    createdByStaffId,
    notificationType: 'managed_contract',
    category: 'staff',
    data: { contractId, organizationId: orgId, href: `/staff/managed-contracts/${contractId}` },
  });
}

export async function grantStaffContractAccess(
  contractId: string,
  orgId: string,
  staffIds: string[],
  grantedByStaffId: string,
) {
  if (staffIds.length === 0) return;
  const rows = staffIds.map((staff_id) => ({
    contract_id: contractId,
    organization_id: orgId,
    staff_id,
    can_view: true,
    can_download: true,
    granted_by_staff_id: grantedByStaffId,
  }));
  await supabase.from('managed_contract_staff_access').upsert(rows, { onConflict: 'contract_id,staff_id' });
}
