import { fetchKbsCaptureNotifyStaffIds } from '@/lib/kbsCaptureSettings';
import { sendNotificationToStaffIds } from '@/lib/notificationService';

export async function notifyKbsDocumentCaptured(params: {
  organizationId: string;
  createdByStaffId: string;
  roomNumber: string | number;
  count?: number;
}): Promise<{ count: number }> {
  const { organizationId, createdByStaffId, roomNumber, count } = params;
  const staffIds = await fetchKbsCaptureNotifyStaffIds(organizationId);
  if (staffIds.length === 0) return { count: 0 };

  const n = count && count > 1 ? count : 1;
  const body =
    n > 1
      ? `${n} yeni kimlik kaydı ${roomNumber} odasına eklendi.`
      : `${roomNumber} odası için yeni kimlik kaydı oluşturuldu.`;

  const result = await sendNotificationToStaffIds({
    staffIds,
    title: 'Yeni Kimlik Girişi',
    body,
    createdByStaffId,
    notificationType: 'kbs_document_captured',
    category: 'staff',
    data: {
      screen: '/staff/kbs/capture-history',
      url: '/staff/kbs/capture-history',
      roomNumber,
      batchCount: n,
    },
  });
  return { count: result.count };
}
