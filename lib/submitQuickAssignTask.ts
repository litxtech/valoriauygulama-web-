import i18n from '@/i18n';
import type { AssignRoomRow } from '@/lib/adminAssignPickersCache';
import {
  createStaffAssignmentsForAssignees,
  dispatchNewTaskAssignmentsNotify,
  type PendingAssignmentAttachment,
} from '@/lib/staffAssignmentCreate';
import { assignmentTaskLabel } from '@/lib/staffAssignments';

export function resolveRoomIdsByNumber(roomNumber: string, rooms: AssignRoomRow[]): string[] {
  const raw = roomNumber.trim();
  if (!raw) return [];
  const norm = (s: string) => s.trim().replace(/^0+/, '') || '0';
  const hit = rooms.find(
    (r) => r.room_number === raw || norm(r.room_number) === norm(raw)
  );
  return hit ? [hit.id] : [];
}

export function buildQuickTaskCopy(taskText: string, roomNumber: string): {
  title: string;
  body: string | null;
} {
  const text = taskText.trim();
  const room = roomNumber.trim();
  const firstLine = text.split('\n').map((l) => l.trim()).find(Boolean) ?? text;
  let title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
  if (!title) title = i18n.t('quickAssign_defaultTitle');

  const lines: string[] = [];
  if (room) lines.push(i18n.t('quickAssign_roomLine', { room }));
  if (text.length > firstLine.length) {
    const rest = text.slice(text.indexOf('\n') + 1).trim();
    if (rest) lines.push(rest);
  } else if (text !== firstLine) {
    lines.push(text);
  }
  const body = lines.length ? lines.join('\n') : null;
  return { title, body };
}

export type SubmitQuickAssignTaskParams = {
  assigneeStaffIds: string[];
  createdByStaffId: string;
  taskText: string;
  roomNumber: string;
  rooms: AssignRoomRow[];
  pendingAttachments?: PendingAssignmentAttachment[];
  priority?: 'normal' | 'high' | 'urgent';
  taskType?: string;
};

export async function submitQuickAssignTask(params: SubmitQuickAssignTaskParams): Promise<number> {
  const ids = params.assigneeStaffIds.filter(Boolean);
  if (ids.length === 0) throw new Error(i18n.t('staffAssignPickStaff'));
  if (!params.taskText.trim()) throw new Error(i18n.t('quickAssign_taskRequired'));

  const { title, body } = buildQuickTaskCopy(params.taskText, params.roomNumber);
  const roomIds = resolveRoomIdsByNumber(params.roomNumber, params.rooms);
  const priority = params.priority ?? 'normal';
  const taskType = params.taskType ?? 'general';

  const { rows, uploadedUrls } = await createStaffAssignmentsForAssignees({
    assigneeStaffIds: ids,
    createdByStaffId: params.createdByStaffId,
    title,
    body,
    taskType,
    priority,
    roomIds,
    dueAt: null,
    pendingAttachments: params.pendingAttachments ?? [],
  });

  const typeLabel = assignmentTaskLabel(taskType);
  const roomPart = params.roomNumber.trim()
    ? ` ${i18n.t('quickAssign_roomLine', { room: params.roomNumber.trim() })}`
    : roomIds.length
      ? ''
      : '';
  const mediaPart = uploadedUrls.length ? ` ${uploadedUrls.length} ek.` : '';
  const pushBody = `${typeLabel}: ${title}.${roomPart}${mediaPart}`.trim();
  const boardContent = [body, roomPart.trim(), mediaPart.trim()].filter(Boolean).join('\n').trim() || pushBody;

  dispatchNewTaskAssignmentsNotify(
    rows.map((row) => ({
      assigneeStaffId: row.assigned_staff_id,
      createdByStaffId: params.createdByStaffId,
      assignmentId: row.id,
      title,
      pushBody,
      boardContent,
      priority,
    }))
  );

  return rows.length;
}
