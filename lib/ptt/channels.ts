/** PTT oda sabitleri ve LiveKit oda adı. */

export const PTT_DEFAULT_ROOM_SLUG = 'all_staff' as const;

/** @deprecated Eski kanal slug — varsayılan oda ile aynı. */
export const PTT_GENERAL_CHANNEL = PTT_DEFAULT_ROOM_SLUG;
export type PttChannelSlug = typeof PTT_DEFAULT_ROOM_SLUG;

export function isPttChannelSlug(value: string): value is PttChannelSlug {
  return value === PTT_DEFAULT_ROOM_SLUG;
}

export function buildPttLiveKitRoomName(roomId: string): string {
  const id = (roomId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return `ptt_room_${id || 'unknown'}`;
}
