import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  staffDeleteConversation,
  staffListConversations,
} from '@/lib/messagingApi';
import { subscribeStaffInboxLive, subscribeStaffInboxMessageInserts } from '@/lib/messagingUnreadSync';
import { consumeStaffConversationListDirty } from '@/lib/staffConversationListCache';
import { formatReplyMessagePreview } from '@/lib/chatPreviewText';
import type { ConversationWithMeta, Message } from '@/lib/messaging';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';

const MIN_LOAD_INTERVAL_MS = 5_000;
const INBOX_RELOAD_DEBOUNCE_MS = 1_400;

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.getTime() > now.getTime() - 86400000 * 2) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function AdminMessagesScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loadingRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inboxDirtyRef = useRef(false);

  const load = useCallback(
    async (opts?: { showRefreshing?: boolean; force?: boolean }) => {
      if (!staff) return;
      if (loadingRef.current) return;
      const now = Date.now();
      if (!opts?.force && now - lastLoadAtRef.current < MIN_LOAD_INTERVAL_MS) return;
      loadingRef.current = true;
      lastLoadAtRef.current = now;
      inboxDirtyRef.current = false;
      if (opts?.showRefreshing) setRefreshing(true);
      try {
        const list = await staffListConversations(staff.id);
        setConversations(list);
      } finally {
        if (opts?.showRefreshing) setRefreshing(false);
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [staff]
  );

  const applyIncomingInboxMessage = useCallback(
    (msg: Message) => {
      if (!msg?.conversation_id || msg.is_deleted) return;
      const isOwn =
        !!staff &&
        msg.sender_id === staff.id &&
        (msg.sender_type === 'staff' || msg.sender_type === 'admin');
      const preview = formatReplyMessagePreview(msg.message_type, msg.content);
      setConversations((prev) => {
        let found = false;
        const mapped = prev.map((c) => {
          if (c.id !== msg.conversation_id) return c;
          found = true;
          return {
            ...c,
            last_message_id: msg.id,
            last_message_at: msg.created_at,
            last_message_preview: preview,
            unread_count: isOwn ? c.unread_count ?? 0 : (c.unread_count ?? 0) + 1,
          };
        });
        if (!found) {
          inboxDirtyRef.current = true;
          return prev;
        }
        return mapped.sort((a, b) => {
          const ta = new Date(a.last_message_at ?? 0).getTime();
          const tb = new Date(b.last_message_at ?? 0).getTime();
          return tb - ta;
        });
      });
    },
    [staff]
  );

  useFocusEffect(
    useCallback(() => {
      if (!staff?.id) return () => {};
      // Bir sohbet okununca liste "dirty" olur → dönünce okunmadı rozetini tazelemek için zorla yenile.
      const listDirty = consumeStaffConversationListDirty();
      if (listDirty) {
        void load({ force: true });
      } else if (inboxDirtyRef.current || conversations.length === 0) {
        void load();
      }
      const unsub = subscribeStaffInboxLive(staff.id, () => {
        inboxDirtyRef.current = true;
        if (reloadDebounceRef.current) return;
        reloadDebounceRef.current = setTimeout(() => {
          reloadDebounceRef.current = null;
          void load();
        }, INBOX_RELOAD_DEBOUNCE_MS);
      });
      const unsubMsgs = subscribeStaffInboxMessageInserts(staff.id, applyIncomingInboxMessage);
      return () => {
        unsub();
        unsubMsgs();
        if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
        reloadDebounceRef.current = null;
      };
    }, [conversations.length, load, staff?.id, applyIncomingInboxMessage])
  );

  useEffect(() => {
    if (staff?.id) void load();
  }, [staff?.id, load]);

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!staff?.id) return;
    const name = item.name || 'Sohbet';
    Alert.alert('Sohbeti sil', `"${name}" sohbetini listenizden kaldırmak istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await staffDeleteConversation(item.id, staff.id);
          if (error) {
            Alert.alert('Hata', error);
            return;
          }
          setConversations((prev) => prev.filter((c) => c.id !== item.id));
        },
      },
    ]);
  };

  if (!staff) return null;

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.actions}>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/admin/messages/new')}>
          <Text style={styles.newBtnText}>+ Yeni sohbet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => router.push('/admin/messages/bulk')}>
          <Text style={styles.bulkBtnText}>Toplu mesaj</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => load({ showRefreshing: true, force: true })}
            colors={[MESSAGING_COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Henüz sohbet yok.</Text>
            <Text style={styles.emptySub}>Misafir veya personelle "Yeni sohbet" ile başlayın.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SwipeToDelete onSwipeDelete={() => handleDeleteConversation(item)}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/admin/messages/chat/[id]', params: { id: item.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                {(item.type === 'direct' ? item.other_avatar : item.avatar) ? (
                  <CachedImage
                    uri={(item.type === 'direct' ? item.other_avatar : item.avatar) as string}
                    style={styles.avatarImg}
                    contentFit="cover"
                  />
                ) : (
                  <Text style={styles.avatarText}>{(item.name || 'Sohbet').charAt(0)}</Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name || 'Sohbet'}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.last_message_preview || '—'}
                </Text>
              </View>
              <Text style={styles.rowTime}>{formatTime(item.last_message_at ?? null)}</Text>
              {(item.unread_count ?? 0) > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{item.unread_count}</Text>
                </View>
              )}
            </TouchableOpacity>
          </SwipeToDelete>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', padding: 12, gap: 8 },
  newBtn: {
    flex: 1,
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  bulkBtn: {
    flex: 1,
    backgroundColor: MESSAGING_COLORS.info,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  bulkBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  rowBody: { flex: 1 },
  rowTitle: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  rowPreview: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: MESSAGING_COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MESSAGING_COLORS.textSecondary },
  emptySub: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 8 },
});
