import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { BankStatementImportButton } from '@/components/admin/BankStatementImportButton';
import { fetchCounterpartyBalanceMap } from '@/lib/financeCounterpartyBalances';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { LEDGER_SCOPE_LABELS } from '@/lib/financeLedger';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import {
  buildCounterpartyListReportHtml,
  counterpartyPartyTypeLabel,
  resolveFinanceReportFooter,
  type FinanceReportKindFilter,
  FINANCE_REPORT_KIND_LABELS,
} from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import { fetchOpenDebtTotalsByCounterparty } from '@/lib/financeCounterpartyAgreements';
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
import {
  findCounterpartyMergeSuggestions,
  mergeFinanceCounterparties,
  type CounterpartyMergeSuggestion,
} from '@/lib/financeCounterpartyMerge';

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
  const [openDebtTotals, setOpenDebtTotals] = useState<Map<string, number>>(new Map());
  const [rowsLoading, setRowsLoading] = useState(true);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FinanceCounterpartyType>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [flowFilter, setFlowFilter] = useState<FinanceReportKindFilter>('all');
  const [showTools, setShowTools] = useState(false);
  const [dismissedMergeIds, setDismissedMergeIds] = useState<Set<string>>(new Set());
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [mergingAll, setMergingAll] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [savingProj, setSavingProj] = useState(false);

  const canUseAllOrg = accountingCanUseAllOrg(me);
  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );
  const pickerOrgId = orgScope && orgScope !== 'all' ? orgScope : me?.organization_id;
  const balancesLoadGen = useRef(0);

  const loadRows = useCallback(async (): Promise<Row[]> => {
    if (!orgScope) {
      setRows([]);
      setProjects([]);
      setRowsLoading(false);
      return [];
    }
    setRowsLoading(true);
    let cpQ = supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
      .eq('is_active', true)
      .order('name');
    if (orgScope !== 'all') {
      cpQ = cpQ.eq('organization_id', orgScope);
    }
    const cpRes = await cpQ;
    const list = cpRes.error ? [] : ((cpRes.data as Row[]) ?? []);
    setRows(list);
    setRowsLoading(false);
    return list;
  }, [orgScope]);

  const loadProjects = useCallback(async () => {
    if (!orgScope || orgScope === 'all') {
      setProjects([]);
      return;
    }
    const { data } = await supabase
      .from('finance_projects')
      .select('id, name')
      .eq('organization_id', orgScope)
      .eq('is_active', true)
      .order('name');
    setProjects((data as ProjRow[]) ?? []);
  }, [orgScope]);

  const loadBalances = useCallback(async (rowList?: Row[]) => {
    if (!orgScope) {
      setBalances(new Map());
      return;
    }
    const source = rowList ?? rows;
    const gen = ++balancesLoadGen.current;
    setBalancesLoading(true);
    const scope = scopeFilter === 'all' ? null : scopeFilter;
    try {
      let next: Map<string, { income: number; expense: number; net: number }>;
      if (orgScope === 'all') {
        const orgIds = [...new Set(source.map((r) => r.organization_id))];
        if (!orgIds.length) {
          next = new Map();
        } else {
          next = await mergeCounterpartyBalancesForOrgs(orgIds, (oid) =>
            fetchCounterpartyBalanceMap(oid, scope)
          );
        }
      } else {
        next = await fetchCounterpartyBalanceMap(orgScope, scope);
      }
      if (gen !== balancesLoadGen.current) return;
      setBalances(next);
    } finally {
      if (gen === balancesLoadGen.current) setBalancesLoading(false);
    }
  }, [orgScope, scopeFilter, rows]);

  const loadDebtTotals = useCallback(async () => {
    if (!orgScope) {
      setOpenDebtTotals(new Map());
      return;
    }
    const debtOrgScope = orgScope === 'all' ? 'all' : orgScope;
    try {
      setOpenDebtTotals(await fetchOpenDebtTotalsByCounterparty(debtOrgScope));
    } catch {
      setOpenDebtTotals(new Map());
    }
  }, [orgScope]);

  const refreshAll = useCallback(async () => {
    const list = await loadRows();
    await Promise.all([
      list.length ? loadBalances(list) : Promise.resolve(),
      loadDebtTotals(),
    ]);
  }, [loadRows, loadBalances, loadDebtTotals]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (tab === 'projects') void loadProjects();
  }, [tab, loadProjects]);

  useEffect(() => {
    if (!rows.length) {
      setBalances(new Map());
      return;
    }
    void loadBalances();
  }, [loadBalances, rows.length]);

  useEffect(() => {
    if (!rows.length) return;
    const timer = setTimeout(() => {
      void loadDebtTotals();
    }, 600);
    return () => clearTimeout(timer);
  }, [loadDebtTotals, rows.length]);

  const filtered = useMemo(() => {
    let list = rows;
    if (typeFilter !== 'all') list = list.filter((r) => r.party_type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.phone?.includes(q));
    if (flowFilter === 'paid') {
      list = list.filter((r) => (balances.get(r.id)?.expense ?? 0) >= 0.01);
    } else if (flowFilter === 'received') {
      list = list.filter((r) => (balances.get(r.id)?.income ?? 0) >= 0.01);
    }
    if (sortMode === 'paid_most' || flowFilter === 'paid') {
      list = [...list].sort((a, b) => {
        const ea = balances.get(a.id)?.expense ?? 0;
        const eb = balances.get(b.id)?.expense ?? 0;
        if (eb !== ea) return eb - ea;
        return a.name.localeCompare(b.name, 'tr');
      });
    } else if (flowFilter === 'received') {
      list = [...list].sort((a, b) => {
        const ia = balances.get(a.id)?.income ?? 0;
        const ib = balances.get(b.id)?.income ?? 0;
        if (ib !== ia) return ib - ia;
        return a.name.localeCompare(b.name, 'tr');
      });
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }
    return list;
  }, [rows, typeFilter, search, sortMode, balances, flowFilter]);

  const mergeSuggestions = useMemo(() => {
    return findCounterpartyMergeSuggestions(rows, balances).filter((s) => !dismissedMergeIds.has(s.id));
  }, [rows, balances, dismissedMergeIds]);

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
        currentDebt: openDebtTotals.get(r.id) ?? 0,
      };
    });
  }, [filtered, balances, openDebtTotals]);

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
      void loadProjects();
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

  const executeMergeSuggestion = async (suggestion: CounterpartyMergeSuggestion): Promise<string | null> => {
    const err = await mergeFinanceCounterparties({
      keepId: suggestion.keepId,
      mergeIds: suggestion.counterpartyIds,
      canonicalName: suggestion.canonicalName,
      organizationId: suggestion.organizationId,
    });
    if (!err) {
      setDismissedMergeIds((prev) => new Set([...prev, suggestion.id]));
    }
    return err;
  };

  const applyMergeSuggestion = (suggestion: CounterpartyMergeSuggestion) => {
    const mergeIds = suggestion.counterpartyIds.filter((id) => id !== suggestion.keepId);
    Alert.alert(
      'Carileri birleştir',
      `${suggestion.names.join(' · ')}\n\nTek cari: ${suggestion.canonicalName}\n${mergeIds.length} kayıt birleştirilecek; hareketler korunur.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Birleştir',
          onPress: async () => {
            setMergingId(suggestion.id);
            const err = await executeMergeSuggestion(suggestion);
            setMergingId(null);
            if (err) {
              Alert.alert('Hata', err);
              return;
            }
            await refreshAll();
          },
        },
      ]
    );
  };

  const applyAllMergeSuggestions = () => {
    if (!mergeSuggestions.length || mergingAll || mergingId) return;
    const pending = [...mergeSuggestions];
    Alert.alert(
      'Tümünü birleştir',
      `${pending.length} öneri uygulanacak, ${pending.reduce((n, s) => n + s.counterpartyIds.length - 1, 0)} cari kaydı birleştirilecek. Hareketler korunur.`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Tümünü birleştir',
          onPress: async () => {
            setMergingAll(true);
            let lastErr: string | null = null;
            for (const suggestion of pending) {
              setMergingId(suggestion.id);
              const err = await executeMergeSuggestion(suggestion);
              if (err) {
                lastErr = err;
                break;
              }
            }
            setMergingId(null);
            setMergingAll(false);
            await refreshAll();
            if (lastErr) Alert.alert('Hata', lastErr);
          },
        },
      ]
    );
  };

  const dismissMergeSuggestion = (id: string) => {
    setDismissedMergeIds((prev) => new Set([...prev, id]));
  };

  if (rowsLoading && rows.length === 0 && !refreshing) {
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              refreshAll().finally(() => setRefreshing(false));
            }}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe</Text>
        </TouchableOpacity>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleBlock}>
              <Text style={styles.title}>Kişi ödemeleri</Text>
            </View>
            <View style={styles.heroActions}>
              <BankStatementImportButton variant="icon" />
              <TouchableOpacity
                style={styles.heroActionBtn}
                onPress={() =>
                  router.push({
                    pathname: '/admin/accounting/counterparties/new',
                    params: scopeFilter !== 'all' ? { scope: scopeFilter } : {},
                  } as never)
                }
                hitSlop={8}
              >
                <Ionicons name="person-add" size={20} color="#0f766e" />
              </TouchableOpacity>
            </View>
          </View>

          <AdminOrganizationPicker
            compact
            canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
            ownOrganizationId={me?.organization_id}
          />
        </View>

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
                <View style={styles.searchRow}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="İsim veya telefon ara…"
                      placeholderTextColor={adminTheme.colors.textMuted}
                      value={search}
                      onChangeText={setSearch}
                    />
                    {search ? (
                      <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                        <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.toolsToggle, showTools && styles.toolsToggleOn]}
                    onPress={() => setShowTools((v) => !v)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="options-outline" size={18} color={showTools ? '#fff' : '#0f766e'} />
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilters}>
                  {TYPE_FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.typeChip, typeFilter === f.key && styles.typeChipOn]}
                      onPress={() => setTypeFilter(f.key)}
                    >
                      <Text style={[styles.typeChipText, typeFilter === f.key && styles.typeChipTextOn]}>
                        {f.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {showTools ? (
                  <>
                    {rows.length > 0 ? (
                      <View style={styles.statsRow}>
                        <View style={styles.statPill}>
                          <Text style={styles.statNum}>{rows.length}</Text>
                          <Text style={styles.statLbl}>Cari</Text>
                        </View>
                        <View style={[styles.statPill, styles.statPillPos]}>
                          <Text style={[styles.statNum, styles.statNumPos]}>{listStats.withPositive}</Text>
                          <Text style={styles.statLbl}>Alacak</Text>
                        </View>
                        <View style={[styles.statPill, styles.statPillNeg]}>
                          <Text style={[styles.statNum, styles.statNumNeg]}>{listStats.withNegative}</Text>
                          <Text style={styles.statLbl}>Borç</Text>
                        </View>
                        <View style={styles.statPill}>
                          <Text style={styles.statNum}>{filtered.length}</Text>
                          <Text style={styles.statLbl}>Listede</Text>
                        </View>
                      </View>
                    ) : null}

                    <View style={styles.toolbar}>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                        {SCOPE_FILTERS.map((f) => (
                          <TouchableOpacity
                            key={f.key}
                            style={[styles.toolChip, scopeFilter === f.key && styles.toolChipScopeOn]}
                            onPress={() => setScopeFilter(f.key)}
                          >
                            <Text
                              style={[
                                styles.toolChipText,
                                scopeFilter === f.key && styles.toolChipScopeTextOn,
                              ]}
                            >
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>

                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.chipRow}
                      >
                        {(['all', 'paid', 'received'] as const).map((k) => (
                          <TouchableOpacity
                            key={k}
                            style={[styles.toolChip, flowFilter === k && styles.toolChipFlowOn]}
                            onPress={() => setFlowFilter(k)}
                          >
                            <Text
                              style={[
                                styles.toolChipText,
                                flowFilter === k && styles.toolChipFlowTextOn,
                              ]}
                            >
                              {FINANCE_REPORT_KIND_LABELS[k]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                        <View style={styles.chipDivider} />
                        <TouchableOpacity
                          style={[styles.toolChip, sortMode === 'name' && styles.toolChipSortOn]}
                          onPress={() => setSortMode('name')}
                        >
                          <Text style={[styles.toolChipText, sortMode === 'name' && styles.toolChipSortTextOn]}>A-Z</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.toolChip, sortMode === 'paid_most' && styles.toolChipSortOn]}
                          onPress={() => setSortMode('paid_most')}
                        >
                          <Text style={[styles.toolChipText, sortMode === 'paid_most' && styles.toolChipSortTextOn]}>
                            En çok ödenen
                          </Text>
                        </TouchableOpacity>
                      </ScrollView>
                    </View>

                    {filtered.length > 0 ? (
                      <View style={styles.exportSection}>
                        <View style={styles.exportSectionHead}>
                          <Ionicons name="document-text-outline" size={16} color={adminTheme.colors.primary} />
                          <Text style={styles.exportSectionTitle}>Rapor dışa aktar</Text>
                          <Text style={styles.exportSectionHint}>PDF · yazıcı · mail · WhatsApp</Text>
                        </View>
                        <FinanceReportExportButtons
                          compact
                          embedded
                          hideKindChips
                          fileName="kisi-odemeleri-liste"
                          mailSubject={`Kişi ödemeleri özeti — ${scopeLabelForReport}`}
                          shareDialogTitle="Kişi ödemeleri özeti"
                          kindFilter={flowFilter}
                          onKindFilterChange={setFlowFilter}
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
                      </View>
                    ) : null}
                  </>
                ) : null}

                {mergeSuggestions.length > 0 ? (
                  <View style={styles.mergeCard}>
                    <View style={styles.mergeHead}>
                      <View style={styles.mergeHeadLeft}>
                        <Ionicons name="git-merge-outline" size={16} color="#1d4ed8" />
                        <Text style={styles.mergeTitle}>
                          Birleştirme önerileri ({mergeSuggestions.length})
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.mergeAllBtn}
                        onPress={applyAllMergeSuggestions}
                        disabled={mergingAll || !!mergingId}
                        activeOpacity={0.85}
                      >
                        {mergingAll ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="layers-outline" size={14} color="#fff" />
                            <Text style={styles.mergeAllBtnText}>Tümünü birleştir</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                    {mergeSuggestions.slice(0, 3).map((s) => (
                      <View key={s.id} style={styles.mergeRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mergeNames} numberOfLines={1}>
                            {s.names.join(' · ')}
                          </Text>
                          <Text style={styles.mergeMeta}>
                            {s.counterpartyIds.length} cari → {s.canonicalName}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.mergeBtn}
                          onPress={() => applyMergeSuggestion(s)}
                          disabled={mergingId === s.id || mergingAll}
                        >
                          {mergingId === s.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.mergeBtnText}>Birleştir</Text>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.mergeDismiss}
                          onPress={() => dismissMergeSuggestion(s.id)}
                          hitSlop={8}
                          disabled={mergingAll}
                        >
                          <Ionicons name="close" size={16} color={adminTheme.colors.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ))}
                    {mergeSuggestions.length > 3 ? (
                      <Text style={styles.mergeMoreHint}>
                        +{mergeSuggestions.length - 3} öneri daha · “Tümünü birleştir” hepsini uygular
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {filtered.length > 0 ? (
                  <Text style={styles.listHead}>
                    {filtered.length} kişi · uzun basarak listeden kaldırın
                  </Text>
                ) : null}

                {filtered.length === 0 ? (
                  <View style={styles.emptyBox}>
                    <Ionicons name="people-outline" size={40} color={adminTheme.colors.border} />
                    <Text style={styles.emptyTitle}>
                      {rows.length > 0 && flowFilter !== 'all'
                        ? `${FINANCE_REPORT_KIND_LABELS[flowFilter]} kaydı yok`
                        : 'Henüz kişi yok'}
                    </Text>
                    <Text style={styles.emptySub}>
                      {rows.length > 0 && flowFilter !== 'all'
                        ? 'Farklı bir filtre seçin veya yeni işlem ekleyin.'
                        : 'Önce kişiyi ekleyin, sonra ödeme veya tahsilat kaydedin.'}
                    </Text>
                  </View>
                ) : (
                  filtered.map((r) => {
                    const bal = balances.get(r.id);
                    const amountsPending = balancesLoading && !balances.has(r.id);
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
                        amountsPending={amountsPending}
                        openDebt={openDebtTotals.get(r.id) ?? 0}
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
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backHubText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  heroCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroTitleBlock: { flex: 1, minWidth: 0 },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  subtitle: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2, lineHeight: 17 },
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
    padding: 3,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabOn: { backgroundColor: '#0f766e' },
  tabText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  tabTextOn: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  statPill: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statPillPos: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statPillNeg: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statNum: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  statNumPos: { color: '#16a34a' },
  statNumNeg: { color: '#dc2626' },
  statLbl: { fontSize: 9, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 2 },
  toolbar: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
  },
  toolbarBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exportSection: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 10,
  },
  exportSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  exportSectionTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  exportSectionHint: {
    fontSize: 11,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    marginLeft: 'auto' as const,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  chipDivider: { width: 1, height: 20, backgroundColor: adminTheme.colors.border, marginHorizontal: 2 },
  toolChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  toolChipScopeOn: { backgroundColor: '#ede9fe', borderColor: '#a78bfa' },
  toolChipFlowOn: { backgroundColor: '#ecfdf5', borderColor: '#0f766e' },
  toolChipSortOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  toolChipText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted },
  toolChipScopeTextOn: { color: '#6d28d9' },
  toolChipFlowTextOn: { color: '#0f766e' },
  toolChipSortTextOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  searchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, paddingVertical: 9 },
  toolsToggle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolsToggleOn: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  typeFilters: { marginBottom: 8 },
  typeChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  typeChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  typeChipText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  typeChipTextOn: { color: '#fff' },
  listHead: {
    fontSize: 11,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    marginTop: 2,
  },
  mergeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mergeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  mergeHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  mergeTitle: { fontSize: 12, fontWeight: '800', color: '#1d4ed8', flexShrink: 1 },
  mergeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mergeAllBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  mergeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  mergeNames: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  mergeMeta: { fontSize: 10, color: adminTheme.colors.textMuted, marginTop: 1 },
  mergeBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 72,
    alignItems: 'center',
  },
  mergeBtnText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  mergeDismiss: { padding: 2 },
  mergeMoreHint: {
    fontSize: 10,
    fontWeight: '600',
    color: '#3b82f6',
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  emptyBox: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  emptySub: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },
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
