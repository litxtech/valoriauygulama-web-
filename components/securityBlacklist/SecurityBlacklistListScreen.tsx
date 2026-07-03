import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useCachedList } from '@/hooks/useCachedList';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlacklistEntryCard } from '@/components/securityBlacklist/BlacklistEntryCard';
import { BlacklistScrollTopBar } from '@/components/securityBlacklist/BlacklistScrollTopBar';
import { useAuthStore } from '@/stores/authStore';
import { canAccessSecurityBlacklist } from '@/lib/staffPermissions';
import { listSecurityBlacklistEntries, securityBlacklistMatchesScope, type SecurityBlacklistScopeFilter } from '@/lib/securityBlacklist';
import { blacklistTheme } from '@/lib/securityBlacklistTheme';

export function SecurityBlacklistListScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/blacklist' : '/staff/blacklist';
  const canManage = canAccessSecurityBlacklist(staff);

  const [search, setSearch] = useState('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<SecurityBlacklistScopeFilter>('all');

  type BlacklistItem = Awaited<ReturnType<typeof listSecurityBlacklistEntries>>['data'][number];

  const fetchItems = useCallback(async () => {
    const { data, error } = await listSecurityBlacklistEntries({ includeRemoved: showRemoved });
    if (error) return [];
    return data;
  }, [showRemoved]);

  const { items, loading, refreshing, refresh } = useCachedList<BlacklistItem>({
    cacheKey: `security-blacklist:${showRemoved ? 'all' : 'active'}`,
    fetchItems,
  });

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((r) => {
      if (!securityBlacklistMatchesScope(r, scopeFilter)) return false;
      const full = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (
        full.includes(term) ||
        r.reference_code.toLowerCase().includes(term) ||
        r.incident_description.toLowerCase().includes(term) ||
        (r.nationality ?? '').toLowerCase().includes(term) ||
        (r.id_document_ref ?? '').toLowerCase().includes(term) ||
        (r.hotel_note ?? '').toLowerCase().includes(term) ||
        (r.family_note ?? '').toLowerCase().includes(term)
      );
    });
  }, [items, search, scopeFilter]);

  const activeCount = useMemo(() => items.filter((i) => !i.is_removed).length, [items]);

  const listHeader = (
    <View>
      <LinearGradient colors={[...blacklistTheme.heroGradient]} style={styles.hero}>
        <BlacklistScrollTopBar fallback={base} />
        <View style={styles.heroIconWrap}>
          <LinearGradient colors={[...blacklistTheme.accentGradient]} style={styles.heroIcon}>
            <Ionicons name="shield" size={26} color="#fff" />
          </LinearGradient>
        </View>
        <Text style={styles.heroTitle}>Güvenlik Kara Listesi</Text>
        <Text style={styles.heroSub}>
          Riskli kişiler otel personeline bildirilir. {canManage ? 'Yeni kayıt ekleyebilirsiniz.' : 'Yalnızca görüntüleme.'}
        </Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{activeCount}</Text>
            <Text style={styles.statLabel}>Aktif kayıt</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{items.length}</Text>
            <Text style={styles.statLabel}>{showRemoved ? 'Toplam' : 'Gösterilen'}</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color={blacklistTheme.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Ad, soyad, kayıt no veya olay ara…"
          placeholderTextColor={blacklistTheme.textMuted}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={blacklistTheme.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <TouchableOpacity style={styles.filterChip} onPress={() => setShowRemoved((v) => !v)}>
        <Ionicons name={showRemoved ? 'eye-off-outline' : 'archive-outline'} size={15} color="#FCA5A5" />
        <Text style={styles.filterText}>{showRemoved ? 'Aktif kayıtlar' : 'Arşiv kayıtları'}</Text>
      </TouchableOpacity>

      <View style={styles.scopeRow}>
        {(
          [
            { key: 'all', label: 'Tümü' },
            { key: 'hotel', label: 'Otel notu' },
            { key: 'family', label: 'Aile notu' },
          ] as const
        ).map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.scopeChip, scopeFilter === f.key && styles.scopeChipOn]}
            onPress={() => setScopeFilter(f.key)}
          >
            <Text style={[styles.scopeChipText, scopeFilter === f.key && styles.scopeChipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !filteredItems.length ? <ActivityIndicator style={styles.loader} color={blacklistTheme.accent} /> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={loading && !filteredItems.length ? [] : filteredItems}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <BlacklistEntryCard item={item} onPress={() => router.push(`${base}/${item.id}` as never)} />
        )}
        ListHeaderComponent={listHeader}
        contentContainerStyle={filteredItems.length ? styles.list : styles.listEmpty}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={blacklistTheme.accent}
          />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Ionicons name="person-remove-outline" size={42} color="#475569" />
              <Text style={styles.emptyTitle}>Kayıt bulunamadı</Text>
              <Text style={styles.emptySub}>
                {canManage ? 'Sağ alttaki + ile yeni kara liste kaydı ekleyin.' : 'Henüz paylaşılmış bir kayıt yok.'}
              </Text>
            </View>
          )
        }
      />

      {canManage ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: 20 + insets.bottom }]}
          activeOpacity={0.92}
          onPress={() => router.push('/admin/blacklist/new' as never)}
        >
          <LinearGradient colors={['#991B1B', '#EF4444']} style={styles.fabGrad}>
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: blacklistTheme.bg },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroIconWrap: { marginBottom: 12 },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  heroSub: { fontSize: 13, color: '#CBD5E1', lineHeight: 19, marginTop: 6, maxWidth: 320 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  statCard: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statValue: { fontSize: 22, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 12, color: '#94A3B8', marginTop: 2, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    backgroundColor: blacklistTheme.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: blacklistTheme.text, padding: 0 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginLeft: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: blacklistTheme.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.22)',
  },
  filterText: { fontSize: 13, fontWeight: '700', color: '#FCA5A5' },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: blacklistTheme.surface,
    borderWidth: 1,
    borderColor: blacklistTheme.border,
  },
  scopeChipOn: {
    backgroundColor: blacklistTheme.accentSoft,
    borderColor: 'rgba(239, 68, 68, 0.28)',
  },
  scopeChipText: { fontSize: 12, fontWeight: '700', color: blacklistTheme.textMuted },
  scopeChipTextOn: { color: '#FCA5A5' },
  loader: { marginTop: 24, marginBottom: 16 },
  list: { paddingHorizontal: 16, paddingBottom: 110 },
  listEmpty: { flexGrow: 1, paddingBottom: 110 },
  separator: { height: 10 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: blacklistTheme.text },
  emptySub: { fontSize: 14, color: blacklistTheme.textMuted, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fabGrad: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
