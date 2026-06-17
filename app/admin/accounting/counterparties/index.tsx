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
  Alert,
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
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { LEDGER_SCOPE_LABELS } from '@/lib/financeLedger';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import {
  buildCounterpartyListReportHtml,
  counterpartyPartyTypeLabel,
  resolveFinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import {
  accountingCanUseAllOrg,
  mergeCounterpartyBalancesForOrgs,
  organizationNameById,
  resolveAccountingOrgScope,
} from '@/lib/accountingOrgScope';
import {
  confirmDeactivateCounterparty,
  deactivateFinanceCounterparty,
} from '@/lib/financeCounterpartyActions';

type Row = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  profile_image: string | null;
};

type ProjRow = { id: string; name: string };

type Tab = 'contacts' | 'projects';
type ScopeFilter = 'all' | FinanceLedgerScope;
type SortMode = 'name' | 'paid_most';

const TYPE_FILTERS: { key: 'all' | FinanceCounterpartyType; label: string }[] = [
  { key: 'all', label: 'Tümü' },
  { key: 'private_person', label: 'Şahsi kişi' },
  { key: 'subcontractor', label: 'Usta / taşeron' },
  { key: 'supplier', label: 'Tedarikçi' },
  { key: 'customer', label: 'Müşteri' },
  { key: 'other', label: 'Diğer' },
];

const SCOPE_FILTERS: { key: ScopeFilter; label: string }[] = [
  { key: 'all', label: 'Tüm kayıtlar' },
  { key: 'hotel', label: LEDGER_SCOPE_LABELS.hotel },
  { key: 'personal', label: LEDGER_SCOPE_LABELS.personal },
];

export default function AccountingCounterpartiesIndex() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const [tab, setTab] = useState<Tab>('contacts');
  const [rows, setRows] = useState<Row[]>([]);
  const [projects, setProjects] = useState<ProjRow[]>([]);
  const [balances, setBalances] = useState<
    Map<string, { income: number; expense: number; net: number }>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FinanceCounterpartyType>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [projectName, setProjectName] = useState('');
  const [savingProj, setSavingProj] = useState(false);

  const canUseAllOrg = accountingCanUseAllOrg(me);
  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );
  const pickerOrgId = orgScope && orgScope !== 'all' ? orgScope : me?.organization_id;

  const load = useCallback(async () => {
    if (!orgScope) {
      setRows([]);
      setProjects([]);
      setBalances(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    let cpQ = supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
      .eq('is_active', true)
      .order('name');
    let prQ = supabase.from('finance_projects').select('id, name').eq('is_active', true).order('name');
    if (orgScope !== 'all') {
      cpQ = cpQ.eq('organization_id', orgScope);
      prQ = prQ.eq('organization_id', orgScope);
    }
    const [cpRes, prRes] = await Promise.all([cpQ, prQ]);
    const list = cpRes.error ? [] : ((cpRes.data as Row[]) ?? []);
    setRows(list);
    setProjects(prRes.error ? [] : ((prRes.data as ProjRow[]) ?? []));
    setLoading(false);

    const scope = scopeFilter === 'all' ? null : scopeFilter;
    if (orgScope === 'all') {
      mergeCounterpartyBalancesForOrgs(
        list.map((r) => r.organization_id),
        (oid) => fetchCounterpartyBalanceMap(oid, scope)
      ).then(setBalances);
    } else {
      fetchCounterpartyBalanceMap(orgScope, scope).then(setBalances);
    }
  }, [orgScope, scopeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== 'all') list = list.filter((r) => r.party_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.phone?.includes(q));
    if (sortMode === 'paid_most') {
      list = [...list].sort((a, b) => {
        const ea = balances.get(a.id)?.expense ?? 0;
        const eb = balances.get(b.id)?.expense ?? 0;
        if (eb !== ea) return eb - ea;
        return a.name.localeCompare(b.name, 'tr');
      });
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }
    return list;
  }, [rows, typeFilter, search, sortMode, balances]);

  const listReportRows = useMemo(() => {
    return filtered.map((r) => {
      const b = balances.get(r.id);
      return {
        name: r.name,
        partyTypeLabel: counterpartyPartyTypeLabel(r.party_type, r.party_type_label),
        phone: r.phone,
        income: b?.income ?? 0,
        expense: b?.expense ?? 0,
        net: b?.net ?? 0,
      };
    });
  }, [filtered, balances]);

  const listReportTotals = useMemo(() => {
    let grandIncome = 0;
    let grandExpense = 0;
    for (const r of listReportRows) {
      grandIncome += r.income;
      grandExpense += r.expense;
    }
    return { grandIncome, grandExpense };
  }, [listReportRows]);

  const scopeLabelForReport =
    scopeFilter === 'all' ? 'Tüm kayıtlar' : LEDGER_SCOPE_LABELS[scopeFilter];

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
    if (!orgScope || orgScope === 'all' || !projectName.trim()) return;
    setSavingProj(true);
    const { error } = await supabase.from('finance_projects').insert({
      organization_id: orgScope,
      name: projectName.trim(),
    });
    setSavingProj(false);
    if (!error) {
      setProjectName('');
      load();
    }
  };

  const removeFromList = useCallback((row: Row) => {
    confirmDeactivateCounterparty(row.name, async () => {
      const err = await deactivateFinanceCounterparty(row.id, row.organization_id);
      if (err) {
        Alert.alert('Hata', err);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setBalances((prev) => {
        const next = new Map(prev);
        next.delete(row.id);
        return next;
      });
    });
  }, []);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const needOrg = !orgScope;
  const showOrgBadge = orgScope === 'all';

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

        <Text style={styles.title}>Kişi ödemeleri</Text>
        <Text style={styles.subtitle}>
          Usta, tedarikçi veya şahsi kişiler — kime ne ödediğiniz, kimden ne aldığınız. İsme dokunun, tüm hareketleri görün.
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

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopeFilters}>
                  {SCOPE_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.scopeChip, scopeFilter === f.key && styles.scopeChipOn]}
                      onPress={() => setScopeFilter(f.key)}
                    >
                      <Text style={[styles.scopeChipText, scopeFilter === f.key && styles.scopeChipTextOn]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.legend}>
                  <Text style={styles.legendText}>
                    ↑ aldığınız · ↓ ödediğiniz · Dokunun → detay · Uzun basın → listeden kaldır
                  </Text>
                </View>

                {filtered.length > 0 ? (
                  <FinanceReportExportButtons
                    fileName="kisi-odemeleri-liste"
                    mailSubject={`Kişi ödemeleri özeti — ${scopeLabelForReport}`}
                    shareDialogTitle="Kişi ödemeleri özeti"
                    getHtml={(kind) =>
                      buildCounterpartyListReportHtml(
                        {
                          scopeLabel: scopeLabelForReport,
                          rows: listReportRows,
                          grandIncome: listReportTotals.grandIncome,
                          grandExpense: listReportTotals.grandExpense,
                          footer: resolveFinanceReportFooter(
                            footerOptsFromOrganization(organizations.find((o) => o.id === pickerOrgId))
                          ),
                        },
                        kind
                      )
                    }
                  />
                ) : null}

                <View style={styles.sortRow}>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'name' && styles.sortBtnOn]}
                    onPress={() => setSortMode('name')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'name' && styles.sortBtnTextOn]}>A-Z</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sortBtn, sortMode === 'paid_most' && styles.sortBtnOn]}
                    onPress={() => setSortMode('paid_most')}
                  >
                    <Text style={[styles.sortBtnText, sortMode === 'paid_most' && styles.sortBtnTextOn]}>
                      En çok ödenen
                    </Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.addMain}
                  onPress={() =>
                    router.push({
                      pathname: '/admin/accounting/counterparties/new',
                      params: scopeFilter !== 'all' ? { scope: scopeFilter } : {},
                    } as never)
                  }
                  activeOpacity={0.9}
                >
                  <Ionicons name="person-add-outline" size={24} color="#fff" />
                  <Text style={styles.addMainText}>Yeni kişi ekle (usta, tedarikçi…)</Text>
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
                    <Text style={styles.emptyTitle}>Henüz kişi yok</Text>
                    <Text style={styles.emptySub}>Önce kişiyi ekleyin, sonra ödeme veya tahsilat kaydedin.</Text>
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
                        party_type_label={r.party_type_label}
                        phone={r.phone}
                        profileImage={r.profile_image}
                        income={bal?.income ?? 0}
                        expense={bal?.expense ?? 0}
                        net={bal?.net ?? 0}
                        organizationName={
                          showOrgBadge
                            ? organizationNameById(r.organization_id, organizations)
                            : undefined
                        }
                        onPress={() =>
                          router.push({
                            pathname: '/admin/accounting/counterparties/[id]',
                            params: { id: r.id },
                          } as never)
                        }
                        onLongPress={() => removeFromList(r)}
                      />
                    );
                  })
                )}
              </>
            ) : orgScope === 'all' ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>Proje eklemek için üstten tek bir işletme seçin.</Text>
              </View>
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
  scopeFilters: { marginBottom: 12 },
  scopeChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  scopeChipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  scopeChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeChipTextOn: { color: '#fff' },
  sortRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  sortBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  sortBtnOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  sortBtnTextOn: { color: '#fff' },
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
