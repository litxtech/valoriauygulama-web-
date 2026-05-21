import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { listBlockedUsersForGuest, unblockUserForGuest, type BlockedUserItem } from '@/lib/userBlocks';
import { useTranslation } from 'react-i18next';

export default function CustomerBlockedUsersScreen() {
  const { t } = useTranslation();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserItem[]>([]);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const loadBlockedUsers = useCallback(async () => {
    const guest = await getOrCreateGuestForCurrentSession();
    if (!guest?.guest_id) {
      setBlockedUsers([]);
      return;
    }
    const list = await listBlockedUsersForGuest(guest.guest_id);
    setBlockedUsers(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadBlockedUsers();
      return () => {};
    }, [loadBlockedUsers])
  );

  const handleUnblock = (item: BlockedUserItem) => {
    Alert.alert(t('unblockTitle'), t('unblockConfirm', { name: item.name }), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('removeBlock'),
        style: 'destructive',
        onPress: async () => {
          const guest = await getOrCreateGuestForCurrentSession();
          if (!guest?.guest_id) return;
          setUnblockingId(item.blockId);
          const { error } = await unblockUserForGuest({
            blockerGuestId: guest.guest_id,
            blockedType: item.blockedType,
            blockedId: item.blockedId,
          });
          setUnblockingId(null);
          if (error) {
            Alert.alert(t('error'), error.message || t('unblockUserFailed'));
            return;
          }
          setBlockedUsers((prev) => prev.filter((x) => x.blockId !== item.blockId));
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('blockedUsersTitle')}</Text>
      {blockedUsers.length === 0 ? (
        <Text style={styles.emptyText}>{t('noBlockedUsers')}</Text>
      ) : (
        blockedUsers.map((item) => (
          <View key={item.blockId} style={styles.menuCard}>
            <View style={[styles.menuIconWrap, styles.menuIconWrapDanger]}>
              <Ionicons name="ban-outline" size={20} color={theme.colors.error} />
            </View>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuLabel}>{item.name}</Text>
              <Text style={styles.menuSublabel}>{item.subtitle ?? t('blockedUserDefault')}</Text>
            </View>
            <TouchableOpacity
              onPress={() => handleUnblock(item)}
              disabled={unblockingId === item.blockId}
              style={styles.unblockBtn}
              activeOpacity={0.8}
            >
              <Text style={styles.unblockBtnText}>
                {unblockingId === item.blockId ? '...' : t('removeBlock')}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 30 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 14 },
  emptyText: { fontSize: 14, color: theme.colors.textSecondary },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    ...theme.shadows.sm,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuIconWrapDanger: { backgroundColor: theme.colors.error + '18' },
  menuTextWrap: { flex: 1 },
  menuLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  menuSublabel: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  unblockBtn: {
    backgroundColor: theme.colors.error + '18',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unblockBtnText: { color: theme.colors.error, fontWeight: '700', fontSize: 13 },
});
