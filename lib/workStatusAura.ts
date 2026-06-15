import type { StaffPresenceStatus } from '@/components/premium/StaffStatusRing';

/** work_status / is_online → premium durum halkası */
export function resolveStaffPresenceStatus(opts: {
  isOnline?: boolean | null;
  workStatus?: string | null;
}): StaffPresenceStatus {
  const ws = (opts.workStatus ?? '').toLowerCase();
  if (ws === 'busy' || ws === 'meeting' || ws === 'in_task') return 'busy';
  if (ws === 'break' || ws === 'off' || ws === 'offline') return 'break';
  if (ws === 'urgent' || ws === 'emergency') return 'urgent';
  if (opts.isOnline) return 'available';
  return 'break';
}
