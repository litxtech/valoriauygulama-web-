import type { DepartmentRuleStatus, DepartmentRuleType, PublishScope } from './constants';

export type DepartmentRuleRow = {
  id: string;
  organization_id: string;
  document_number: string;
  verification_token: string;
  title: string;
  department: string;
  rule_type: DepartmentRuleType | string;
  content: string;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  is_permanent: boolean;
  status: DepartmentRuleStatus | string;
  requires_acknowledgement: boolean;
  is_printable: boolean;
  generate_pdf: boolean;
  send_notification: boolean;
  visible_roles: string[];
  target_departments: string[];
  target_staff_ids: string[];
  publish_scope: PublishScope | string;
  scheduled_publish_at: string | null;
  published_at: string | null;
  notify_reminder_sent_at: string | null;
  created_by: string | null;
  approved_by: string | null;
  updated_by: string | null;
  version: number;
  parent_rule_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  creator?: { full_name: string | null } | null;
};

export type DepartmentRuleReadRow = {
  id: string;
  rule_id: string;
  organization_id: string;
  user_id: string;
  read_at: string | null;
  acknowledged_at: string | null;
  acknowledged_version: number | null;
  ip_address: string | null;
  device_info: string | null;
  status: 'unread' | 'read' | 'acknowledged';
  created_at: string;
  updated_at: string;
  staff?: { full_name: string | null; department: string | null } | null;
};

export type DepartmentRuleAttachmentRow = {
  id: string;
  rule_id: string;
  organization_id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type DepartmentRuleDetail = {
  rule: DepartmentRuleRow;
  attachments: DepartmentRuleAttachmentRow[];
  reads: DepartmentRuleReadRow[];
  versions: DepartmentRuleRow[];
};

export type CreateDepartmentRuleInput = {
  organizationId: string;
  title: string;
  department: string;
  ruleType: string;
  content: string;
  startDate?: string | null;
  endDate?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isPermanent?: boolean;
  requiresAcknowledgement?: boolean;
  isPrintable?: boolean;
  generatePdf?: boolean;
  sendNotification?: boolean;
  visibleRoles?: string[];
  targetDepartments?: string[];
  targetStaffIds?: string[];
  publishScope?: PublishScope;
  scheduledPublishAt?: string | null;
  status?: DepartmentRuleStatus;
};

export type RuleTrackingStats = {
  sentCount: number;
  readCount: number;
  acknowledgedCount: number;
  unreadStaff: { id: string; full_name: string | null }[];
  unacknowledgedStaff: { id: string; full_name: string | null }[];
};
