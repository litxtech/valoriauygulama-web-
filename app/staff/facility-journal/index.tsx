import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { FacilityJournalAccessGate } from '@/components/staff/FacilityJournalAccessGate';
import { FacilityJournalListCard } from '@/components/facilityJournal/FacilityJournalListCard';
import { listFacilityJournalRecords, type FacilityJournalRecordRow } from '@/lib/facilityJournal';
import { useAuthStore } from '@/stores/authStore';
import { canManageFacilityJournalTypes } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { useCachedList } from '@/hooks/useCachedList';

function FacilityJournalIndexScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/facility-journal' : '/staff/facility-journal';
  const canManageTypes = canManageFacilityJournalTypes(staff);
  const cacheKey = isAdminRoute ? 'admin-facility-journal-list' : 'staff-facility-journal-list';
  const [loadError, setLoadError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel="Geri" fallback={base as never} />
        ),
      headerRight: () =>
        canManageTypes ? (
          <TouchableOpacity onPress={() => router.push(`${base}/types` as never)} style={styles.headerBtn}>
            <Ionicons name="options-outline" size={22} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : null,
    });
  }, [navigation, isAdminRoute, base, canManageTypes, router]);

  const fetchItems = useCallback(async () => {
    const { data, error } = await listFacilityJournalRecords();
    if (error) {
      setLoadError(error.message ?? t('staffFjListLoadFailed'));
      return [];
    }
    setLoadError(null);
    return ((data as FacilityJournalRecordRow[]) ?? []) as FacilityJournalRecordRow[];
  }, [t]);

  const {
    items,
    loading,
    refreshing,
    refresh,
    showList,
  } = useCachedList<FacilityJournalRecordRow>({
    cacheKey,
    fetchItems,
  });

  const emptyHint = useMemo(
    () => (staff?.role === 'admin' ? t('staffFjEmptyAdmin') : t('staffFjEmptyStaff')),
    [staff?.role, t]
  );

  const openRecord = useCallback(
    (id: string) => {
      router.push(`${base}/${id}` as never);
    },
    [router, base]
  );

  const renderItem = useCallback(
    ({ item }: { item: FacilityJournalRecordRow }) => (
      <FacilityJournalListCard item={item} onPress={openRecord} />
    ),
    [openRecord]
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newBtn} onPress={() => router.push(`${base}/new` as never)}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.newBtnText}>{t('staffFacilityJournalNew')}</Text>
      </TouchableOpacity>

      {loading && !items.length ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
      ) : null}

      {showList ? (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          initialNumToRender={8}
          maxToRenderPerBatch={5}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={items.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ListEmptyComponent={
            loadError ? (
              <Text style={styles.error}>{loadError}</Text>
            ) : (
              <Text style={styles.empty}>{emptyHint}</Text>
            )
          }
        />
      ) : null}
    </View>
  );
}

export default function FacilityJournalIndex() {
  return (
    <FacilityJournalAccessGate>
      <FacilityJournalIndexScreen />
    </FacilityJournalAccessGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  headerBtn: { paddingHorizontal: 12, paddingVertical: 6 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 },
  listEmpty: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  empty: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 },
  error: { textAlign: 'center', color: '#dc2626', fontSize: 15, lineHeight: 22 },
});
