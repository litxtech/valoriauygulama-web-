import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import {
  staffListGroupMembers,
  staffAddGroupMembers,
  staffRemoveGroupMember,
  staffCloseGroup,
  type GroupMemberRow,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { sendNotification } from '@/lib/notificationService';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ALL_STAFF_GROUP_NAME = 'Tüm Çalışanlar';

type StaffPickerRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image?: string | null;
};

type Props = {
  chatReturnPath: string;
};

export function GroupMembersScreen({ chatReturnPath }: Props) {
  const { conversationId, groupName, groupAvatar, isAllStaff } = useLocalSearchParams<{
    conversationId: string;
    groupName?: string;
    groupAvatar?: string;
    isAllStaff?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);
  const { staff } = useAuthStore();
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [staffList, setStaffList] = useState<StaffPickerRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [closing, setClosing] = useState(false);

  const isAdmin = staff?.role === 'admin';
  const isAllStaffGroup = isAllStaff === '1' || (groupName || '').trim() === ALL_STAFF_GROUP_NAME;
  const canManage = isAdmin && !isAllStaffGroup && !isClosed;
  const displayGroupName = (groupName || '').trim() || t('messages');
  const avatarUri = (groupAvatar || '').trim() || null;

  const loadMembers = useCallback(async () => {
    if (!staff?.id || !conversationId) return;
    setLoading(true);
    const [{ members: list, error }, convRes] = await Promise.all([
      staffListGroupMembers(conversationId, staff.id),
      supabase.from('conversations').select('closed_at').eq('id', conversationId).maybeSingle(),
    ]);
    if (error) {
      Alert.alert(t('error'), t(error, { defaultValue: error }));
      router.back();
      return;
    }
    setMembers(list);
    setIsClosed(Boolean((convRes.data as { closed_at?: string | null } | null)?.closed_at));
    setLoading(false);
  }, [staff?.id, conversationId, t, router]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const loadPickerStaff = useCallback(async () => {
    if (!staff?.id) return;
    setPickerLoading(true);
    const memberIds = new Set(members.map((m) => m.participant_id));
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, department, profile_image')
      .eq('is_active', true)
      .is('deleted_at', null)
      .neq('id', staff.id)
      .order('full_name');
    const rows = sortStaffAdminFirst((data ?? []) as StaffPickerRow[], (a, b) =>
      (a.full_name || '').localeCompare(b.full_name || '', 'tr')
    ).filter((s) => !memberIds.has(s.id));
    setStaffList(rows);
    setPickerLoading(false);
  }, [staff?.id, members]);

  useEffect(() => {
    if (addModalVisible) void loadPickerStaff();
  }, [addModalVisible, loadPickerStaff]);

  const visibleMembers = useMemo(() => {
    const q = memberQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return members;
    return members.filter((m) =>
      `${m.display_name} ${m.department ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [members, memberQuery]);

  const visiblePicker = useMemo(() => {
    const q = pickerQuery.trim().toLocaleLowerCase('tr-TR');
    if (!q) return staffList;
    return staffList.filter((s) =>
      `${s.full_name ?? ''} ${s.department ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [staffList, pickerQuery]);

  const togglePick = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const confirmRemove = (member: GroupMemberRow) => {
    if (!staff?.id || !conversationId || !canManage) return;
    Alert.alert(
      t('groupMembersRemoveTitle'),
      t('groupMembersRemoveMessage', { name: member.display_name }),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('groupMembersRemoveConfirm'),
          style: 'destructive',
          onPress: async () => {
            setRemovingId(member.participant_id);
            const { ok, error } = await staffRemoveGroupMember(
              conversationId,
              staff.id,
              member.participant_id
            );
            setRemovingId(null);
            if (error || !ok) {
              Alert.alert(t('error'), t(error ?? 'group_members_remove_failed', { defaultValue: error ?? '' }));
              return;
            }
            setMembers((prev) => prev.filter((m) => m.participant_id !== member.participant_id));
          },
        },
      ]
    );
  };

  const addSelected = async () => {
    if (!staff?.id || !conversationId || selectedIds.length === 0) return;
    setAdding(true);
    const { addedIds, error } = await staffAddGroupMembers(conversationId, staff.id, selectedIds);
    setAdding(false);
    if (error) {
      Alert.alert(t('error'), t(error, { defaultValue: error }));
      return;
    }
    if (addedIds.length > 0) {
      await Promise.all(
        addedIds.map((staffId) =>
          sendNotification({
            staffId,
            title: t('notifAddedToGroupTitle'),
            body: t('notifAddedToGroupBody', { groupName: displayGroupName }),
            notificationType: 'group_added',
            category: 'staff',
            data: { screen: 'notifications', conversationId, url: chatReturnPath },
            createdByStaffId: staff.id,
          })
        )
      );
    }
    setSelectedIds([]);
    setPickerQuery('');
    setAddModalVisible(false);
    await loadMembers();
  };

  const confirmCloseGroup = () => {
    if (!staff?.id || !conversationId || !canManage) return;
    Alert.alert(t('groupMembersCloseTitle'), t('groupMembersCloseMessage', { name: displayGroupName }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('groupMembersCloseConfirm'),
        style: 'destructive',
        onPress: async () => {
          setClosing(true);
          const { ok, error } = await staffCloseGroup(conversationId, staff.id);
          setClosing(false);
          if (error || !ok) {
            Alert.alert(t('error'), t(error ?? 'group_members_close_failed', { defaultValue: error ?? '' }));
            return;
          }
          setIsClosed(true);
          await loadMembers();
          Alert.alert(t('groupMembersCloseDoneTitle'), t('groupMembersCloseDoneMessage'), [
            { text: t('ok'), onPress: () => router.back() },
          ]);
        },
      },
    ]);
  };

  const openMemberProfile = (member: GroupMemberRow) => {
    if (member.participant_id === staff?.id) {
      router.push('/staff/profile/edit');
      return;
    }
    router.push({ pathname: '/staff/profile/[id]', params: { id: member.participant_id } });
  };

  const renderMember = ({ item }: { item: GroupMemberRow }) => {
    const isSelf = item.participant_id === staff?.id;
    const isRemoving = removingId === item.participant_id;
    return (
      <Pressable
        onPress={() => openMemberProfile(item)}
        onLongPress={canManage && !isSelf ? () => confirmRemove(item) : undefined}
        style={({ pressed }) => [styles.memberRow, pressed && styles.memberRowPressed]}
      >
        <View style={styles.memberAvatar}>
          {item.avatar ? (
            <CachedImage uri={item.avatar} style={styles.memberAvatarImg} contentFit="cover" />
          ) : (
            <Text style={styles.memberAvatarLetter}>{item.display_name.charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.memberBody}>
          <Text style={styles.memberName} numberOfLines={1}>
            {item.display_name}
            {isSelf ? ` (${t('groupMembersYou')})` : ''}
          </Text>
          <Text style={styles.memberSub} numberOfLines={1}>
            {item.department || t('staffTab')}
            {item.role === 'admin' ? ` · ${t('groupMembersAdmin')}` : ''}
          </Text>
        </View>
        {canManage && !isSelf ? (
          <Pressable
            onPress={() => confirmRemove(item)}
            disabled={isRemoving}
            hitSlop={8}
            style={styles.removeBtn}
          >
            {isRemoving ? (
              <ActivityIndicator size="small" color={chat.danger} />
            ) : (
              <Ionicons name="close-circle" size={22} color={chat.textMuted} />
            )}
          </Pressable>
        ) : (
          <Ionicons name="chevron-forward" size={18} color={chat.textMuted} />
        )}
      </Pressable>
    );
  };

  if (!staff || !conversationId) return null;

  const listHeader = (
    <>
      <View style={styles.hero}>
        <View style={styles.heroAvatarWrap}>
          {avatarUri ? (
            <CachedImage uri={avatarUri} style={styles.heroAvatarImg} contentFit="cover" />
          ) : (
            <View style={styles.heroAvatarPlaceholder}>
              <Ionicons name="people" size={44} color="#fff" />
            </View>
          )}
        </View>
        <Text style={styles.heroTitle}>{displayGroupName}</Text>
        <Text style={styles.heroSub}>
          {t('groupMembersCount', { count: members.length })}
          {isAllStaffGroup ? ` · ${t('groupMembersAllStaffHint')}` : ''}
          {isClosed ? ` · ${t('groupMembersClosedHint')}` : ''}
        </Text>
      </View>

      {isClosed ? (
        <View style={styles.closedBanner}>
          <Ionicons name="lock-closed" size={18} color={chat.danger} />
          <Text style={styles.closedBannerText}>{t('groupMembersClosedBanner')}</Text>
        </View>
      ) : null}

      {canManage ? (
        <Pressable
          onPress={() => setAddModalVisible(true)}
          style={({ pressed }) => [styles.actionRow, pressed && styles.actionRowPressed]}
        >
          <View style={[styles.actionIcon, { backgroundColor: chat.accent }]}>
            <Ionicons name="person-add" size={20} color="#fff" />
          </View>
          <Text style={styles.actionLabel}>{t('groupMembersAdd')}</Text>
        </Pressable>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={chat.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={memberQuery}
          onChangeText={setMemberQuery}
          placeholder={t('groupMembersSearch')}
          placeholderTextColor={chat.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {memberQuery.length > 0 ? (
          <Pressable onPress={() => setMemberQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={chat.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>{t('groupMembersSectionTitle')}</Text>
    </>
  );

  const listFooter =
    canManage && !loading ? (
      <Pressable
        onPress={confirmCloseGroup}
        disabled={closing}
        style={({ pressed }) => [styles.closeGroupBtn, pressed && styles.closeGroupBtnPressed]}
      >
        {closing ? (
          <ActivityIndicator size="small" color={chat.danger} />
        ) : (
          <>
            <Ionicons name="lock-closed-outline" size={20} color={chat.danger} />
            <Text style={styles.closeGroupText}>{t('groupMembersClose')}</Text>
          </>
        )}
      </Pressable>
    ) : null;

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={chat.accent} />
        </View>
      ) : (
        <FlatList
          data={visibleMembers}
          keyExtractor={(item) => item.participant_id}
          renderItem={renderMember}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.emptyText}>{t('staffGroupNoMembersFound')}</Text>
          }
        />
      )}

      <Modal visible={addModalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContainer, { paddingTop: Platform.OS === 'ios' ? 12 : insets.top }]}>
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => {
                setAddModalVisible(false);
                setSelectedIds([]);
                setPickerQuery('');
              }}
              hitSlop={10}
            >
              <Text style={styles.modalCancel}>{t('cancel')}</Text>
            </Pressable>
            <Text style={styles.modalTitle}>{t('groupMembersAdd')}</Text>
            <Pressable
              onPress={() => void addSelected()}
              disabled={selectedIds.length === 0 || adding}
              hitSlop={10}
            >
              {adding ? (
                <ActivityIndicator size="small" color={chat.accent} />
              ) : (
                <Text
                  style={[
                    styles.modalDone,
                    selectedIds.length === 0 && styles.modalDoneDisabled,
                  ]}
                >
                  {t('groupMembersDone')}
                </Text>
              )}
            </Pressable>
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={chat.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={pickerQuery}
              onChangeText={setPickerQuery}
              placeholder={t('staffGroupSearchPlaceholder')}
              placeholderTextColor={chat.textMuted}
            />
          </View>
          {pickerLoading ? (
            <ActivityIndicator color={chat.accent} style={{ marginTop: 24 }} />
          ) : (
            <FlatList
              data={visiblePicker}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = selectedIds.includes(item.id);
                return (
                  <Pressable
                    onPress={() => togglePick(item.id)}
                    style={[styles.pickerRow, selected && styles.pickerRowSelected]}
                  >
                    <View style={styles.pickerAvatar}>
                      {item.profile_image ? (
                        <CachedImage uri={item.profile_image} style={styles.pickerAvatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.pickerAvatarLetter}>
                          {(item.full_name || '?').charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.pickerBody}>
                      <Text style={styles.pickerName}>{item.full_name || t('staffTab')}</Text>
                      <Text style={styles.pickerSub}>{item.department || '—'}</Text>
                    </View>
                    <Ionicons
                      name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={24}
                      color={selected ? chat.accent : chat.textMuted}
                    />
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>{t('staffGroupNoMembersFound')}</Text>
              }
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(chat: ReturnType<typeof useChatTheme>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: chat.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    listContent: { flexGrow: 1 },
    hero: {
      alignItems: 'center',
      paddingTop: 28,
      paddingBottom: 20,
      paddingHorizontal: 24,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    heroAvatarWrap: {
      width: 108,
      height: 108,
      borderRadius: 54,
      overflow: 'hidden',
      marginBottom: 14,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 8,
        },
        android: { elevation: 4 },
        default: {},
      }),
    },
    heroAvatarImg: { width: 108, height: 108 },
    heroAvatarPlaceholder: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: chat.text,
      textAlign: 'center',
    },
    heroSub: {
      fontSize: 14,
      color: chat.textSecondary,
      marginTop: 6,
      textAlign: 'center',
    },
    closedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginHorizontal: 12,
      marginTop: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: chat.selected,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
    },
    closedBannerText: {
      flex: 1,
      fontSize: 14,
      color: chat.textSecondary,
      lineHeight: 20,
    },
    closeGroupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 24,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: chat.danger,
      backgroundColor: chat.surface,
    },
    closeGroupBtnPressed: { opacity: 0.85 },
    closeGroupText: {
      fontSize: 16,
      fontWeight: '600',
      color: chat.danger,
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    actionRowPressed: { backgroundColor: chat.rowPressed },
    actionIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: chat.accent,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 12,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: chat.searchBg,
    },
    searchInput: { flex: 1, fontSize: 16, color: chat.text, padding: 0 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: chat.accent,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 8,
      letterSpacing: 0.3,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    memberRowPressed: { backgroundColor: chat.rowPressed },
    memberAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
      marginRight: 14,
    },
    memberAvatarImg: { width: 48, height: 48 },
    memberAvatarLetter: { color: '#fff', fontWeight: '700', fontSize: 18 },
    memberBody: { flex: 1, minWidth: 0 },
    memberName: { fontSize: 16, fontWeight: '500', color: chat.text },
    memberSub: { fontSize: 14, color: chat.textSecondary, marginTop: 2 },
    removeBtn: { padding: 4 },
    emptyText: {
      textAlign: 'center',
      color: chat.textMuted,
      fontSize: 15,
      padding: 24,
    },
    modalContainer: { flex: 1, backgroundColor: chat.background },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
      backgroundColor: chat.surface,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: chat.text },
    modalCancel: { fontSize: 16, color: chat.textSecondary },
    modalDone: { fontSize: 16, fontWeight: '700', color: chat.accent },
    modalDoneDisabled: { opacity: 0.4 },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 12,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    pickerRowSelected: { backgroundColor: chat.selected },
    pickerAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    pickerAvatarImg: { width: 44, height: 44 },
    pickerAvatarLetter: { color: '#fff', fontWeight: '700', fontSize: 16 },
    pickerBody: { flex: 1, minWidth: 0 },
    pickerName: { fontSize: 16, fontWeight: '500', color: chat.text },
    pickerSub: { fontSize: 13, color: chat.textSecondary, marginTop: 2 },
  });
}
