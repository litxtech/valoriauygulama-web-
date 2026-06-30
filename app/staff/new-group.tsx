import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
  TextInput,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { staffCreateGroupConversation } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';
import { useTranslation } from 'react-i18next';
import { useChatTheme } from '@/hooks/useScreenTheme';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { chatLayout } from '@/constants/chatTheme';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  role?: string | null;
};

export default function StaffNewGroupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);
  const { staff } = useAuthStore();
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!staff) return;
      if (staff.role !== 'admin') {
        router.replace('/staff/(tabs)/messages');
        return;
      }
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, department, role')
        .eq('is_active', true)
        .neq('id', staff.id)
        .order('full_name');
      if (cancelled) return;
      setStaffList(
        sortStaffAdminFirst((data ?? []) as StaffRow[], (a, b) =>
          (a.full_name || '').localeCompare(b.full_name || '', 'tr')
        )
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staff?.id, staff?.role, router]);

  const visibleStaff = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return staffList;
    return staffList.filter((s) =>
      `${s.full_name ?? ''} ${s.department ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [staffList, query]);

  const selectedStaff = useMemo(
    () => staffList.filter((s) => selectedStaffIds.includes(s.id)),
    [staffList, selectedStaffIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createGroup = async () => {
    if (!staff) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert(t('staffGroupNameRequiredTitle'), t('staffGroupNameRequiredMessage'));
      return;
    }
    if (selectedStaffIds.length === 0) {
      Alert.alert(t('staffGroupPickMembersTitle'), t('staffGroupPickMembersMessage'));
      return;
    }
    setCreating(true);
    const { conversationId, error } = await staffCreateGroupConversation({
      creatorStaffId: staff.id,
      creatorType: 'admin',
      groupName: name,
      memberStaffIds: selectedStaffIds,
    });
    setCreating(false);
    if (error || !conversationId) {
      Alert.alert(t('error'), error ?? t('staffGroupCreateFailed'));
      return;
    }

    await Promise.all(
      selectedStaffIds.map((staffId) =>
        sendNotification({
          staffId,
          title: t('notifAddedToGroupTitle'),
          body: t('notifAddedToGroupBody', { groupName: name }),
          notificationType: 'group_added',
          category: 'staff',
          data: { screen: 'notifications', conversationId, url: '/staff/(tabs)/messages' },
          createdByStaffId: staff.id,
        })
      )
    );

    setGroupName('');
    setSelectedStaffIds([]);
    router.replace({ pathname: '/staff/chat/[id]', params: { id: conversationId } });
  };

  const canCreate = Boolean(groupName.trim()) && selectedStaffIds.length > 0 && !creating;

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={chat.accent} />
        <Text style={styles.loadingText}>{t('staffGroupLoadingMembers')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.formCard}>
        <View style={styles.formHeader}>
          <View style={styles.formIconWrap}>
            <Ionicons name="people" size={22} color="#fff" />
          </View>
          <View style={styles.formHeaderBody}>
            <Text style={styles.formTitle}>{t('staffGroupCreateTitle')}</Text>
            <Text style={styles.formSub}>{t('staffGroupCreateSub')}</Text>
          </View>
        </View>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder={t('staffGroupNamePlaceholder')}
          placeholderTextColor={chat.textMuted}
          style={styles.nameInput}
          maxLength={64}
        />
      </View>

      {selectedStaff.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectedRow}
        >
          {selectedStaff.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => toggleSelect(s.id)}
              style={styles.selectedChip}
            >
              <Text style={styles.selectedChipText} numberOfLines={1}>
                {s.full_name || t('staffTab')}
              </Text>
              <Ionicons name="close-circle" size={16} color={chat.textMuted} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={chat.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('staffGroupSearchPlaceholder')}
          placeholderTextColor={chat.textMuted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={chat.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={visibleStaff}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="person-outline" size={40} color={chat.textMuted} />
            <Text style={styles.emptyText}>{t('staffGroupNoMembersFound')}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedStaffIds.includes(item.id);
          return (
            <Pressable
              onPress={() => toggleSelect(item.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={[styles.avatar, selected && styles.avatarSelected]}>
                <Text style={styles.avatarText}>
                  {(item.full_name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.full_name || t('staffTab')}</Text>
                <Text style={styles.sub}>{item.department || '—'}</Text>
              </View>
              <View style={[styles.check, selected && styles.checkActive]}>
                {selected ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
              </View>
            </Pressable>
          );
        }}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={createGroup}
          disabled={!canCreate}
          style={({ pressed }) => [
            styles.createBtn,
            !canCreate && styles.createBtnDisabled,
            pressed && canCreate && styles.createBtnPressed,
          ]}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="people-outline" size={20} color="#fff" />
              <Text style={styles.createBtnText}>
                {t('staffGroupCreateButton', { count: selectedStaffIds.length })}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: chat.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      backgroundColor: chat.background,
    },
    loadingText: {
      fontSize: 15,
      color: chat.textMuted,
    },
    formCard: {
      margin: 12,
      padding: 14,
      borderRadius: chatLayout.listCardRadius,
      backgroundColor: chat.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
      gap: 12,
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
        },
        android: { elevation: 1 },
        default: {},
      }),
    },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    formIconWrap: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: chat.accentPurple,
      justifyContent: 'center',
      alignItems: 'center',
    },
    formHeaderBody: {
      flex: 1,
      gap: 2,
    },
    formTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: chat.text,
    },
    formSub: {
      fontSize: 13,
      color: chat.textSecondary,
    },
    nameInput: {
      backgroundColor: chat.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: chat.text,
    },
    selectedRow: {
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 8,
    },
    selectedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: 140,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: chat.selected,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.accentPurple,
    },
    selectedChipText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: chat.text,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginBottom: 8,
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
    listContent: {
      paddingBottom: 100,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      marginVertical: 3,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: chatLayout.listCardRadius,
      backgroundColor: chat.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
    },
    rowPressed: {
      backgroundColor: chat.selected,
    },
    avatar: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    avatarSelected: {
      backgroundColor: chat.accentPurple,
    },
    avatarText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
    rowBody: {
      flex: 1,
      minWidth: 0,
    },
    name: {
      fontWeight: '600',
      fontSize: 16,
      color: chat.text,
    },
    sub: {
      fontSize: 13,
      color: chat.textSecondary,
      marginTop: 2,
    },
    check: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: chat.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: chat.background,
    },
    checkActive: {
      backgroundColor: chat.accentPurple,
      borderColor: chat.accentPurple,
    },
    empty: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    emptyText: {
      fontSize: 15,
      color: chat.textMuted,
    },
    footer: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 24,
      backgroundColor: chat.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: chat.border,
    },
    createBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: chat.accentPurple,
      borderRadius: 14,
      paddingVertical: 14,
    },
    createBtnDisabled: {
      opacity: 0.45,
    },
    createBtnPressed: {
      opacity: 0.9,
    },
    createBtnText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 16,
    },
  });
}
