import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Pressable,
  Platform,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteListCard } from '@/components/adminNotes/AdminNoteListCard';
import { useAuthStore } from '@/stores/authStore';
import { canViewAllOrgQuickNotes } from '@/lib/staffPermissions';
import { isStaffAuthoredQuickNote, listAdminQuickNotes, type AdminQuickNoteRow } from '@/lib/adminQuickNotes';
import {
  ADMIN_QUICK_NOTES_FOCUS_REFRESH_MS,
  getAdminQuickNotesListCache,
  getAdminQuickNotesListCacheAgeMs,
  hydrateAdminQuickNotesListCache,
  invalidateAdminQuickNotesListCache,
  setAdminQuickNotesListCache,
} from '@/lib/adminQuickNotesCache';
import { ADMIN_LIST_PERF } from '@/lib/adminPerf';
import { PressableScale } from '@/components/premium/PressableScale';
import { pds } from '@/constants/personelDesignSystem';

type AdminFilter = 'all' | 'staff' | 'mine';
type ListTab = 'active' | 'archived';

function AdminNotesIndexScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isAdminViewer = canViewAllOrgQuickNotes(staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  const staffId = staff?.id ?? null;
  const [listTab, setListTab] = useState<ListTab>('active');
  const showArchived = listTab === 'archived';
  const [allItems, setAllItems] = useState<AdminQuickNoteRow[]>(
    () => getAdminQuickNotesListCache(showArchived, staffId) ?? []
  );
  const [loading, setLoading] = useState(
    () => !getAdminQuickNotesListCache(showArchived, staffId)?.length
  );
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all');
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadInFlightRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean; force?: boolean; includeArchived?: boolean }) => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      const archived = opts?.includeArchived ?? showArchived;
      try {
        if (opts?.force) invalidateAdminQuickNotesListCache();
        // Liste: medya yok — tek RPC, hızlı ilk boyama
        const { data, error } = await listAdminQuickNotes({
          includeArchived: archived,
          includeMedia: false,
        });
        if (!error) {
          setLoadError(null);
          setAllItems(data);
          setAdminQuickNotesListCache(data, archived, staffId);
        } else {
          setLoadError(error);
          if (!getAdminQuickNotesListCache(archived, staffId)?.length) {
            setAllItems([]);
          }
        }
      } finally {
        loadInFlightRef.current = false;
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [showArchived, staffId]
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateAdminQuickNotesListCache(showArchived, staffId).then((cached) => {
      if (cancelled || !cached?.length) return;
      setAllItems(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showArchived, staffId]);

  useFocusEffect(
    useCallback(() => {
      const mem = getAdminQuickNotesListCache(showArchived, staffId);
      const age = getAdminQuickNotesListCacheAgeMs(showArchived, staffId);
      if (mem?.length) {
        setAllItems(mem);
        setLoading(false);
        if (isAdminViewer) {
          InteractionManager.runAfterInteractions(() => {
            void load({ silent: true, force: true });
          });
          return;
        }
        if (age != null && age < ADMIN_QUICK_NOTES_FOCUS_REFRESH_MS) return;
        InteractionManager.runAfterInteractions(() => {
          void load({ silent: true });
        });
        return;
      }
      setLoading(true);
      void load();
    }, [isAdminViewer, load, showArchived, staffId])
  );

  const switchTab = useCallback(
    (tab: ListTab) => {
      if (tab === listTab) return;
      setListTab(tab);
      setSearch('');
      const archived = tab === 'archived';
      const cached = getAdminQuickNotesListCache(archived, staffId);
      if (cached?.length) {
        setAllItems(cached);
        setLoading(false);
        void load({ silent: true, includeArchived: archived });
      } else {
        setAllItems([]);
        setLoading(true);
        void load({ includeArchived: archived });
      }
    },
    [listTab, load, staffId]
  );

  const items = useMemo(() => {
    let rows = allItems;
    if (isAdminViewer) {
      if (adminFilter === 'staff') {
        rows = rows.filter((n) => isStaffAuthoredQuickNote(n, staff?.id));
      }
      if (adminFilter === 'mine') rows = rows.filter((n) => n.created_by_staff_id === staff?.id);
    }
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (n) =>
        n.note_number.toLowerCase().includes(term) ||
        (n.title ?? '').toLowerCase().includes(term) ||
        n.body_text.toLowerCase().includes(term) ||
        (n.room_label ?? '').toLowerCase().includes(term) ||
        (n.creator?.full_name ?? '').toLowerCase().includes(term)
    );
  }, [allItems, search, isAdminViewer, adminFilter, staff?.id]);

  const pinnedCount = useMemo(() => items.filter((n) => n.is_pinned).length, [items]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ force: true });
  }, [load]);

  const openNote = useCallback(
    (id: string) => {
      router.push(`${base}/${id}` as never);
    },
    [router, base]
  );

  const openNew = useCallback(() => {
    router.push(`${base}/new` as never);
  }, [router, base]);

  const renderItem = useCallback(
    ({ item }: { item: AdminQuickNoteRow }) => (
      <AdminNoteListCard note={item} showAuthor={isAdminViewer} onPress={openNote} />
    ),
    [isAdminViewer, openNote]
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <LinearGradient
          colors={pds.gradientPrimary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroKicker}>{isAdminViewer ? 'YÖNETİM' : 'NOTLARIM'}</Text>
              <Text style={styles.heroTitle}>{showArchived ? 'Arşiv' : 'Not Al'}</Text>
              <Text style={styles.heroSub}>
                {loading && !items.length
                  ? 'Yükleniyor…'
                  : showArchived
                    ? `${items.length} arşiv kaydı`
                    : pinnedCount > 0
                      ? `${items.length} not · ${pinnedCount} sabitli`
                      : `${items.length} not`}
              </Text>
            </View>
            <PressableScale style={styles.heroCta} onPress={openNew}>
              <Ionicons name="add" size={22} color={pds.indigo} />
              <Text style={styles.heroCtaText}>Yeni</Text>
            </PressableScale>
          </View>
        </LinearGradient>

        <View style={styles.segment}>
          {(
            [
              { key: 'active' as const, label: 'Aktif', icon: 'document-text-outline' as const },
              { key: 'archived' as const, label: 'Arşiv', icon: 'archive-outline' as const },
            ] as const
          ).map((t) => {
            const on = listTab === t.key;
            return (
              <Pressable
                key={t.key}
                style={[styles.segmentBtn, on && styles.segmentBtnOn]}
                onPress={() => switchTab(t.key)}
              >
                <Ionicons name={t.icon} size={16} color={on ? '#fff' : pds.subtext} />
                <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={pds.muted} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Notlarda ara…"
            placeholderTextColor={pds.muted}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={pds.muted} />
            </Pressable>
          ) : null}
        </View>

        {isAdminViewer ? (
          <View style={styles.filterRow}>
            {(
              [
                { key: 'all', label: 'Tümü' },
                { key: 'staff', label: 'Personel' },
                { key: 'mine', label: 'Benim' },
              ] as const
            ).map((f) => (
              <Pressable
                key={f.key}
                style={[styles.filterChip, adminFilter === f.key && styles.filterChipOn]}
                onPress={() => setAdminFilter(f.key)}
              >
                <Text style={[styles.filterText, adminFilter === f.key && styles.filterTextOn]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    ),
    [
      adminFilter,
      isAdminViewer,
      items.length,
      listTab,
      loading,
      openNew,
      pinnedCount,
      search,
      showArchived,
      switchTab,
    ]
  );

  const listEmpty = useMemo(
    () => (
      <View style={styles.empty}>
        {loading ? (
          <ActivityIndicator color={pds.indigo} size="large" />
        ) : (
          <>
            <View style={styles.emptyIcon}>
              <Ionicons
                name={loadError ? 'warning-outline' : showArchived ? 'archive-outline' : 'create-outline'}
                size={30}
                color={loadError ? '#DC2626' : pds.indigo}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {loadError ? 'Liste yüklenemedi' : showArchived ? 'Arşiv boş' : 'Henüz not yok'}
            </Text>
            <Text style={styles.emptySub}>
              {loadError
                ? loadError
                : showArchived
                  ? 'Arşivlediğiniz notlar burada görünür.'
                  : isAdminViewer
                    ? 'Personel ve sizin notlarınız burada listelenir.'
                    : 'Hızlı not almak için Yeni butonuna dokunun.'}
            </Text>
            {loadError ? (
              <Pressable style={styles.retryBtn} onPress={() => void load({ force: true })}>
                <Text style={styles.retryText}>Tekrar dene</Text>
              </Pressable>
            ) : !showArchived ? (
              <PressableScale style={styles.emptyCta} onPress={openNew}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>İlk notu yaz</Text>
              </PressableScale>
            ) : null}
          </>
        )}
      </View>
    ),
    [isAdminViewer, load, loadError, loading, openNew, showArchived]
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        initialNumToRender={ADMIN_LIST_PERF.initialNumToRender}
        maxToRenderPerBatch={ADMIN_LIST_PERF.maxToRenderPerBatch}
        windowSize={ADMIN_LIST_PERF.windowSize}
        updateCellsBatchingPeriod={ADMIN_LIST_PERF.updateCellsBatchingPeriod}
        removeClippedSubviews={ADMIN_LIST_PERF.removeClippedSubviews}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: 28 + insets.bottom },
          items.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pds.indigo} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

export default function AdminNotesIndex() {
  return (
    <AdminNotesAccessGate>
      <AdminNotesIndexScreen />
    </AdminNotesAccessGate>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: pds.pageBg },
  list: { paddingHorizontal: 16 },
  listEmpty: { flexGrow: 1 },
  headerBlock: { paddingTop: 8, marginBottom: 4 },
  hero: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 14,
    ...pds.shadowCard,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroKicker: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub: { marginTop: 4, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
  },
  heroCtaText: { fontSize: 14, fontWeight: '800', color: pds.indigo },
  segment: {
    flexDirection: 'row',
    backgroundColor: pds.cardBg,
    borderRadius: 14,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: pds.cardBorder,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 11,
  },
  segmentBtnOn: { backgroundColor: pds.indigo },
  segmentText: { fontSize: 13, fontWeight: '700', color: pds.subtext },
  segmentTextOn: { color: '#fff' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: pds.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: pds.cardBorder,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: pds.text, padding: 0 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: pds.cardBg,
    borderWidth: 1,
    borderColor: pds.cardBorder,
  },
  filterChipOn: { backgroundColor: '#EEF2FF', borderColor: pds.indigo },
  filterText: { fontSize: 13, fontWeight: '600', color: pds.subtext },
  filterTextOn: { color: pds.indigo, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 40, gap: 10, paddingHorizontal: 28 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: pds.text },
  emptySub: { fontSize: 14, color: pds.subtext, textAlign: 'center', lineHeight: 21 },
  retryBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 10 },
  retryText: { color: pds.indigo, fontWeight: '700', fontSize: 15 },
  emptyCta: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: pds.indigo,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
