import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { CounterpartyListCard } from '@/components/admin/CounterpartyListCard';
import { fetchCounterpartyBalanceMap } from '@/lib/financeCounterpartyBalances';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

type Row = {
  id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  phone: string | null;
};

type ProjRow = { id: string; name: string };

type Tab = 'contacts' | 'projects';

const TYPE_FILTERS: { key: 'all' | FinanceCounterpartyType; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'customer', label: 'Müşteri' },
  { key: 'supplier', label: 'Tedarikçi' },
  { key: 'subcontractor', label: 'Taşeron' },
  { key: 'other', label: 'Diğer' },
];

export default function AccountingCounterpartiesIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [tab, setTab] = useState<Tab>('contacts');
  const [rows, setRows] = useState<Row[]>([]);
  const [projects, setProjects] = useState<ProjRow[]>([]);
  const [balances, setBalances] = useState<Map<string, { net: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FinanceCounterpartyType>('all');
  const [projectName, setProjectName] = useState('');
  const [savingProj, setSavingProj] = useState(false);

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgId || orgId === 'all') {
      setRows([]);
      setProjects([]);
      setBalances(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const [cpRes, prRes] = await Promise.all([
      supabase
        .from('finance_counterparties')
        .select('id, name, party_type, phone')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('finance_projects')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name'),
    ]);
    setRows(cpRes.error ? [] : ((cpRes.data as Row[]) ?? []));
    setProjects(prRes.error ? [] : ((prRes.data as ProjRow[]) ?? []));
    setLoading(false);

    fetchCounterpartyBalanceMap(orgId).then(setBalances);
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== 'all') list = list.filter((r) => r.party_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.phone?.includes(q));
    return list;
  }, [rows, typeFilter, search]);

  const listStats = useMemo(() => {
    let withPositive = 0;
    let withNegative = 0;
    for (const r of rows) {
      const b = balances.get(r.id);
      if (!b || Math.abs(b.net) < 0.01) continue;
      if (b.net > 0) withPositive += 1;
      else withNegative += 1;
    }
    return { withPositive, withNegative };
  }, [rows, balances]);

  const addProject = async () => {
    if (!orgId || orgId === 'all') return;
    if (!projectName.trim()) return;
    setSavingProj(true);
    const { error } = await supabase.from('finance_projects').insert({
      organization_id: orgId,
      name: projectName.trim(),
    });
    setSavingProj(false);
    if (!error) {
      setProjectName('');
      load();
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const needOrg = !orgId || orgId === 'all';

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Cariler</Text>
        <Text style={styles.subtitle}>
          Müşteri, tedarikçi, taşeron… Kimden para aldığınızı, kime ödediğinizi buradan takip edin.
        </Text>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        {needOrg ? (
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>Listeyi görmek için üstten bir işletme seçin.</Text>
          </View>
        ) : (
          <>
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, tab === 'contacts' && styles.tabOn]}
                onPress={() => setTab('contacts')}
              >
                <Text style={[styles.tabText, tab === 'contacts' && styles.tabTextOn]}>
                  Cariler ({rows.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, tab === 'projects' && styles.tabOn]}
                onPress={() => setTab('projects')}
              >
                <Text style={[styles.tabText, tab === 'projects' && styles.tabTextOn]}>
                  Projeler ({projects.length})
                </Text>
              </TouchableOpacity>
            </View>

            {tab === 'contacts' ? (
              <>
                {rows.length > 0 ? (
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNum}>{rows.length}</Text>
                      <Text style={styles.statLbl}>Toplam cari</Text>
                    </View>
                    <View style={[styles.statBox, styles.statBoxPos]}>
                      <Text style={[styles.statNum, styles.statNumPos]}>{listStats.withPositive}</Text>
                      <Text style={styles.statLbl}>Size fazla gelen</Text>
                    </View>
                    <View style={[styles.statBox, styles.statBoxNeg]}>
                      <Text style={[styles.statNum, styles.statNumNeg]}>{listStats.withNegative}</Text>
                      <Text style={styles.statLbl}>Size fazla giden</Text>
                    </View>
                  </View>
                ) : null}

                <View style={styles.legend}>
                  <Text style={styles.legendText}>
                    ↑ aldığınız para · ↓ ödediğiniz para · Net: ikisi arasındaki fark
                  </Text>
                </View>

                <TouchableOpacity
                  style={styles.addMain}
                  onPress={() => router.push('/admin/accounting/counterparties/new')}
                  activeOpacity={0.9}
                >
                  <Ionicons name="person-add-outline" size={24} color="#fff" />
                  <Text style={styles.addMainText}>Yeni kişi / firma ekle</Text>
                </TouchableOpacity>

                <View style={styles.searchWrap}>
                  <Ionicons name="search-outline" size={20} color={adminTheme.colors.textMuted} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="İsim veya telefon ara…"
                    placeholderTextColor={adminTheme.colors.textMuted}
                    value={search}
                    onChangeText={setSearch}
                  />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
                  {TYPE_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, typeFilter === f.key && styles.filterChipOn]}
                      onPress={() => setTypeFilter(f.key)}
                    >
                      <Text style={[styles.filterText, typeFilter === f.key && styles.filterTextOn]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {filtered.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="people-outline" size={40} color={adminTheme.colors.border} />
                    <Text style={styles.emptyTitle}>Henüz cari yok</Text>
                    <Text style={styles.emptySub}>Müşteri, tedarikçi veya taşeron ekleyin.</Text>
                  </View>
                ) : (
                  filtered.map((r) => {
                    const bal = balances.get(r.id);
                    return (
                      <CounterpartyListCard
                        key={r.id}
                        id={r.id}
                        name={r.name}
                        party_type={r.party_type}
                        phone={r.phone}
                        income={bal?.income ?? 0}
                        expense={bal?.expense ?? 0}
                        net={bal?.net ?? 0}
                        onPress={() =>
                          router.push({
                            pathname: '/admin/accounting/counterparties/[id]',
                            params: { id: r.id },
                          } as never)
                        }
                      />
                    );
                  })
                )}
              </>
            ) : (
              <>
                <Text style={styles.projHint}>İnşaat veya proje bazlı gider/gelir için şantiye adı ekleyin.</Text>
                <View style={styles.projAddRow}>
                  <TextInput
                    style={styles.projInput}
                    placeholder="Proje adı (örn. Villa Y)"
                    placeholderTextColor={adminTheme.colors.textMuted}
                    value={projectName}
                    onChangeText={setProjectName}
                  />
                  <TouchableOpacity style={styles.projAddBtn} onPress={addProject} disabled={savingProj}>
                    {savingProj ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name="add" size={24} color="#fff" />
                    )}
                  </TouchableOpacity>
                </View>
                {projects.length === 0 ? (
                  <Text style={styles.emptySub}>Proje yok.</Text>
                ) : (
                  projects.map((p) => (
                    <View key={p.id} style={styles.projCard}>
                      <Ionicons name="business-outline" size={20} color={adminTheme.colors.primary} />
                      <Text style={styles.projName}>{p.name}</Text>
                    </View>
                  ))
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  title: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  subtitle: { fontSize: 14, color: adminTheme.colors.textMuted, marginBottom: 16, lineHeight: 20 },
  hintBox: {
    backgroundColor: adminTheme.colors.surface,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  hintText: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: adminTheme.colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  tabTextOn: { color: '#fff' },
  addMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 16,
  },
  addMainText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 16, color: adminTheme.colors.text, paddingVertical: 10 },
  filters: { marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  filterChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterText: { fontSize: 13, color: adminTheme.colors.text },
  filterTextOn: { color: '#fff', fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statBoxPos: { borderColor: '#bbf7d0' },
  statBoxNeg: { borderColor: '#fecaca' },
  statNum: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  statNumPos: { color: '#16a34a' },
  statNumNeg: { color: '#dc2626' },
  statLbl: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 4, textAlign: 'center' },
  legend: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  legendText: { fontSize: 12, color: adminTheme.colors.textMuted, lineHeight: 17 },
  emptyBox: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  emptySub: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center' },
  projHint: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 12, lineHeight: 18 },
  projAddRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  projInput: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    color: adminTheme.colors.text,
  },
  projAddBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  projCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  projName: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
});
