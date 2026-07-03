import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import {
  staffDeleteConversation,
  staffListConversations,
  staffSetConversationMuted,
  staffSetConversationArchived,
} from '@/lib/messagingApi';
import { subscribeStaffInboxLive, subscribeStaffInboxMessageInserts } from '@/lib/messagingUnreadSync';
import { formatReplyMessagePreview } from '@/lib/chatPreviewText';
import type { Message } from '@/lib/messaging';
import { ChatListSwipeRow, type ChatListSwipeAction } from '@/components/chat/ChatListSwipeRow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import type { ConversationWithMeta } from '@/lib/messaging';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { FlashList } from '@shopify/flash-list';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { BulkSelectionHeader } from '@/components/chat/BulkSelectionHeader';
import { MessagesListHeader, type MessagesFilter } from '@/components/chat/MessagesListHeader';
import { useMessageSelection } from '@/hooks/chat/useMessageSelection';
import { chatLayout } from '@/constants/chatTheme';

const ALL_STAFF_GROUP_NAME_DB = 'Tüm Çalışanlar';
let conversationListCache: ConversationWithMeta[] = [];
let conversationListCacheUpdatedAt = 0;
let conversationListDirty = false;
const LIST_CACHE_TTL_MS = 90_000;
const MIN_LOAD_INTERVAL_MS = 5_000;
const STAFF_MESSAGES_PERSIST_KEY = 'staff_messages_list_cache_v1';

function formatTime(iso: string | null, lang: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const loc = lang.startsWith('ar') ? 'ar-SA' : lang.startsWith('tr') ? 'tr-TR' : 'en-US';
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  }
  if (d.getTime() > now.getTime() - 86400000 * 2) return i18n.t('staffMessagesYesterday');
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
}

function sortConversations(list: ConversationWithMeta[]): ConversationWithMeta[] {
  return [...list].sort((a, b) => {
    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (b.unread_count ?? 0) - (a.unread_count ?? 0);
  });
}

export default function StaffMessagesTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const listBottomPad = getFloatingTabBarTotalHeight(insets) + 16;
  const chat = useChatTheme();
  const styles = useMemo(() => createStaffMessagesStyles(chat), [chat]);
  const { t, i18n } = useTranslation();
  const { staff } = useAuthStore();
  const { setUnreadCount } = useStaffUnreadMessagesStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>(() => conversationListCache);
  const [loading, setLoading] = useState(() => conversationListCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<MessagesFilter>('all');
  const loadingRef = useRef(false);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadAtRef = useRef(0);

  const {
    selectionMode,
    selectedIds,
    selectedCount,
    enterSelection,
    exitSelection,
    toggle,
    selectAll,
    isSelected,
  } = useMessageSelection<ConversationWithMeta>();

  useEffect(() => {
    let cancelled = false;
    if (conversationListCache.length > 0) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STAFF_MESSAGES_PERSIST_KEY);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as {
          conversations?: ConversationWithMeta[];
          updatedAt?: number;
        };
        const cachedList = Array.isArray(parsed?.conversations) ? parsed.conversations : [];
        if (cachedList.length === 0) return;
        conversationListCache = cachedList;
        conversationListCacheUpdatedAt = Number(parsed?.updatedAt ?? Date.now());
        conversationListDirty = false;
        setConversations(cachedList);
      } catch {
        /* */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(
    async (opts?: { showRefreshing?: boolean; force?: boolean }) => {
      if (!staff) return;
      if (loadingRef.current) return;
      const now = Date.now();
      if (!opts?.force && now - lastLoadAtRef.current < MIN_LOAD_INTERVAL_MS) return;
      loadingRef.current = true;
      lastLoadAtRef.current = now;
      if (opts?.showRefreshing) setRefreshing(true);
      try {
        const list = await staffListConversations(staff.id);
        conversationListCache = list;
        conversationListCacheUpdatedAt = Date.now();
        conversationListDirty = false;
        setConversations(list);
        void AsyncStorage.setItem(
          STAFF_MESSAGES_PERSIST_KEY,
          JSON.stringify({ conversations: list, updatedAt: conversationListCacheUpdatedAt })
        ).catch(() => {});
        const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);
      } finally {
        if (opts?.showRefreshing) setRefreshing(false);
        setLoading(false);
        loadingRef.current = false;
      }
    },
    [staff, setUnreadCount]
  );

  /** Yeni mesaj gelince listeyi ağ turu olmadan anında güncelle (önizleme/sıra/okunmamış). */
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
        const next = prev.map((c) => {
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
          // Listede olmayan (yeni) sohbet → katılımcı dinleyicisi tam yenileme yapar.
          conversationListDirty = true;
          return prev;
        }
        conversationListCache = next;
        conversationListCacheUpdatedAt = Date.now();
        return next;
      });
    },
    [staff]
  );

  useFocusEffect(
    useCallback(() => {
      const hasCache = conversationListCache.length > 0;
      const isCacheFresh = Date.now() - conversationListCacheUpdatedAt < LIST_CACHE_TTL_MS;
      if (!hasCache || conversationListDirty || !isCacheFresh) {
        load();
      }
      if (!staff?.id) return () => {};
      const unsub = subscribeStaffInboxLive(staff.id, () => {
        conversationListDirty = true;
        if (reloadDebounceRef.current) return;
        reloadDebounceRef.current = setTimeout(() => {
          reloadDebounceRef.current = null;
          load();
        }, 650);
      });
      const unsubMsgs = subscribeStaffInboxMessageInserts(staff.id, applyIncomingInboxMessage);
      return () => {
        unsub();
        unsubMsgs();
        if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
        reloadDebounceRef.current = null;
      };
    }, [load, staff?.id, applyIncomingInboxMessage])
  );

  const unreadTotal = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0),
    [conversations]
  );

  const allStaffConv = useMemo(
    () => conversations.find((c) => c.type === 'group' && c.name === ALL_STAFF_GROUP_NAME_DB) ?? null,
    [conversations]
  );

  const editableGroupConv = useMemo(
    () => allStaffConv ?? conversations.find((c) => c.type === 'group') ?? null,
    [allStaffConv, conversations]
  );

  const filteredBase = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = conversations;

    if (q) {
      list = list.filter((c) => {
        const name = (c.name ?? '').toLowerCase();
        const preview = (c.last_message_preview ?? '').toLowerCase();
        return name.includes(q) || preview.includes(q);
      });
    }

    if (activeFilter === 'groups') {
      list = list.filter((c) => c.type === 'group');
    } else if (activeFilter === 'unread') {
      list = list.filter((c) => (c.unread_count ?? 0) > 0);
    }

    return list;
  }, [conversations, searchQuery, activeFilter]);

  const frequentChats = useMemo(() => {
    if (searchQuery.trim()) return [];
    return sortConversations(filteredBase.filter((c) => Boolean(c.last_message_at))).slice(0, 12);
  }, [filteredBase, searchQuery]);

  const displayConversations = useMemo(() => sortConversations(filteredBase), [filteredBase]);

  const formatTimeForItem = useCallback(
    (item: ConversationWithMeta) => formatTime(item.last_message_at ?? null, i18n.language),
    [i18n.language]
  );

  const getDisplayName = useCallback(
    (item: ConversationWithMeta) => {
      const isAllStaff = item.type === 'group' && item.name === ALL_STAFF_GROUP_NAME_DB;
      return isAllStaff ? t('staffAllStaffGroupName') : item.name || t('messages');
    },
    [t]
  );

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!staff?.id) return;
    const name = getDisplayName(item);
    Alert.alert(t('staffMessagesDeleteChatTitle'), name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('staffChatActionDeleteMe'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await staffDeleteConversation(item.id, staff.id);
          if (error) {
            Alert.alert(t('error'), error);
            return;
          }
          setConversations((prev) => prev.filter((c) => c.id !== item.id));
          conversationListCache = conversationListCache.filter((c) => c.id !== item.id);
          conversationListCacheUpdatedAt = Date.now();
        },
      },
    ]);
  };

  const confirmBulkDelete = () => {
    if (!staff?.id || selectedIds.length === 0) return;
    const isAdmin = staff.role === 'admin';
    Alert.alert(
      t('staffMessagesBulkDeleteTitle', { count: selectedIds.length }),
      undefined,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('staffChatActionDeleteMe'),
          style: 'destructive',
          onPress: async () => {
            const results = await Promise.all(
              selectedIds.map((id) => staffDeleteConversation(id, staff.id))
            );
            const failed = results.filter((r) => r.error).length;
            const okIds = selectedIds.filter((_, i) => !results[i].error);
            if (okIds.length) {
              setConversations((prev) => prev.filter((c) => !okIds.includes(c.id)));
              conversationListCache = conversationListCache.filter((c) => !okIds.includes(c.id));
            }
            exitSelection();
            if (failed > 0) Alert.alert(t('error'), t('staffMessagesBulkDeleteFailed', { count: failed }));
          },
        },
        ...(isAdmin
          ? [
              {
                text: t('staffMessagesDeleteForEveryone'),
                style: 'destructive' as const,
                onPress: () => {
                  Alert.alert(t('info'), t('staffChatDeleteGroupAdminHint'));
                },
              },
            ]
          : []),
      ]
    );
  };

  const openGroupEdit = () => {
    if (!editableGroupConv) {
      Alert.alert(t('info'), t('messagesGroupEditNotFound'));
      return;
    }
    router.push({
      pathname: '/staff/chat/[id]',
      params: { id: editableGroupConv.id, openGroupSettings: '1' },
    });
  };

  useLayoutEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        headerShown: true,
        headerTitle: () => null,
        headerLeft: () => null,
        headerRight: () => null,
      });
      return;
    }
    navigation.setOptions({
      headerShown: true,
      headerTitle: undefined,
      headerLeft: undefined,
      headerRight: () =>
        staff?.role === 'admin' ? (
          <Pressable onPress={openGroupEdit} hitSlop={10} style={styles.headerIconBtn}>
            <Ionicons name="settings-outline" size={22} color={chat.text} />
          </Pressable>
        ) : null,
    });
  }, [navigation, selectionMode, staff?.role, editableGroupConv?.id]);

  const openChat = useCallback(
    (item: ConversationWithMeta) => {
      router.push({ pathname: '/staff/chat/[id]', params: { id: item.id } });
    },
    [router]
  );

  const onSwipeAction = useCallback(
    (item: ConversationWithMeta, action: ChatListSwipeAction) => {
      if (!staff?.id) return;
      if (action === 'mute') {
        const next = !(item.is_muted ?? false);
        void staffSetConversationMuted(item.id, staff.id, next).then(({ error }) => {
          if (error) Alert.alert(t('error'), error);
          else {
            setConversations((prev) =>
              prev.map((c) => (c.id === item.id ? { ...c, is_muted: next } : c))
            );
          }
        });
        return;
      }
      if (action === 'archive') {
        void staffSetConversationArchived(item.id, staff.id, true).then(({ error }) => {
          if (error) Alert.alert(t('error'), error);
          else setConversations((prev) => prev.filter((c) => c.id !== item.id));
        });
        return;
      }
      handleDeleteConversation(item);
    },
    [staff?.id, t]
  );

  const renderRow = useCallback(
    ({ item }: { item: ConversationWithMeta }) => (
      <ChatListSwipeRow
        enabled={!selectionMode}
        isMuted={item.is_muted}
        onAction={(action) => onSwipeAction(item, action)}
      >
        <ChatListItem
          item={item}
          chatPalette={chat}
          displayName={getDisplayName(item)}
          timeLabel={formatTime(item.last_message_at ?? null, i18n.language)}
          selected={isSelected(item.id)}
          selectionMode={selectionMode}
          onPress={() => {
            if (selectionMode) {
              toggle(item.id);
              return;
            }
            openChat(item);
          }}
          onLongPress={() => {
            if (!selectionMode) enterSelection(item.id);
            else toggle(item.id);
          }}
        />
      </ChatListSwipeRow>
    ),
    [
      selectionMode,
      chat,
      getDisplayName,
      i18n.language,
      isSelected,
      toggle,
      enterSelection,
      openChat,
      onSwipeAction,
    ]
  );

  if (!staff) return null;

  const listHeader = selectionMode ? null : (
    <MessagesListHeader
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      frequentChats={frequentChats}
      getDisplayName={getDisplayName}
      formatTime={formatTimeForItem}
      onFrequentPress={openChat}
      onNewChat={() => router.push('/staff/new-chat')}
      onNewGroup={staff.role === 'admin' ? () => router.push('/staff/new-group') : undefined}
      isAdmin={staff.role === 'admin'}
      unreadTotal={unreadTotal}
      showAllChatsLabel
    />
  );

  const showEmpty = !loading && displayConversations.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: chat.background }]}>
      {selectionMode ? (
        <View style={[styles.selectionBar, { paddingTop: insets.top + 4 }]}>
          <BulkSelectionHeader
            count={selectedCount}
            onClose={exitSelection}
            onDelete={confirmBulkDelete}
            onSelectAll={() => selectAll(displayConversations)}
          />
        </View>
      ) : null}

      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={chat.accent} />
          <Text style={styles.loadingText}>{t('messagesLoading')}</Text>
        </View>
      ) : showEmpty ? (
        <View style={styles.emptyWrap}>
          {listHeader}
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={48} color={chat.textMuted} />
            <Text style={styles.emptyTitle}>
              {activeFilter === 'unread'
                ? t('staffMessagesEmptyUnread')
                : activeFilter === 'groups'
                  ? t('staffMessagesEmptyGroups')
                  : t('messagesEmptyTitle')}
            </Text>
            <Text style={styles.emptyText}>
              {activeFilter === 'all' ? t('messagesEmptyBody') : t('staffMessagesEmptyFilterHint')}
            </Text>
          </View>
        </View>
      ) : (
        <FlashList
          style={styles.list}
          data={displayConversations}
          estimatedItemSize={chatLayout.listRowHeight}
          drawDistance={280}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          ListHeaderComponent={listHeader}
          extraData={`${selectionMode}:${selectedCount}:${activeFilter}`}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ showRefreshing: true, force: true })}
              colors={[chat.accent]}
              tintColor={chat.accent}
            />
          }
          contentContainerStyle={{ paddingBottom: listBottomPad }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!selectionMode ? (
        <Pressable
          style={({ pressed }) => [styles.fab, { bottom: listBottomPad }, pressed && styles.fabPressed]}
          onPress={() => router.push('/staff/new-chat')}
        >
          <Ionicons name="create" size={26} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStaffMessagesStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: chat.background,
    },
    list: {
      flex: 1,
    },
    selectionBar: {
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
      zIndex: 20,
      elevation: 8,
    },
    headerIconBtn: {
      padding: 8,
      marginRight: 8,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
    },
    loadingText: {
      fontSize: 15,
      color: chat.textMuted,
    },
    listContent: {
      paddingBottom: 88,
    },
    emptyWrap: {
      flex: 1,
    },
    empty: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: chat.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: chat.textSecondary,
      textAlign: 'center',
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: chatLayout.composeFabSize,
      height: chatLayout.composeFabSize,
      borderRadius: chatLayout.composeFabSize / 2,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
    },
    fabPressed: {
      opacity: 0.9,
      transform: [{ scale: 0.96 }],
    },
  });
}
