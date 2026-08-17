export type NotificationActorKind = 'staff' | 'guest' | 'app' | 'admin';

export type NotificationActorRef = {
  kind: NotificationActorKind;
  staffId?: string | null;
  guestId?: string | null;
  fallbackName?: string | null;
};

export type NotificationActorRow = {
  notification_type?: string | null;
  category?: string | null;
  created_by?: string | null;
  data?: Record<string, unknown> | null | undefined;
};

function pickStr(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const raw = data[k];
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) return t;
    }
  }
  return '';
}

/** Bildirimi tetikleyen personel / misafir / uygulama kaynağı. */
export function resolveNotificationActorRef(row: NotificationActorRow): NotificationActorRef {
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const nType = (row.notification_type ?? '').trim();
  const category = (row.category ?? '').trim();

  const staffId =
    (typeof row.created_by === 'string' ? row.created_by.trim() : '') ||
    pickStr(
      data,
      'createdByStaffId',
      'created_by_staff_id',
      'actorStaffId',
      'actor_staff_id',
      'senderStaffId',
      'senderId',
      'sender_id',
      'fromStaffId',
      'markedByStaffId',
      'completedByStaffId',
      'auditorStaffId',
      'uploaderStaffId',
      'likerStaffId',
      'completedByStaffId'
    ) ||
    null;

  const guestId =
    pickStr(data, 'guestId', 'guest_id', 'senderGuestId', 'likerGuestId', 'authorGuestId') || null;

  const fallbackName =
    pickStr(data, 'actorName', 'senderName', 'staffName', 'guestName', 'name', 'speakerName', 'speaker_name') ||
    null;

  if (staffId) {
    return { kind: 'staff', staffId, fallbackName };
  }
  if (guestId) {
    return { kind: 'guest', guestId, fallbackName };
  }

  if (
    category === 'admin' ||
    category === 'bulk' ||
    category === 'emergency' ||
    nType.startsWith('admin_') ||
    nType.startsWith('guest_welcome') ||
    nType === 'staff_feature_intro'
  ) {
    return { kind: category === 'admin' ? 'admin' : 'app', fallbackName: 'Valoria' };
  }

  return { kind: 'app', fallbackName: 'Valoria' };
}

export type NotificationActorProfile = {
  kind: NotificationActorKind;
  name: string;
  avatarUrl: string | null;
  subtitle?: string | null;
};

export function buildNotificationActorProfile(
  row: NotificationActorRow,
  staffById: Map<string, { full_name: string | null; profile_image: string | null; department?: string | null }>,
  guestById: Map<string, { full_name: string | null; photo_url: string | null }>
): NotificationActorProfile {
  const ref = resolveNotificationActorRef(row);

  if (ref.staffId) {
    const staff = staffById.get(ref.staffId);
    return {
      kind: 'staff',
      name: staff?.full_name?.trim() || ref.fallbackName?.trim() || 'Personel',
      avatarUrl: staff?.profile_image?.trim() || null,
      subtitle: staff?.department?.trim() || null,
    };
  }

  if (ref.guestId) {
    const guest = guestById.get(ref.guestId);
    return {
      kind: 'guest',
      name: guest?.full_name?.trim() || ref.fallbackName?.trim() || 'Misafir',
      avatarUrl: guest?.photo_url?.trim() || null,
      subtitle: null,
    };
  }

  if (ref.kind === 'admin') {
    return {
      kind: 'admin',
      name: 'Yönetim',
      avatarUrl: null,
      subtitle: 'Valoria Admin',
    };
  }

  return {
    kind: 'app',
    name: 'Valoria',
    avatarUrl: null,
    subtitle: null,
  };
}
