import i18n from '@/i18n';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { publishTaskAssignmentBoardNotice } from '@/lib/staffBoard';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { STAFF_TASK_MEDIA_BUCKET } from '@/lib/staffAssignmentMedia';
import { copyUriToCacheForUpload, isLocalFileUriForUpload } from '@/lib/uploadMedia';

export type PendingAssignmentAttachment = { uri: string; type: 'image' | 'video' };

/** Görev eklerini paralel yükler (video için stream upload). */
export async function uploadStaffAssignmentAttachments(
  assignmentId: string,
  items: PendingAssignmentAttachment[]
): Promise<string[]> {
  if (items.length === 0) return [];
  return Promise.all(
    items.map(async (item) => {
      let uploadUri = item.uri;
      if (!isLocalFileUriForUpload(uploadUri)) {
        uploadUri = await copyUriToCacheForUpload(uploadUri, item.type);
      }
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: STAFF_TASK_MEDIA_BUCKET,
        uri: uploadUri,
        kind: item.type,
        subfolder: `tasks/${assignmentId}`,
        preferStreamUpload: item.type === 'image',
      });
      return publicUrl;
    })
  );
}

export type NewTaskAssignmentNotifyParams = {
  assigneeStaffId: string;
  createdByStaffId: string;
  assignmentId: string;
  title: string;
  pushBody: string;
  boardContent: string;
  priority: string;
};

/** Pano + uygulama içi/push bildirimi — görev kaydı tamamlandıktan sonra arka planda. */
export function dispatchNewTaskAssignmentNotify(params: NewTaskAssignmentNotifyParams): void {
  void (async () => {
    await Promise.all([
      publishTaskAssignmentBoardNotice({
        assigneeStaffId: params.assigneeStaffId,
        createdByStaffId: params.createdByStaffId,
        assignmentId: params.assignmentId,
        title: params.title,
        content: params.boardContent,
        priority: params.priority as 'low' | 'normal' | 'high' | 'urgent',
      }),
      sendNotification({
        staffId: params.assigneeStaffId,
        title: i18n.t('staffAssignNewTask'),
        body: params.pushBody,
        notificationType: 'staff_assignment',
        category: 'staff',
        createdByStaffId: params.createdByStaffId,
        data: { url: '/staff/tasks', assignmentId: params.assignmentId },
      }),
    ]);
  })();
}

export async function patchStaffAssignmentAttachmentUrls(
  assignmentId: string,
  urls: string[]
): Promise<void> {
  if (urls.length === 0) return;
  const { error } = await supabase
    .from('staff_assignments')
    .update({ attachment_urls: urls })
    .eq('id', assignmentId);
  if (error) throw error;
}

export type CreateStaffAssignmentsParams = {
  assigneeStaffIds: string[];
  createdByStaffId: string;
  title: string;
  body: string | null;
  taskType: string;
  priority: string;
  roomIds: string[];
  dueAt: string | null;
  pendingAttachments: PendingAssignmentAttachment[];
};

/** Her atanan için ayrı görev satırı; ekler bir kez yüklenip tüm satırlara yazılır. */
export async function createStaffAssignmentsForAssignees(
  params: CreateStaffAssignmentsParams
): Promise<{ rows: { id: string; assigned_staff_id: string }[]; uploadedUrls: string[] }> {
  const ids = (params.assigneeStaffIds ?? []).filter(Boolean);
  if (ids.length === 0) throw new Error(i18n.t('staffAssignPickStaff'));

  const baseRow = (assigned_staff_id: string) => ({
    title: params.title,
    body: params.body,
    task_type: params.taskType,
    priority: params.priority,
    assigned_staff_id,
    created_by_staff_id: params.createdByStaffId,
    room_ids: params.roomIds,
    due_at: params.dueAt,
    status: 'pending' as const,
  });

  // Çoklu atamada her satır tüm görevlilerin id listesini taşır (kartta birlikte gösterim).
  const payload = ids.map((id) => ({ ...baseRow(id), group_staff_ids: ids }));

  let { data: rows, error } = await supabase
    .from('staff_assignments')
    .insert(payload)
    .select('id, assigned_staff_id');

  // group_staff_ids kolonu (migration 501) yoksa kolon olmadan tekrar dene.
  if (error && (error.message?.includes('group_staff_ids') || error.code === 'PGRST204')) {
    const retry = await supabase
      .from('staff_assignments')
      .insert(ids.map((id) => baseRow(id)))
      .select('id, assigned_staff_id');
    rows = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  const inserted = (rows ?? []) as { id: string; assigned_staff_id: string }[];
  if (inserted.length === 0) throw new Error(i18n.t('staffAssignCreateFailed'));

  let uploadedUrls: string[] = [];
  if (params.pendingAttachments.length > 0) {
    uploadedUrls = await uploadStaffAssignmentAttachments(inserted[0].id, params.pendingAttachments);
    await Promise.all(inserted.map((r) => patchStaffAssignmentAttachmentUrls(r.id, uploadedUrls)));
  }

  return { rows: inserted, uploadedUrls };
}

export function dispatchNewTaskAssignmentsNotify(
  items: NewTaskAssignmentNotifyParams[]
): void {
  if (!Array.isArray(items) || items.length === 0) return;
  for (const item of items) {
    dispatchNewTaskAssignmentNotify(item);
  }
}

export type TaskCompletionNotifyParams = {
  assignmentId: string;
  title: string;
  createdByStaffId: string | null;
  completedByStaffId: string;
  completedByStaffName: string;
};

/** Görevi veren admin/personele tamamlama push + uygulama içi bildirim. */
export type TaskFailureNotifyParams = {
  assignmentId: string;
  title: string;
  createdByStaffId: string | null;
  failedByStaffId: string;
  failedByStaffName: string;
  reason: string;
};

/** Görevi veren personele "yapılamadı" bildirimi. */
export function dispatchTaskFailureNotify(params: TaskFailureNotifyParams): void {
  const creatorId = params.createdByStaffId?.trim();
  if (!creatorId || creatorId === params.failedByStaffId) return;

  const assigneeLabel = params.failedByStaffName.trim() || i18n.t('staffTaskDoneNotifyStaffFallback');
  const taskTitle = params.title.trim() || i18n.t('staffTaskDoneNotifyTitleFallback');
  const reason = params.reason.trim();

  void sendNotification({
    staffId: creatorId,
    title: i18n.t('staffTaskFailedNotifyTitle'),
    body: i18n.t('staffTaskFailedNotifyBody', { name: assigneeLabel, title: taskTitle, reason }),
    notificationType: 'staff_task_failed',
    category: 'admin',
    createdByStaffId: params.failedByStaffId,
    data: {
      url: '/admin/tasks',
      assignmentId: params.assignmentId,
      screen: 'notifications',
    },
  });
}

export function dispatchTaskCompletionNotify(params: TaskCompletionNotifyParams): void {
  const creatorId = params.createdByStaffId?.trim();
  if (!creatorId || creatorId === params.completedByStaffId) return;

  const assigneeLabel = params.completedByStaffName.trim() || i18n.t('staffTaskDoneNotifyStaffFallback');
  const taskTitle = params.title.trim() || i18n.t('staffTaskDoneNotifyTitleFallback');

  void sendNotification({
    staffId: creatorId,
    title: i18n.t('staffTaskDoneNotifyTitle'),
    body: i18n.t('staffTaskDoneNotifyBody', { name: assigneeLabel, title: taskTitle }),
    notificationType: 'staff_task_done',
    category: 'admin',
    createdByStaffId: params.completedByStaffId,
    data: {
      url: '/admin/tasks',
      assignmentId: params.assignmentId,
      screen: 'notifications',
    },
  });
}
