/** Personel görev atamaları — ortak etiketler (admin + personel ekranları) */
import i18n from '@/i18n';

/** `staff_assignments.task_type` — DB CHECK ile uyumlu */
export const ASSIGNMENT_TASK_TYPE_KEYS = [
  'general',
  'reception',
  'housekeeping',
  'technical',
  'security',
] as const;

export type AssignmentTaskType = (typeof ASSIGNMENT_TASK_TYPE_KEYS)[number];

/** `staff_assignments.priority` */
export const ASSIGNMENT_PRIORITY_KEYS = ['low', 'normal', 'high', 'urgent'] as const;

export type AssignmentPriority = (typeof ASSIGNMENT_PRIORITY_KEYS)[number];

/** `staff_assignments.status` */
export const ASSIGNMENT_STATUS_KEYS = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

function label(prefix: string, key: string): string {
  const k = `${prefix}_${key}`;
  const v = i18n.t(k);
  return v === k ? key : v;
}

export function assignmentTaskLabel(key: string): string {
  return label('assignTask', key);
}

export function assignmentPriorityLabel(key: string): string {
  return label('assignPriority', key);
}

export function assignmentStatusLabel(key: string): string {
  return label('assignStatus', key);
}

export function staffRoleLabel(key: string): string {
  return label('staffRole', key);
}

/** @deprecated use assignmentTaskLabel */
export const ASSIGNMENT_TASK_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => assignmentTaskLabel(prop),
});

/** @deprecated use assignmentPriorityLabel */
export const ASSIGNMENT_PRIORITY_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => assignmentPriorityLabel(prop),
});

/** @deprecated use assignmentStatusLabel */
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => assignmentStatusLabel(prop),
});

/** @deprecated use staffRoleLabel */
export const STAFF_ROLE_LABELS: Record<string, string> = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => staffRoleLabel(prop),
});
