import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { FacilityJournalAccessGate } from '@/components/staff/FacilityJournalAccessGate';
import { FacilityJournalListCard } from '@/components/facilityJournal/FacilityJournalListCard';
import { listFacilityJournalRecords, type FacilityJournalRecordRow } from '@/lib/facilityJournal';
import {
  FACILITY_JOURNAL_FOCUS_REFRESH_MS,
  getFacilityJournalListCache,
  getFacilityJournalListCacheAgeMs,
  hydrateFacilityJournalListCache,
  setFacilityJournalListCache,
} from '@/lib/facilityJournalCache';
import { useAuthStore } from '@/stores/authStore';
import { canManageFacilityJournalTypes } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';

function FacilityJournalIndexScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/facility-journal' : '/staff/facility-journal';
  const canManageTypes = canManageFacilityJournalTypes(staff);

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

  const [items, setItems] = useState<FacilityJournalRecordRow[]>(() => getFacilityJournalListCache() ?? []);
  const [loading, setLoading] = useState(() => !getFacilityJournalListCache()?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    try {
      const { data, error } = await listFacilityJournalRecords();
      if (error) {
        if (!opts?.silent) {
          setLoadError(error.message ?? 'Liste yüklenemedi');
        }
        if (!getFacilityJournalListCache()?.length) setItems([]);
      } else {
        const rows = (data as FacilityJournalRecordRow[]) ?? [];
        setLoadError(null);
        setItems(rows);
        setFacilityJournalListCache(rows);
      }
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void hydrateFacilityJournalListCache().then((cached) => {
      if (cancelled || !cached?.length) return;
      setItems(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const mem = getFacilityJournalListCache();
      const age = getFacilityJournalListCacheAgeMs();
      if (mem?.length) {
        setItems(mem);
        setLoading(false);
        if (age != null && age < FACILITY_JOURNAL_FOCUS_REFRESH_MS) return;
        void load({ silent: true });
        return;
      }
      setLoading(true);
      void load();
    }, [load])
  );

  const emptyHint = useMemo(
    () =>
      staff?.role === 'admin'
        ? 'Henüz kayıt yok. Yeni kayıt veya kayıt tipleri ekleyin.'
        : 'Size açılan veya sizin oluşturduğunuz kayıtlar burada listelenir.',
    [staff?.role]
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

  const showList = !loading || items.length > 0;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.newBtn} onPress={() => router.push(`${base}/new` as never)}>
        <Ionicons name="add-circle" size={22} color="#fff" />
        <Text style={styles.newBtnText}>Yeni kayıt</Text>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
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
