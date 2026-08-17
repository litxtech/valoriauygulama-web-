import { sendNotificationToStaffIds } from '@/lib/notificationService';
import { formatDepartureDate } from './labels';

function buildBody(params: {
  departureDate: string;
  note?: string | null;
  isUpdate?: boolean;
  isCancelled?: boolean;
}): string {
  const dateLabel = formatDepartureDate(params.departureDate);
  if (params.isCancelled) {
    return `Planlanan ayrılış kaydınız iptal edildi. (${dateLabel})`;
  }
  const prefix = params.isUpdate ? 'Ayrılış tarihiniz güncellendi: ' : 'Otelden ayrılış tarihiniz: ';
  const note = params.note?.trim();
  if (note) return `${prefix}${dateLabel} · ${note}`;
  return `${prefix}${dateLabel}`;
}

export async function notifyStaffDepartureScheduled(params: {
  departureId: string;
  subjectStaffId: string;
  departureDate: string;
  note?: string | null;
  createdByStaffId: string;
  staffName?: string | null;
}): Promise<{ count: number; error?: string }> {
  const title = params.staffName
    ? `${params.staffName} · Ayrılış planı`
    : 'Ayrılış planı oluşturuldu';

  return sendNotificationToStaffIds({
    staffIds: [params.subjectStaffId],
    title,
    body: buildBody({ departureDate: params.departureDate, note: params.note }),
    createdByStaffId: params.createdByStaffId,
    notificationType: 'staff_departure_scheduled',
    category: 'staff',
    data: {
      href: '/staff/(tabs)/notifications',
      departureId: params.departureId,
      screen: 'staff_departure',
      notificationType: 'staff_departure_scheduled',
    },
  });
}

export async function notifyStaffDepartureUpdated(params: {
  departureId: string;
  subjectStaffId: string;
  departureDate: string;
  note?: string | null;
  updatedByStaffId: string;
}): Promise<{ count: number; error?: string }> {
  return sendNotificationToStaffIds({
    staffIds: [params.subjectStaffId],
    title: 'Ayrılış tarihi güncellendi',
    body: buildBody({
      departureDate: params.departureDate,
      note: params.note,
      isUpdate: true,
    }),
    createdByStaffId: params.updatedByStaffId,
    notificationType: 'staff_departure_updated',
    category: 'staff',
    data: {
      href: '/staff/(tabs)/notifications',
      departureId: params.departureId,
      screen: 'staff_departure',
      notificationType: 'staff_departure_updated',
    },
  });
}

export async function notifyStaffDepartureCancelled(params: {
  departureId: string;
  subjectStaffId: string;
  departureDate: string;
  updatedByStaffId: string;
}): Promise<{ count: number; error?: string }> {
  return sendNotificationToStaffIds({
    staffIds: [params.subjectStaffId],
    title: 'Ayrılış planı iptal',
    body: buildBody({
      departureDate: params.departureDate,
      isCancelled: true,
    }),
    createdByStaffId: params.updatedByStaffId,
    notificationType: 'staff_departure_cancelled',
    category: 'staff',
    data: {
      href: '/staff/(tabs)/notifications',
      departureId: params.departureId,
      screen: 'staff_departure',
      notificationType: 'staff_departure_cancelled',
    },
  });
}
