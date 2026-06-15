import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useGuestMessagingStore,
  GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY,
  clearGuestMessagingLocalState,
} from '@/stores/guestMessagingStore';
import { guestDeleteConversation, guestListConversations } from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { supabase } from '@/lib/supabase';
import { formatRelative } from '@/lib/date';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { useChatTheme } from '@/hooks/useScreenTheme';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';

/** Sohbet adından avatar emoji tahmini: oda numarası → grup, aksi halde ilk harf */
function chatAvatarChar(name: string | null | undefined, chatFallback: string): string {
  const n = (name || chatFallback).trim();
  if (/^\d+/.test(n)) return '👨‍👩‍👧'; // Oda numarası (örn. 102 Nolu Oda)
  const first = n.charAt(0).toUpperCase();
  return first || '💬';
}

export default function CustomerMessagesScreen() {
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const chat = useChatTheme();
  const styles = useMemo(() => createCustomerMessagesStyles(palette, chat), [palette, chat]);
  const router = useRouter();
  const { appToken, setAppToken, loadStoredToken, setUnreadCount } = useGuestMessagingStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  const sessionUserId = useAuthStore((s) => s.user?.id ?? null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStoredToken();
      if (cancelled) return;
      const nextToken = await syncGuestMessagingAppToken();
      const { data: { session: s } } = await supabase.auth.getSession();
      if (!s?.user) {
        await clearGuestMessagingLocalState();
        setConversations([]);
        setHasSession(false);
        setAuthChecked(true);
        setLoading(false);
        return;
      }
      const prev = useGuestMessagingStore.getState().appToken;
      if (!nextToken) await setAppToken(null);
      if (prev && nextToken && prev !== nextToken) {
        setConversations([]);
        await AsyncStorage.removeItem(GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY).catch(() => {});
      }
      if (nextToken) {
        try {
          const raw = await AsyncStorage.getItem(GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as { conversations?: ConversationWithMeta[]; appToken?: string };
            if (parsed.appToken === nextToken && Array.isArray(parsed.conversations) && parsed.conversations.length > 0) {
              setConversations(parsed.conversations);
            }
          }
        } catch {
          /* önbellek okunamazsa sunucudan yüklenecek */
        }
      }
      if (cancelled) return;
      setHasSession(true);
      setAuthChecked(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [sessionUserId]);

  useFocusEffect(
    useCallback(() => {
      if (!appToken || !authChecked) {
        if (authChecked) setConversations([]);
        setLoading(false);
        return () => {};
      }
      void loadConversations();
      return () => {};
    }, [appToken, authChecked])
  );

  const loadConversations = async () => {
    if (!appToken) return;
    setRefreshing(true);
    const list = await guestListConversations(appToken);
    const totalUnread = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setUnreadCount(totalUnread);
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.last_message_at ?? 0).getTime();
      const tb = new Date(b.last_message_at ?? 0).getTime();
      return tb - ta;
    });
    setConversations(sorted);
    void AsyncStorage.setItem(
      GUEST_CUSTOMER_MESSAGES_LIST_CACHE_KEY,
      JSON.stringify({ conversations: sorted, updatedAt: Date.now(), appToken: appToken ?? '' })
    ).catch(() => {});
    setRefreshing(false);
    setLoading(false);
  };

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!appToken) return;
    const name = item.name || t('chatConversationFallback');
    Alert.alert(t('customerChatDeleteTitle'), t('customerChatDeleteMessage', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const ok = await guestDeleteConversation(appToken, item.id);
          if (!ok) {
            Alert.alert(t('error'), t('customerChatDeleteFailed'));
            return;
          }
          setConversations((prev) => prev.filter((c) => c.id !== item.id));
        },
      },
    ]);
  };

  if (authChecked && !appToken) {
    if (!hasSession) {
      return (
        <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
          <View style={styles.loginPrompt}>
            <Text style={styles.loginTitle}>{t('customerMessagesTitle')}</Text>
            <Text style={styles.loginSubtitle}>
              {t('customerMessagesLoginHint')}
            </Text>
            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/auth')} activeOpacity={0.8}>
              <Text style={styles.loginBtnText}>{t('signInButton')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
        <View style={styles.loginPrompt}>
          <Text style={styles.loginTitle}>{t('customerMessagesTitle')}</Text>
          <Text style={styles.loginSubtitle}>{t('customerMessagesAccountLoading')}</Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={async () => {
              await syncGuestMessagingAppToken();
              setAuthChecked(false);
              setLoading(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>{t('feedRetryButton')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadConversations}
            colors={[MESSAGING_COLORS.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('customerMessagesNoChats')}</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const name = item.name || t('chatConversationFallback');
          const unread = item.unread_count ?? 0;
          return (
            <SwipeToDelete onSwipeDelete={() => handleDeleteConversation(item)}>
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/customer/chat/[id]',
                    params: { id: item.id, name },
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                  {item.avatar ? (
                    <CachedImage uri={item.avatar} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{chatAvatarChar(name, t('chatConversationFallback'))}</Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.cardPreview} numberOfLines={1}>
                    {item.last_message_preview || '—'}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>
                    {item.last_message_at ? formatRelative(item.last_message_at) : '—'}
                  </Text>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeToDelete>
          );
        }}
      />
    </View>
  );
}

function createCustomerMessagesStyles(palette: PersonelDesignPalette, chat: ChatThemePalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: palette.pageBg },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: palette.pageBg },
  listContent: { padding: 12, paddingBottom: 24 },
  loginPrompt: {
    margin: 16,
    padding: 20,
    backgroundColor: palette.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  loginTitle: { fontSize: 20, fontWeight: '700', color: palette.text, marginBottom: 8 },
  loginSubtitle: { fontSize: 14, color: palette.subtext, marginBottom: 16, lineHeight: 20 },
  loginBtn: {
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  loginBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: chat.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: chat.border,
    ...(Platform.OS === 'android' && { elevation: 1 }),
    ...(Platform.OS === 'ios' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
    }),
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.secondaryBtn,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  avatarText: { fontSize: 24 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontWeight: '600', fontSize: 16, color: chat.text },
  cardPreview: { fontSize: 14, color: chat.textSecondary, marginTop: 2 },
  cardMeta: { alignItems: 'flex-end', marginLeft: 8 },
  cardTime: { fontSize: 12, color: chat.textMuted },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: chat.unreadBadge,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: chat.textSecondary },
  });
}
