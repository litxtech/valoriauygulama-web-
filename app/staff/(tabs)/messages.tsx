import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
  Modal,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { staffDeleteConversation, staffListConversations, subscribeToConversationList, staffSetConversationMuted } from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';

/** Veritabanındaki sabit grup adı (karşılaştırma için) */
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
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  if (d.getTime() > now.getTime() - 86400000 * 2) return i18n.t('staffMessagesYesterday');
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short' });
}

function ConversationRow({
  item,
  onPress,
  onMutePress,
  onDelete,
  staffId,
}: {
  item: ConversationWithMeta;
  onPress: () => void;
  onMutePress?: () => void;
  onDelete?: () => void;
  staffId?: string;
}) {
  const { t, i18n } = useTranslation();
  const unread = item.unread_count ?? 0;
  const isGroup = item.type === 'group';
  const isAllStaff = item.type === 'group' && item.name === ALL_STAFF_GROUP_NAME_DB;
  const displayName = isAllStaff ? t('staffAllStaffGroupName') : item.name || t('messages');
  const isMuted = item.is_muted ?? false;

  return (
    <SwipeToDelete onSwipeDelete={() => onDelete?.()}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        android_ripple={{ color: theme.colors.borderLight }}
      >
        <View style={[styles.avatarWrap, isAllStaff && styles.avatarWrapGroup]}>
          {isAllStaff ? (
            <View style={styles.avatarGroup}>
              <Ionicons name="people" size={24} color={theme.colors.white} />
            </View>
          ) : (item.type === 'direct' ? item.other_avatar : item.avatar) ? (
            <CachedImage
              uri={(item.type === 'direct' ? item.other_avatar : item.avatar) as string}
              style={styles.avatarImg}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.avatarText} numberOfLines={1}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <View style={styles.rowTitleLeft}>
              {isGroup ? (
                <View style={styles.groupChip}>
                  <Ionicons name="people" size={11} color={theme.colors.primary} />
                  <Text style={styles.groupChipText}>Grup</Text>
                </View>
              ) : null}
              <Text style={styles.rowTitle} numberOfLines={1}>
                {displayName}
              </Text>
            </View>
            <Text style={styles.rowTime}>{formatTime(item.last_message_at ?? null, i18n.language)}</Text>
          </View>
          <Text
            style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]}
            numberOfLines={1}
          >
            {item.last_message_preview || t('messagesNoMessagesYet')}
          </Text>
        </View>
        {isAllStaff && staffId && onMutePress ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMutePress(); }}
            style={styles.muteBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isMuted ? 'notifications-off' : 'notifications'}
              size={22}
              color={isMuted ? theme.colors.textMuted : theme.colors.primary}
            />
          </Pressable>
        ) : null}
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>
    </SwipeToDelete>
  );
}

export default function StaffMessagesTabScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { staff } = useAuthStore();
  const { setUnreadCount } = useStaffUnreadMessagesStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>(() => conversationListCache);
  const [loading, setLoading] = useState(() => conversationListCache.length === 0);
  const [refreshing, setRefreshing] = useState(false);
  const [adminMenuVisible, setAdminMenuVisible] = useState(false);
  const loadingRef = useRef(false);
  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadAtRef = useRef(0);

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
        // Sessiz: bozuk cache açılışı engellemesin.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async (opts?: { showRefreshing?: boolean; force?: boolean }) => {
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
  }, [staff, setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      const hasCache = conversationListCache.length > 0;
      const isCacheFresh = Date.now() - conversationListCacheUpdatedAt < LIST_CACHE_TTL_MS;
      if (!hasCache || conversationListDirty || !isCacheFresh) {
        load();
      }
      if (!staff?.id) {
        return () => {};
      }
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
    }, [setUnreadCount, load, staff?.id])
  );

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!staff?.id) return;
    const name = item.name || t('messages');
    Alert.alert(t('messagesDeleteTitle'), t('messagesDeleteBody', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
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

  if (!staff) return null;

  const allStaffConv = conversations.find((c) => c.type === 'group' && c.name === ALL_STAFF_GROUP_NAME_DB);
  const editableGroupConv = allStaffConv ?? conversations.find((c) => c.type === 'group') ?? null;
  const otherConvs = conversations.filter((c) => !(allStaffConv && c.id === allStaffConv.id));
  const sections: { title: string; data: ConversationWithMeta[] }[] = [];
  if (allStaffConv) sections.push({ title: t('group'), data: [allStaffConv] });
  if (otherConvs.length) sections.push({ title: t('messages'), data: otherConvs });

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Ionicons
        name={section.title === t('group') ? 'people' : 'chatbubbles-outline'}
        size={18}
        color={theme.colors.primary}
      />
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

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
    router.push({ pathname: '/staff/chat/[id]', params: { id: editableGroupConv.id, openGroupSettings: '1' } });
  };

  const isAdmin = staff?.role === 'admin';

  const renderHeaderActions = () => (
    <>
      <View style={styles.headerActionRow}>
        <Pressable
          onPress={() => router.push('/staff/new-chat')}
          style={({ pressed }) => [styles.newMessageBtn, pressed && styles.headerBtnPressed]}
        >
          <Ionicons name="create-outline" size={18} color={theme.colors.white} />
          <Text style={styles.newMessageBtnText}>{t('screenNewChat')}</Text>
        </Pressable>
        {isAdmin ? (
          <Pressable
            onPress={() => setAdminMenuVisible(true)}
            style={({ pressed }) => [styles.moreBtn, pressed && styles.moreBtnPressed]}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('messagesLoading')}</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>{t('messagesEmptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('messagesEmptyBody')}</Text>
          {renderHeaderActions()}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeaderActions()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load({ showRefreshing: true })}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={renderSectionHeader}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              staffId={staff?.id}
              onPress={() => router.push({ pathname: '/staff/chat/[id]', params: { id: item.id } })}
              onDelete={() => handleDeleteConversation(item)}
              onMutePress={
                item.type === 'group' && item.name === ALL_STAFF_GROUP_NAME_DB && staff
                  ? async () => {
                      const next = !(item.is_muted ?? false);
                      await staffSetConversationMuted(item.id, staff.id, next);
                      setConversations((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_muted: next } : c)));
                      conversationListCache = conversationListCache.map((c) => (c.id === item.id ? { ...c, is_muted: next } : c));
                      conversationListCacheUpdatedAt = Date.now();
                    }
                  : undefined
              }
            />
          )}
        />
      )}
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
              <Ionicons name="people-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.menuItemText}>{t('teamChat')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAdminMenuVisible(false);
                router.push('/staff/new-group');
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.menuItemText}>{t('screenNewGroup')}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setAdminMenuVisible(false);
                openGroupEdit();
              }}
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
            >
              <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.menuItemText}>{t('messagesGroupEdit')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingText: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  listContent: {
    paddingVertical: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: 10,
  },
  newMessageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flex: 1,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...theme.shadows.sm,
  },
  newMessageBtnText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  moreBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  moreBtnPressed: { transform: [{ scale: 0.96 }] },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  menuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  menuTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.text,
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
  menuItemPressed: { backgroundColor: theme.colors.backgroundSecondary },
  menuItemText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    marginVertical: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  rowPressed: {
    opacity: 0.9,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 52,
    height: 52,
  },
  avatarWrapGroup: {
    backgroundColor: theme.colors.primaryDark,
  },
  avatarGroup: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 20,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitleLeft: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  groupChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  groupChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  rowTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  rowPreview: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowPreviewUnread: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  muteBtn: {
    padding: 8,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
