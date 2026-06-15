/**
 * Tab menü mesaj rozeti — sohbet listesine girmeden güncelleme (realtime + push).
 */
import { supabase } from '@/lib/supabase';
import { guestListConversations } from '@/lib/messagingApi';
import { fetchStaffMessagingUnreadCount } from '@/lib/messagingUnreadCount';
import { useAuthStore } from '@/stores/authStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleDebounced(key: string, fn: () => void, delayMs: number): void {
  const prev = debounceTimers.get(key);
  if (prev) clearTimeout(prev);
  if (delayMs <= 0) {
    debounceTimers.delete(key);
    fn();
    return;
  }
  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, delayMs)
  );
}

export function isMessagePushPayload(data: Record<string, unknown> | undefined): boolean {
  if (!data) return false;
  if (data.screen === 'messages') return true;
  const nt =
    typeof data.notificationType === 'string'
      ? data.notificationType
      : typeof data.notification_type === 'string'
        ? data.notification_type
        : '';
  if (nt === 'message') return true;
  if (typeof data.conversationId === 'string' && data.conversationId.trim()) return true;
  if (typeof data.conversation_id === 'string' && data.conversation_id.trim()) return true;
  const url = typeof data.url === 'string' ? data.url : '';
  if (url.includes('/chat/')) return true;
  return false;
}

export function scheduleStaffMessagingUnreadRefresh(staffId: string, delayMs = 280): void {
  scheduleDebounced(`staff:${staffId}`, () => {
    void useStaffUnreadMessagesStore.getState().refreshUnread(staffId);
  }, delayMs);
}

export function scheduleGuestMessagingUnreadRefresh(appToken: string, delayMs = 280): void {
  scheduleDebounced(`guest:${appToken}`, () => {
    void guestListConversations(appToken).then((list) => {
      const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
      useGuestMessagingStore.getState().setUnreadCount(total);
    });
  }, delayMs);
}

/** Push geldiğinde tab rozeti anında artsın; ardından sunucu ile eşitlenir. */
export function bumpMessagingUnreadOnPush(payload: Record<string, unknown> | undefined): void {
  if (!isMessagePushPayload(payload)) return;
  const staff = useAuthStore.getState().staff;
  if (staff) {
    useStaffUnreadMessagesStore.getState().bumpUnread(1);
    scheduleStaffMessagingUnreadRefresh(staff.id, 80);
    return;
  }
  useGuestMessagingStore.getState().bumpUnread(1);
  const token = useGuestMessagingStore.getState().appToken;
  if (token) scheduleGuestMessagingUnreadRefresh(token, 80);
}

export type MessagingUnreadScope =
  | { kind: 'staff'; staffId: string }
  | { kind: 'guest'; guestId: string };

/**
 * Katılımcı satırı değişince tab rozeti güncelle (global messages dinleyicisi yok — pil/ısı).
 */
export function subscribeMessagingUnreadLive(scope: MessagingUnreadScope, onUpdate: () => void): () => void {
  const participantId = scope.kind === 'staff' ? scope.staffId : scope.guestId;
  const channel = supabase
    .channel(`messaging_unread_${participantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversation_participants',
        filter: `participant_id=eq.${participantId}`,
      },
      () => onUpdate()
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** Personel: tam liste yenileme (sohbet listesi ekranı). */
export async function refreshStaffMessagingUnreadFull(staffId: string): Promise<number> {
  const total = await fetchStaffMessagingUnreadCount(staffId);
  useStaffUnreadMessagesStore.getState().setUnreadCount(total);
  return total;
}
