import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme as T } from '@/constants/adminTheme';
import { canAccessAdminRoute } from '@/lib/adminRoutePermissions';
import { listStaffDepartures } from '@/lib/staffDeparture/api';
import type { StaffDepartureListItem } from '@/lib/staffDeparture/types';
import { StaffDepartureCard } from '@/components/staffDeparture/StaffDepartureCard';
import { StaffDepartureFormModal } from '@/components/staffDeparture/StaffDepartureFormModal';

export default function StaffDeparturesScreen() {
  const staff = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const allowed = canAccessAdminRoute(staff, '/admin/staff-departures');

  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const [items, setItems] = useState<StaffDepartureListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<StaffDepartureListItem | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !allowed) {
      setItems([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const result = await listStaffDepartures({
      organizationId: orgId,
      status: showAll ? 'all' : 'planned',
      search: search.trim() || undefined,
    });
    setError(result.error ?? null);
    setItems(result.items);
    setLoading(false);
    setRefreshing(false);
  }, [orgId, allowed, showAll, search]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const upcomingCount = useMemo(
    () => items.filter((i) => i.status === 'planned').length,
    [items]
  );

  const openCreate = () => {
    setEditItem(null);
    setFormOpen(true);
  };

  const openEdit = (item: StaffDepartureListItem) => {
    setEditItem(item);
    setFormOpen(true);
  };

  if (!allowed) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={40} color={T.colors.textMuted} />
        <Text style={styles.deniedText}>Bu sayfaya erişim yetkiniz yok.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        ListHeaderComponent={
          <>
            <LinearGradient
              colors={['#1e3a5f', '#2563eb', '#3b82f6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroTop}>
                <View style={styles.heroIconWrap}>
                  <Ionicons name="exit-outline" size={22} color="#bfdbfe" />
                </View>
                <TouchableOpacity style={styles.addBtn} onPress={openCreate}>
                  <Ionicons name="add" size={20} color="#1e3a5f" />
                  <Text style={styles.addBtnText}>Ekle</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.heroTitle}>Personel Ayrılış Listesi</Text>
              <Text style={styles.heroSub}>
                Otelden çıkış tarihleri · bireysel veya toplu kayıt · güncellemede bildirim
              </Text>
              <View style={styles.statRow}>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{upcomingCount}</Text>
                  <Text style={styles.statL}>Planlanan</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statN}>{items.length}</Text>
                  <Text style={styles.statL}>{showAll ? 'Toplam kayıt' : 'Listede'}</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.toolbar}>
              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={T.colors.textMuted} />
                <TextInput
                  style={styles.search}
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Personel ara…"
                  placeholderTextColor={T.colors.textMuted}
                  returnKeyType="search"
                />
              </View>
              <TouchableOpacity
                style={[styles.filterChip, showAll && styles.filterChipActive]}
                onPress={() => setShowAll((v) => !v)}
              >
                <Text style={[styles.filterChipText, showAll && styles.filterChipTextActive]}>
                  {showAll ? 'Tümü' : 'Planlanan'}
                </Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {loading ? (
              <ActivityIndicator style={{ marginVertical: 24 }} color={T.colors.primary} />
            ) : null}
          </>
        }
        renderItem={({ item }) => (
          <StaffDepartureCard item={item} onPress={() => openEdit(item)} />
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={36} color={T.colors.textMuted} />
              <Text style={styles.emptyTitle}>Kayıt yok</Text>
              <Text style={styles.emptySub}>
                Bireysel veya toplu ayrılış ekleyin; personele özel sesli bildirim gider.
              </Text>
            </View>
          ) : null
        }
      />

      {orgId && staff?.id ? (
        <StaffDepartureFormModal
          visible={formOpen}
          organizationId={orgId}
          createdByStaffId={staff.id}
          editItem={editItem}
          onClose={() => {
            setFormOpen(false);
            setEditItem(null);
          }}
          onSaved={() => {
            setLoading(true);
            void load();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  listContent: { padding: 16, paddingBottom: 32 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  deniedText: { color: T.colors.textMuted, textAlign: 'center' },
  hero: { borderRadius: 16, padding: 16, marginBottom: 14 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  addBtnText: { fontWeight: '700', color: '#1e3a5f' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 12 },
  heroSub: { fontSize: 13, color: '#dbeafe', marginTop: 4, lineHeight: 18 },
  statRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  statN: { fontSize: 20, fontWeight: '800', color: '#fff' },
  statL: { fontSize: 11, color: '#bfdbfe', marginTop: 2 },
  toolbar: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  search: { flex: 1, fontSize: 15, color: T.colors.text, padding: 0 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: T.colors.textMuted },
  filterChipTextActive: { color: '#fff' },
  error: { color: '#b91c1c', marginBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: T.colors.text },
  emptySub: { fontSize: 13, color: T.colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
});
