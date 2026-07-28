import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  fetchStaffPerfBoard,
  type StaffPerfBoardRow,
} from '@/lib/staffPerfSystem';
import { formatPerfScore, getPerfBand } from '@/lib/staffPerfBands';
import { CachedImage } from '@/components/CachedImage';

export default function StaffPerfBoardScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<StaffPerfBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error: err } = await fetchStaffPerfBoard(orgId);
    setError(err ?? null);
    setRows(data);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = `${r.full_name ?? ''} ${r.department ?? ''} ${r.role ?? ''}`.toLocaleLowerCase('tr');
      return hay.includes(needle);
    });
  }, [rows, q]);

  const avg =
    rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + (r.performance_score ?? 0), 0) / rows.length)
      : null;

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker
        canUseAll={staff?.app_permissions?.super_admin === true || staff?.role === 'admin'}
        ownOrganizationId={staff?.organization_id}
      />
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Tek Performans Puanı</Text>
        <Text style={styles.heroSub}>
          Tüm davranışlar tek puana (100) etki eder. Denetim geçmişi silinmez.
        </Text>
        <View style={styles.statRow}>
          <View style={styles.stat}>
            <Text style={styles.statN}>{rows.length}</Text>
            <Text style={styles.statL}>Personel</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statN}>{avg != null ? formatPerfScore(avg) : '—'}</Text>
            <Text style={styles.statL}>Ortalama</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statN, { color: '#b91c1c' }]}>
              {rows.filter((r) => r.performance_score < 60).length}
            </Text>
            <Text style={styles.statL}>Risk / Kritik</Text>
          </View>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={() => router.push('/admin/staff-perf/event' as Href)}
        >
          <Ionicons name="add-circle" size={18} color="#fff" />
          <Text style={styles.actionPrimaryText}>Onay kaydı</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => router.push('/admin/staff-perf/categories' as Href)}
        >
          <Ionicons name="list" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.actionText}>10 başlık</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={adminTheme.colors.textMuted} />
        <TextInput
          style={styles.search}
          value={q}
          onChangeText={setQ}
          placeholder="Personel ara…"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={adminTheme.colors.primary} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.staff_id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>Aktif personel bulunamadı.</Text>
          }
          renderItem={({ item, index }) => {
            const band = getPerfBand(item.performance_score);
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/admin/staff-perf/${item.staff_id}` as Href)}
                activeOpacity={0.85}
              >
                <Text style={styles.rank}>{index + 1}</Text>
                {item.profile_image ? (
                  <CachedImage uri={item.profile_image} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh]}>
                    <Ionicons name="person" size={16} color="#64748b" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.full_name || '—'}</Text>
                  <Text style={styles.meta}>
                    {item.department || '—'} · {item.event_count} olay (+{item.positive_count}/−
                    {item.negative_count})
                  </Text>
                  <Text style={[styles.band, { color: band.color }]}>{band.labelTr}</Text>
                </View>
                <View style={[styles.scorePill, { backgroundColor: band.bg, borderColor: band.color }]}>
                  <Text style={[styles.scoreText, { color: band.color }]}>
                    {Math.round(item.performance_score)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#0f3d3a',
  },
  heroTitle: { color: '#f8fafc', fontSize: 17, fontWeight: '800' },
  heroSub: { color: '#99f6e4', fontSize: 12, marginTop: 4, lineHeight: 17 },
  statRow: { flexDirection: 'row', marginTop: 12, gap: 8 },
  stat: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statN: { color: '#fff', fontWeight: '800', fontSize: 15 },
  statL: { color: '#94a3b8', fontSize: 10, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  actionPrimary: { backgroundColor: '#0f3d3a', borderColor: '#0f3d3a' },
  actionPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  actionText: { color: adminTheme.colors.primary, fontWeight: '700', fontSize: 13 },
  searchWrap: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 12,
  },
  search: { flex: 1, paddingVertical: 10, color: adminTheme.colors.text, fontSize: 14 },
  error: { color: '#b91c1c', marginHorizontal: 16, marginTop: 8 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  rank: { width: 22, fontWeight: '800', color: adminTheme.colors.textMuted, fontSize: 13 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarPh: {
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontWeight: '700', fontSize: 14, color: adminTheme.colors.text },
  meta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  band: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  scorePill: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  scoreText: { fontWeight: '800', fontSize: 16 },
});
