import { useEffect, useState, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
  TextInput,
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
  subscribeToConversationList,
  staffSetConversationMuted,
  staffSetConversationArchived,
} from '@/lib/messagingApi';
import { ChatListSwipeRow, type ChatListSwipeAction } from '@/components/chat/ChatListSwipeRow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationWithMeta } from '@/lib/messaging';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { FlashList } from '@shopify/flash-list';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { BulkSelectionHeader } from '@/components/chat/BulkSelectionHeader';
import { useMessageSelection } from '@/hooks/chat/useMessageSelection';

const ALL_STAFF_GROUP_NAME_DB = 'Tüm Çalışanlar';
let conversationListCache: ConversationWithMeta[] = [];
let conversationListCacheUpdatedAt = 0;
let conversationListDirty = false;
const LIST_CACHE_TTL_MS = 45_000;
const MIN_LOAD_INTERVAL_MS = 2_500;
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

export default function StaffMessagesTabScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const chat = useChatTheme();
  const styles = useMemo(() => createStaffMessagesStyles(chat), [chat]);
  const { t, i18n } = useTranslation();
  const { staff } = useAuthStore();
  const { setUnreadCount } = useStaffUnreadMessagesStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>(() => conversationListCache);
  const [loading, setLoading] = useState(() => conversationListCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [adminMenuVisible, setAdminMenuVisible] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  useFocusEffect(
    useCallback(() => {
      const hasCache = conversationListCache.length > 0;
      const isCacheFresh = Date.now() - conversationListCacheUpdatedAt < LIST_CACHE_TTL_MS;
      if (!hasCache || conversationListDirty || !isCacheFresh) {
        load();
      }
      if (!staff?.id) return () => {};
      const sub = subscribeToConversationList(staff.id, () => {
        conversationListDirty = true;
        if (reloadDebounceRef.current) return;
        reloadDebounceRef.current = setTimeout(() => {
          reloadDebounceRef.current = null;
          load();
        }, 350);
      });
      return () => {
        sub.unsubscribe?.();
        if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
        reloadDebounceRef.current = null;
      };
    }, [load, staff?.id])
  );

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const name = (c.name ?? '').toLowerCase();
      const preview = (c.last_message_preview ?? '').toLowerCase();
      return name.includes(q) || preview.includes(q);
    });
  }, [conversations, searchQuery]);

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
    Alert.alert('Bu sohbet silinsin mi?', name, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Benden sil',
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
      `Seçili ${selectedIds.length} sohbet silinsin mi?`,
      undefined,
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Benden sil',
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
            if (failed > 0) Alert.alert(t('error'), `${failed} sohbet silinemedi.`);
          },
        },
        ...(isAdmin
          ? [
              {
                text: 'Herkesten sil',
                style: 'destructive' as const,
                onPress: () => {
                  Alert.alert(
                    t('info'),
                    t('staffChatDeleteGroupAdminHint')
                  );
                },
              },
            ]
          : []),
      ]
    );
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
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable onPress={() => setSearchVisible((v) => !v)} hitSlop={10} style={styles.headerIconBtn}>
            <Ionicons name="search" size={22} color={chat.text} />
          </Pressable>
          {staff?.role === 'admin' ? (
            <Pressable onPress={() => setAdminMenuVisible(true)} hitSlop={10} style={styles.headerIconBtn}>
              <Ionicons name="ellipsis-horizontal" size={22} color={chat.text} />
            </Pressable>
          ) : null}
        </View>
      ),
    });
  }, [navigation, selectionMode, staff?.role]);

  if (!staff) return null;

  const allStaffConv = conversations.find((c) => c.type === 'group' && c.name === ALL_STAFF_GROUP_NAME_DB);
  const editableGroupConv = allStaffConv ?? conversations.find((c) => c.type === 'group') ?? null;

  const openAllStaffChat = () => {
    if (!allStaffConv) {
      Alert.alert(t('info'), t('messagesTeamChatNotCreated'));
      return;
    }
    router.push({ pathname: '/staff/chat/[id]', params: { id: allStaffConv.id } });
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

  const handleSwipeAction = (item: ConversationWithMeta, action: ChatListSwipeAction) => {
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
  };

  const renderRow = ({ item }: { item: ConversationWithMeta }) => (
    <ChatListSwipeRow
      enabled={!selectionMode}
      isMuted={item.is_muted}
      onAction={(action) => handleSwipeAction(item, action)}
    >
      <ChatListItem
        item={item}
        displayName={getDisplayName(item)}
        timeLabel={formatTime(item.last_message_at ?? null, i18n.language)}
        selected={isSelected(item.id)}
        selectionMode={selectionMode}
        onPress={() => {
          if (selectionMode) {
            toggle(item.id);
            return;
          }
          router.push({ pathname: '/staff/chat/[id]', params: { id: item.id } });
        }}
        onLongPress={() => {
          if (!selectionMode) enterSelection(item.id);
          else toggle(item.id);
        }}
      />
    </ChatListSwipeRow>
  );

  return (
    <View style={[styles.container, { backgroundColor: chat.background }]}>
      {selectionMode ? (
        <View style={[styles.selectionBar, { paddingTop: insets.top + 4 }]}>
          <BulkSelectionHeader
            count={selectedCount}
            onClose={exitSelection}
            onDelete={confirmBulkDelete}
            onSelectAll={() => selectAll(filteredConversations)}
          />
        </View>
      ) : null}

      {searchVisible && !selectionMode ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={chat.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Personel veya mesaj ara"
            placeholderTextColor={chat.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>
      ) : null}

      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={chat.accent} />
          <Text style={styles.loadingText}>{t('messagesLoading')}</Text>
        </View>
      ) : filteredConversations.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={48} color={chat.textMuted} />
          <Text style={styles.emptyTitle}>{t('messagesEmptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('messagesEmptyBody')}</Text>
        </View>
      ) : (
        <FlashList
          style={styles.list}
          data={filteredConversations}
          estimatedItemSize={76}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ showRefreshing: true })}
              colors={[chat.accent]}
              tintColor={chat.accent}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {!selectionMode ? (
        <Pressable
          style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
          onPress={() => router.push('/staff/new-chat')}
        >
          <Ionicons name="create" size={26} color="#fff" />
        </Pressable>
      ) : null}

      <Modal visible={adminMenuVisible} transparent animationType="fade" onRequestClose={() => setAdminMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setAdminMenuVisible(false)}>
          <Pressable style={styles.menuCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.menuTitle}>{t('messagesGroupActionsTitle')}</Text>
            <Pressable
              onPress={() => {
                setAdminMenuVisible(false);
                openAllStaffChat();
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="people-outline" size={18} color={chat.accent} />
              <Text style={styles.menuItemText}>{t('teamChat')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAdminMenuVisible(false);
                router.push('/staff/new-group');
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="add-circle-outline" size={18} color={chat.accent} />
              <Text style={styles.menuItemText}>{t('screenNewGroup')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAdminMenuVisible(false);
                openGroupEdit();
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="create-outline" size={18} color={chat.accent} />
              <Text style={styles.menuItemText}>{t('messagesGroupEdit')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    gap: 4,
  },
  headerIconBtn: {
    padding: 8,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: chat.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chat.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: chat.text,
    padding: 0,
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
    width: 56,
    height: 56,
    borderRadius: 28,
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
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuCard: {
    backgroundColor: chat.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chat.border,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: chat.text,
    marginBottom: 6,
    paddingHorizontal: 6,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  menuItemPressed: { backgroundColor: chat.background },
  menuItemText: { fontSize: 14, fontWeight: '600', color: chat.text },
  });
}
