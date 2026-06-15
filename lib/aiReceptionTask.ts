import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { loadAssignRooms, loadAssignStaff, type AssignStaffRow } from '@/lib/adminAssignPickersCache';
import {
  createStaffAssignmentsForAssignees,
  dispatchNewTaskAssignmentsNotify,
} from '@/lib/staffAssignmentCreate';
import { canStaffCreateAssignments } from '@/lib/staffPermissions';
import { resolveRoomIdsByNumber } from '@/lib/submitQuickAssignTask';
import { staffMatchesSmartOpsRoleLocal } from '@/lib/smartOps';

export type AiReceptionParseResult = {
  roomNumber: string | null;
  targetRole: 'housekeeping' | 'technical' | 'security' | 'reception' | 'general';
  taskType: 'housekeeping' | 'technical' | 'security' | 'reception' | 'general';
  priority: 'normal' | 'high' | 'urgent';
  title: string;
  body: string;
};

function extractRoomNumber(prompt: string): string | null {
  const patterns = [
    /(\d{2,4})\s*nolu?\s*oda/i,
    /oda\s*[#:]?\s*(\d{2,4})/i,
    /\b(\d{3,4})\s*(?:numara|no|nolu)\b/i,
  ];
  for (const re of patterns) {
    const m = prompt.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function detectTargetRole(prompt: string): AiReceptionParseResult['targetRole'] {
  const p = prompt.toLowerCase();
  if (/havlu|temizlik|yatak|çarşaf|çarşaf|housekeeping|kat hizmet|minibar|oda temiz/i.test(p)) {
    return 'housekeeping';
  }
  if (/arıza|klima|su kaç|elektrik|teknik|tv|lamba|musluk|tıkan|tikan|repair|fix/i.test(p)) {
    return 'technical';
  }
  if (/güvenlik|guvenlik|acil|yangın|yangin|security|kavga|hırsız|hirsiz/i.test(p)) {
    return 'security';
  }
  if (/resepsiyon|check.?in|check.?out|misafir karşıl|misafir karsil|reception/i.test(p)) {
    return 'reception';
  }
  return 'general';
}

export function parseAiReceptionPrompt(prompt: string): AiReceptionParseResult {
  const text = prompt.trim();
  const roomNumber = extractRoomNumber(text);
  const targetRole = detectTargetRole(text);
  const isUrgent = /acil|hemen|urgent|kritik/i.test(text);
  const priority: AiReceptionParseResult['priority'] = isUrgent ? 'urgent' : roomNumber ? 'high' : 'normal';

  const taskType =
    targetRole === 'general' ? 'general' : targetRole === 'reception' ? 'reception' : targetRole;

  let title: string;
  if (roomNumber && targetRole === 'housekeeping') {
    title = i18n.t('staffAiRoomTowel', { room: roomNumber });
  } else if (roomNumber) {
    title = i18n.t('staffAiRoomGuest', { room: roomNumber });
  } else {
    title = `AI: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`;
  }

  const body = `AI Reception Assistant\n\n${text}`;
  return { roomNumber, targetRole, taskType, priority, title, body };
}

export function pickAiReceptionAssignees(
  staffList: AssignStaffRow[],
  creatorId: string,
  targetRole: AiReceptionParseResult['targetRole']
): string[] {
  const others = staffList.filter((s) => s.id !== creatorId);
  const roleKey =
    targetRole === 'general' ? 'reception' : targetRole === 'reception' ? 'reception' : targetRole;

  const matched = others.filter((s) => staffMatchesSmartOpsRoleLocal(s, roleKey));
  const picked = (matched.length > 0 ? matched : others).slice(0, 3).map((s) => s.id);
  if (picked.length > 0) return picked;
  return [creatorId];
}

async function insertViaRpc(params: {
  assigneeStaffIds: string[];
  title: string;
  body: string;
  taskType: string;
  priority: string;
  roomIds: string[];
}): Promise<{ id: string; assigned_staff_id: string }[]> {
  const { data, error } = await supabase.rpc('staff_ai_reception_create_assignments', {
    p_assignee_staff_ids: params.assigneeStaffIds,
    p_title: params.title,
    p_body: params.body,
    p_task_type: params.taskType,
    p_priority: params.priority,
    p_room_ids: params.roomIds,
  });
  if (error) throw error;
  return (data ?? []) as { id: string; assigned_staff_id: string }[];
}

export async function createAiReceptionTask(params: {
  prompt: string;
  staff: { id: string; organization_id?: string | null; role?: string | null; app_permissions?: Record<string, boolean> | null };
}): Promise<{ rows: { id: string; assigned_staff_id: string }[]; title: string; priority: string; body: string }> {
  const prompt = params.prompt.trim();
  if (!prompt) throw new Error(i18n.t('quickAssign_taskRequired'));
  if (!params.staff?.id) throw new Error(i18n.t('assignPage_errSession'));
  if (!params.staff.organization_id) throw new Error(i18n.t('staffAiOrgRequired'));

  const parsed = parseAiReceptionPrompt(prompt);
  const [staffList, rooms] = await Promise.all([loadAssignStaff(), loadAssignRooms()]);
  const assigneeIds = pickAiReceptionAssignees(staffList, params.staff.id, parsed.targetRole);
  const roomIds = parsed.roomNumber ? resolveRoomIdsByNumber(parsed.roomNumber, rooms) : [];

  let rows: { id: string; assigned_staff_id: string }[];

  if (canStaffCreateAssignments(params.staff)) {
    const result = await createStaffAssignmentsForAssignees({
      assigneeStaffIds: assigneeIds,
      createdByStaffId: params.staff.id,
      title: parsed.title,
      body: parsed.body,
      taskType: parsed.taskType,
      priority: parsed.priority,
      roomIds,
      dueAt: null,
      pendingAttachments: [],
    });
    rows = result.rows;
  } else {
    rows = await insertViaRpc({
      assigneeStaffIds: assigneeIds,
      title: parsed.title,
      body: parsed.body,
      taskType: parsed.taskType,
      priority: parsed.priority,
      roomIds,
    });
  }

  if (!rows.length) throw new Error(i18n.t('staffAiTaskFailed'));

  dispatchNewTaskAssignmentsNotify(
    rows.map((r) => ({
      assigneeStaffId: r.assigned_staff_id,
      createdByStaffId: params.staff.id,
      assignmentId: r.id,
      title: parsed.title,
      pushBody: parsed.title,
      boardContent: prompt,
      priority: parsed.priority,
    }))
  );

  return { rows, title: parsed.title, priority: parsed.priority, body: parsed.body };
}
