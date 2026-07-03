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
} from 'react-native';
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
  setAdminQuickNotesListCache,
} from '@/lib/adminQuickNotesCache';
import { PressableScale } from '@/components/premium/PressableScale';
import { notesTheme } from '@/constants/adminNotesTheme';

type AdminFilter = 'all' | 'staff' | 'mine';

function AdminNotesIndexScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isAdminViewer = canViewAllOrgQuickNotes(staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  const [showArchived, setShowArchived] = useState(false);
  const [allItems, setAllItems] = useState<AdminQuickNoteRow[]>(
    () => getAdminQuickNotesListCache(showArchived) ?? []
  );
  const [loading, setLoading] = useState(() => !getAdminQuickNotesListCache(showArchived)?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all');
  const loadInFlightRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      try {
        const { data, error } = await listAdminQuickNotes({ includeArchived: showArchived });
        if (!error) {
          setAllItems(data);
          setAdminQuickNotesListCache(data, showArchived);
        } else if (!getAdminQuickNotesListCache(showArchived)?.length) {
          setAllItems([]);
        }
      } finally {
        loadInFlightRef.current = false;
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [showArchived]
  );

  useEffect(() => {
    let cancelled = false;
    void hydrateAdminQuickNotesListCache(showArchived).then((cached) => {
      if (cancelled || !cached?.length) return;
      setAllItems(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [showArchived]);

  useFocusEffect(
    useCallback(() => {
      const mem = getAdminQuickNotesListCache(showArchived);
      const age = getAdminQuickNotesListCacheAgeMs(showArchived);
      if (mem?.length) {
        setAllItems(mem);
        setLoading(false);
        if (age != null && age < ADMIN_QUICK_NOTES_FOCUS_REFRESH_MS) return;
        void load({ silent: true });
        return;
      }
      setLoading(true);
      void load();
    }, [load, showArchived])
  );

  const items = useMemo(() => {
    let rows = allItems;
    if (isAdminViewer) {
      if (adminFilter === 'staff') rows = rows.filter(isStaffAuthoredQuickNote);
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

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openNote = useCallback(
    (id: string) => {
      router.push(`${base}/${id}` as never);
    },
    [router, base]
  );

  const renderItem = useCallback(
    ({ item }: { item: AdminQuickNoteRow }) => (
      <AdminNoteListCard note={item} showAuthor={isAdminViewer} onPress={openNote} />
    ),
    [isAdminViewer, openNote]
  );

  const showList = !loading || items.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={notesTheme.textSoft} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Ara…"
            placeholderTextColor={notesTheme.textSoft}
            returnKeyType="search"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={notesTheme.textSoft} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={[styles.iconBtn, showArchived && styles.iconBtnOn]}
          onPress={() => {
            const next = !showArchived;
            setShowArchived(next);
            const cached = getAdminQuickNotesListCache(next);
            if (cached?.length) {
              setAllItems(cached);
              setLoading(false);
              void load({ silent: true });
            } else {
              void load();
            }
          }}
          accessibilityLabel={showArchived ? 'Aktif notlar' : 'Arşiv'}
        >
          <Ionicons
            name={showArchived ? 'folder-open' : 'folder-outline'}
            size={20}
            color={showArchived ? notesTheme.accentDark : notesTheme.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statVal}>{items.length}</Text>
          <Text style={styles.statLbl}>{showArchived ? 'Arşiv' : 'Not'}</Text>
        </View>
        {pinnedCount > 0 ? (
          <View style={styles.stat}>
            <Text style={[styles.statVal, { color: notesTheme.pinned }]}>{pinnedCount}</Text>
            <Text style={styles.statLbl}>Sabit</Text>
          </View>
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
      ) : (
        <Text style={styles.staffHint}>Yalnızca kendi notlarınız listelenir.</Text>
      )}

      {loading && !items.length ? (
        <ActivityIndicator style={styles.loader} color={notesTheme.accent} />
      ) : null}

      {showList ? (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          initialNumToRender={10}
          maxToRenderPerBatch={6}
          windowSize={8}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={items.length ? styles.list : styles.listEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={notesTheme.accent} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="journal-outline" size={32} color={notesTheme.accent} />
              </View>
              <Text style={styles.emptyTitle}>Henüz not yok</Text>
              <Text style={styles.emptySub}>
                Anlık not almak için aşağıdaki butona dokunun. Numara otomatik verilir.
              </Text>
            </View>
          }
        />
      ) : null}

      <PressableScale
        style={[styles.fab, { bottom: 16 + insets.bottom }]}
        onPress={() => router.push(`${base}/new` as never)}
      >
        <View style={styles.fabInner}>
          <Ionicons name="add" size={26} color="#fff" />
        </View>
      </PressableScale>
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
  container: { flex: 1, backgroundColor: notesTheme.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 9,
    backgroundColor: notesTheme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: notesTheme.text, padding: 0 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: notesTheme.card,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  iconBtnOn: { backgroundColor: notesTheme.accentSoft, borderColor: notesTheme.borderFocus },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  stat: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: notesTheme.card,
    borderWidth: 1,
    borderColor: notesTheme.border,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statVal: { fontSize: 16, fontWeight: '800', color: notesTheme.text },
  statLbl: { fontSize: 12, color: notesTheme.textMuted, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: notesTheme.card,
    borderWidth: 1,
    borderColor: notesTheme.border,
  },
  filterChipOn: { backgroundColor: notesTheme.accentGhost, borderColor: notesTheme.accent },
  filterText: { fontSize: 13, fontWeight: '600', color: notesTheme.textMuted },
  filterTextOn: { color: notesTheme.accentDark, fontWeight: '700' },
  staffHint: {
    fontSize: 12,
    color: notesTheme.textMuted,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  loader: { marginTop: 48 },
  list: { paddingHorizontal: 16, paddingBottom: 96 },
  listEmpty: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 96 },
  empty: { alignItems: 'center', paddingTop: 56, gap: 10, paddingHorizontal: 32 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: notesTheme.accentGhost,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: notesTheme.text },
  emptySub: { fontSize: 14, color: notesTheme.textMuted, textAlign: 'center', lineHeight: 21 },
  fab: {
    position: 'absolute',
    right: 16,
    borderRadius: 16,
    shadowColor: notesTheme.accentDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  fabInner: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: notesTheme.accent,
  },
});
