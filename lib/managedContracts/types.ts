import type { ManagedContractStatus, ManagedContractType, SignatureMethod } from './constants';

export type ManagedContractRow = {
  id: string;
  organization_id: string;
  contract_number: string;
  title: string;
  contract_type: ManagedContractType | string;
  status: ManagedContractStatus | string;
  start_date: string | null;
  end_date: string | null;
  body_text: string;
  special_clauses: string | null;
  current_version_no: number;
  visible_departments: string[];
  created_by_staff_id: string | null;
  updated_by_staff_id: string | null;
  approved_by_staff_id: string | null;
  approved_at: string | null;
  terminated_at: string | null;
  termination_reason: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedContractPartyRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  party_side: 'party_1' | 'party_2';
  party_role: string;
  full_name: string | null;
  id_number: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  company_name: string | null;
  is_authority: boolean;
  authority_title: string | null;
  linked_staff_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedContractVersionRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  version_no: number;
  title: string;
  contract_type: string;
  body_text: string;
  special_clauses: string | null;
  start_date: string | null;
  end_date: string | null;
  parties_snapshot: unknown;
  change_summary: string | null;
  created_by_staff_id: string | null;
  created_at: string;
};

export type ManagedContractSignatureRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  party_id: string | null;
  signer_name: string;
  signer_title: string | null;
  signature_method: SignatureMethod | string;
  signature_data: string | null;
  signed_at: string;
  signed_by_staff_id: string | null;
  ip_address: string | null;
  device_info: string | null;
  user_agent: string | null;
  version_no: number;
  created_at: string;
};

export type ManagedContractAttachmentRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by_staff_id: string | null;
  created_at: string;
};

export type ManagedContractAuditRow = {
  id: string;
  contract_id: string;
  organization_id: string;
  actor_staff_id: string | null;
  action_type: string;
  detail: Record<string, unknown> | null;
  ip_address: string | null;
  device_info: string | null;
  created_at: string;
  actor?: { full_name: string | null } | null;
};

export type ManagedContractTemplateRow = {
  id: string;
  organization_id: string | null;
  contract_type: string;
  title: string;
  body_text: string;
  special_clauses: string | null;
  is_active: boolean;
};

export type PartyInput = {
  party_side: 'party_1' | 'party_2';
  party_role: string;
  full_name?: string;
  id_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_number?: string;
  company_name?: string;
  is_authority?: boolean;
  authority_title?: string;
  linked_staff_id?: string | null;
};

export type CreateManagedContractInput = {
  organizationId: string;
  title: string;
  contractType: string;
  startDate?: string | null;
  endDate?: string | null;
  bodyText: string;
  specialClauses?: string | null;
  visibleDepartments?: string[];
  parties: PartyInput[];
  status?: ManagedContractStatus;
};

export type ManagedContractDetail = {
  contract: ManagedContractRow;
  parties: ManagedContractPartyRow[];
  signatures: ManagedContractSignatureRow[];
  attachments: ManagedContractAttachmentRow[];
  versions: ManagedContractVersionRow[];
  auditLogs: ManagedContractAuditRow[];
};
