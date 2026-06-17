import { useCallback, useMemo, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { AdminNotesAccessGate } from '@/components/adminNotes/AdminNotesAccessGate';
import { AdminNoteListCard } from '@/components/adminNotes/AdminNoteListCard';
import { useAuthStore } from '@/stores/authStore';
import { canViewAllOrgQuickNotes } from '@/lib/staffPermissions';
import { isStaffAuthoredQuickNote, listAdminQuickNotes, type AdminQuickNoteRow } from '@/lib/adminQuickNotes';
import { PressableScale } from '@/components/premium/PressableScale';
import { theme } from '@/constants/theme';

type AdminFilter = 'all' | 'staff' | 'mine';

function AdminNotesIndexScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isAdminViewer = canViewAllOrgQuickNotes(staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/notes' : '/staff/admin-notes';

  const [allItems, setAllItems] = useState<AdminQuickNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [adminFilter, setAdminFilter] = useState<AdminFilter>('all');

  const load = useCallback(async () => {
    const { data, error } = await listAdminQuickNotes({ includeArchived: showArchived });
    if (!error) setAllItems(data);
    setLoading(false);
    setRefreshing(false);
  }, [showArchived]);

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

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#EEF2FF', '#F8FAFC']} style={styles.headerGlow} pointerEvents="none" />

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Not no, başlık veya metin ara…"
          placeholderTextColor="#94A3B8"
          returnKeyType="search"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.archiveToggle} onPress={() => setShowArchived((v) => !v)}>
        <Ionicons name={showArchived ? 'folder-open' : 'folder-outline'} size={16} color="#6366F1" />
        <Text style={styles.archiveText}>{showArchived ? 'Aktif notlar' : 'Arşiv'}</Text>
      </Pressable>

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
              <Text style={[styles.filterText, adminFilter === f.key && styles.filterTextOn]}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={styles.staffHint}>Yalnızca kendi notlarınızı görürsünüz. Yönetici notları size açılmaz.</Text>
      )}

      {loading && !items.length ? (
        <ActivityIndicator style={styles.loader} color="#6366F1" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <AdminNoteListCard
              note={item}
              showAuthor={isAdminViewer}
              onPress={(id) => router.push(`${base}/${id}` as never)}
            />
          )}
          contentContainerStyle={items.length ? styles.list : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="document-text-outline" size={36} color="#C7D2FE" />
              <Text style={styles.emptyTitle}>Henüz not yok</Text>
              <Text style={styles.emptySub}>Sağ alttaki + ile anlık not alın. Numara otomatik verilir.</Text>
            </View>
          }
        />
      )}

      <PressableScale
        style={[styles.fab, { bottom: 20 + insets.bottom }]}
        onPress={() => router.push(`${base}/new` as never)}
      >
        <LinearGradient colors={['#6366F1', '#8B5CF6']} style={styles.fabGrad}>
          <Ionicons name="add" size={28} color="#fff" />
        </LinearGradient>
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
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  headerGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 14,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.colors.text, padding: 0 },
  archiveToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  archiveText: { fontSize: 12, fontWeight: '700', color: '#4F46E5' },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, marginBottom: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipOn: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterTextOn: { color: '#4F46E5' },
  staffHint: {
    fontSize: 11,
    color: '#64748B',
    marginHorizontal: 14,
    marginBottom: 8,
    lineHeight: 16,
  },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 14, paddingBottom: 100 },
  listEmpty: { flexGrow: 1, paddingHorizontal: 14, paddingBottom: 100 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#334155' },
  emptySub: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },
  fab: {
    position: 'absolute',
    right: 18,
    borderRadius: 28,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  fabGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
