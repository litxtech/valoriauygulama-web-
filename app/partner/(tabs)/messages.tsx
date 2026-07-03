import { useCallback, useRef, useState, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { PartnerEmptyState, PartnerPrimaryButton, PartnerScreenTitle } from '@/components/breakfastPartner/PartnerUi';
import { partnerDeleteConversation, partnerListConversations } from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { usePartnerMessagingStore } from '@/stores/partnerMessagingStore';
import { formatRelative } from '@/lib/date';
import { CachedImage } from '@/components/CachedImage';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

const LIST_CACHE_TTL_MS = 90_000;
const MIN_LOAD_INTERVAL_MS = 5_000;
const ROW_HEIGHT = 78;

let partnerMessagesCache: ConversationWithMeta[] = [];
let partnerMessagesCacheAt = 0;

const PartnerMessageRow = memo(function PartnerMessageRow({
  item,
  onPress,
  onLongPress,
}: {
  item: ConversationWithMeta;
  onPress: (item: ConversationWithMeta) => void;
  onLongPress: (item: ConversationWithMeta) => void;
}) {
  const unread = item.unread_count ?? 0;
  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.75}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
    >
      <View style={styles.avatar}>
        {item.avatar ? (
          <CachedImage uri={item.avatar} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Ionicons name="person" size={22} color={partnerTheme.muted} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name || 'Sohbet'}
        </Text>
        <Text style={styles.preview} numberOfLines={1}>
          {item.last_message_preview || '—'}
        </Text>
      </View>
      <View style={styles.meta}>
        <Text style={styles.time}>
          {item.last_message_at ? formatRelative(item.last_message_at) : '—'}
        </Text>
        {unread > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

export default function PartnerMessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const setUnreadCount = usePartnerMessagingStore((s) => s.setUnreadCount);
  const [rows, setRows] = useState<ConversationWithMeta[]>(() => partnerMessagesCache);
  const [loading, setLoading] = useState(() => partnerMessagesCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const lastLoadAtRef = useRef(0);

  const load = useCallback(
    async (opts?: { force?: boolean; showRefreshing?: boolean }) => {
      if (inFlightRef.current) return;
      const now = Date.now();
      if (!opts?.force && now - lastLoadAtRef.current < MIN_LOAD_INTERVAL_MS) return;
      inFlightRef.current = true;
      lastLoadAtRef.current = now;
      if (opts?.showRefreshing) setRefreshing(true);
      try {
        const list = await partnerListConversations();
        partnerMessagesCache = list;
        partnerMessagesCacheAt = Date.now();
        setRows(list);
        setUnreadCount(list.reduce((s, c) => s + (c.unread_count ?? 0), 0));
      } catch {
        if (partnerMessagesCache.length === 0) setRows([]);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [setUnreadCount]
  );

  useFocusEffect(
    useCallback(() => {
      const hasCache = partnerMessagesCache.length > 0;
      const fresh = Date.now() - partnerMessagesCacheAt < LIST_CACHE_TTL_MS;
      if (hasCache) {
        setRows(partnerMessagesCache);
        setLoading(false);
      }
      if (!hasCache || !fresh) void load();
    }, [load])
  );

  const openConversation = useCallback(
    (item: ConversationWithMeta) => {
      router.push({
        pathname: '/partner/chat/[id]',
        params: { id: item.id, name: item.name || 'Sohbet' },
      });
    },
    [router]
  );

  const removeConversation = useCallback((item: ConversationWithMeta) => {
    Alert.alert('Sohbeti sil', `${item.name || 'Sohbet'} listeden kaldırılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const ok = await partnerDeleteConversation(item.id);
          if (!ok) {
            Alert.alert('Hata', 'Sohbet silinemedi.');
            return;
          }
          setRows((prev) => {
            const next = prev.filter((r) => r.id !== item.id);
            partnerMessagesCache = next;
            partnerMessagesCacheAt = Date.now();
            return next;
          });
        },
      },
    ]);
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: ConversationWithMeta }) => (
      <PartnerMessageRow item={item} onPress={openConversation} onLongPress={removeConversation} />
    ),
    [openConversation, removeConversation]
  );

  return (
    <View style={styles.root}>
      <PartnerScreenTitle title="Mesajlar" subtitle="Personel ile yazışmalarınız" />
      <View style={styles.actions}>
        <PartnerPrimaryButton label="Yeni sohbet" onPress={() => router.push('/partner/new-chat')} />
      </View>
      {loading && rows.length === 0 ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlashList
          data={rows}
          estimatedItemSize={ROW_HEIGHT}
          drawDistance={280}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: listBottomPad }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load({ force: true, showRefreshing: true })}
              tintColor={partnerTheme.accent}
            />
          }
          ListEmptyComponent={
            <PartnerEmptyState
              icon="chatbubbles-outline"
              title="Henüz mesaj yok"
              body="Personel ile yeni sohbet başlatın."
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  actions: { paddingHorizontal: 18, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: partnerTheme.cardBorder,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  name: { color: partnerTheme.text, fontWeight: '700', fontSize: 16 },
  preview: { color: partnerTheme.muted, fontSize: 13, marginTop: 2 },
  meta: { alignItems: 'flex-end', gap: 6 },
  time: { color: partnerTheme.mutedSoft, fontSize: 11 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: partnerTheme.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: '#0f172a', fontSize: 11, fontWeight: '800' },
});
