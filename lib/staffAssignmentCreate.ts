import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { publishTaskAssignmentBoardNotice } from '@/lib/staffBoard';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { STAFF_TASK_MEDIA_BUCKET } from '@/lib/staffAssignmentMedia';

export type PendingAssignmentAttachment = { uri: string; type: 'image' | 'video' };

/** Görev eklerini paralel yükler (video için stream upload). */
export async function uploadStaffAssignmentAttachments(
  assignmentId: string,
  items: PendingAssignmentAttachment[]
): Promise<string[]> {
  if (items.length === 0) return [];
  return Promise.all(
    items.map(async (item) => {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: STAFF_TASK_MEDIA_BUCKET,
        uri: item.uri,
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
        title: 'Yeni görev atandı',
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
  const ids = params.assigneeStaffIds.filter(Boolean);
  if (ids.length === 0) throw new Error('Atanan personel seçin');

  const payload = ids.map((assigned_staff_id) => ({
    title: params.title,
    body: params.body,
    task_type: params.taskType,
    priority: params.priority,
    assigned_staff_id,
    created_by_staff_id: params.createdByStaffId,
    room_ids: params.roomIds,
    due_at: params.dueAt,
    status: 'pending' as const,
  }));

  const { data: rows, error } = await supabase
    .from('staff_assignments')
    .insert(payload)
    .select('id, assigned_staff_id');

  if (error) throw error;
  const inserted = (rows ?? []) as { id: string; assigned_staff_id: string }[];
  if (inserted.length === 0) throw new Error('Görev kaydı oluşturulamadı');

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
  for (const item of items) {
    dispatchNewTaskAssignmentNotify(item);
  }
}
