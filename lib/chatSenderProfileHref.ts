import { mapUserProfileHref } from '@/lib/map/mapUserProfileHref';
import type { ParticipantType } from '@/lib/messaging';

/** Mesaj göndereninin profil rotası (staff / guest / admin). */
export function chatSenderProfileHref(opts: {
  senderId: string;
  senderType: ParticipantType;
  pathname?: string | null;
}): string | null {
  const { senderId, senderType, pathname } = opts;
  if (!senderId?.trim()) return null;
  if (senderType === 'guest') {
    return mapUserProfileHref({ userId: senderId, userType: 'guest', pathname });
  }
  if (senderType === 'staff' || senderType === 'admin') {
    return mapUserProfileHref({ userId: senderId, userType: 'staff', pathname });
  }
  return null;
}
