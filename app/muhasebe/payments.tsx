import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { adminTheme } from '@/constants/adminTheme';
import { MuhasebeWebShell } from '@/components/muhasebe/MuhasebeWebShell';
import { MuhasebePersonPayPanel } from '@/components/muhasebe/MuhasebePersonPayPanel';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  accountingCanUseAllOrg,
  organizationNameById,
  resolveAccountingOrgScope,
} from '@/lib/accountingOrgScope';
import {
  loadMuhasebePersonList,
  refreshMuhasebeBalances,
  type MuhasebeBalance,
  type MuhasebeCounterpartyRow,
} from '@/lib/muhasebePersonPayments';
import type { CounterpartyOpenDebtTotals } from '@/lib/financeCounterpartyAgreements';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { fmtMoneyTry } from '@/lib/financeLedger';
import {
  buildSameNameCounts,
  counterpartyInitials,
  normalizeCounterpartyName,
  resolveCounterpartyTypeMeta,
} from '@/lib/financeCounterpartyUi';

const TYPE_FILTERS: { key: 'all' | FinanceCounterpartyType; labelKey: string }[] = [
  { key: 'all', labelKey: 'quickPayScopeAll' },
  { key: 'private_person', labelKey: 'muhasebeWebTypePrivate' },
  { key: 'subcontractor', labelKey: 'muhasebeWebTypeSub' },
  { key: 'supplier', labelKey: 'muhasebeWebTypeSupplier' },
  { key: 'customer', labelKey: 'muhasebeWebTypeCustomer' },
  { key: 'staff', labelKey: 'muhasebeWebTypeStaff' },
  { key: 'other', labelKey: 'muhasebeWebTypeOther' },
];

export default function MuhasebePaymentsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);

  const [rows, setRows] = useState<MuhasebeCounterpartyRow[]>([]);
  const [balances, setBalances] = useState<Map<string, MuhasebeBalance>>(new Map());
  const [openDebtTotals, setOpenDebtTotals] = useState<Map<string, CounterpartyOpenDebtTotals>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FinanceCounterpartyType>('all');
  const [debtOnly, setDebtOnly] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<'all' | FinanceLedgerScope>('all');
  const [selected, setSelected] = useState<MuhasebeCounterpartyRow | null>(null);

  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );
  const canUseAllOrg = accountingCanUseAllOrg(me);

  const load = useCallback(async () => {
    if (!orgScope) {
      setRows([]);
      setBalances(new Map());
      setOpenDebtTotals(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const bundle = await loadMuhasebePersonList({
        orgScope,
        ledgerScopeFilter: scopeFilter,
      });
      setRows(bundle.rows);
      setBalances(bundle.balances);
      setOpenDebtTotals(bundle.openDebtTotals);
      setSelected((prev) => {
        if (!prev) return null;
        return bundle.rows.find((r) => r.id === prev.id) ?? null;
      });
    } finally {
      setLoading(false);
    }
  }, [orgScope, scopeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const afterSaved = async () => {
    if (!orgScope) return;
    const { balances: b, openDebtTotals: d } = await refreshMuhasebeBalances({
      orgScope,
      organizationIds: rows.map((r) => r.organization_id),
      ledgerScopeFilter: scopeFilter,
      counterpartyIds: rows.map((r) => r.id),
    });
    setBalances(b);
    setOpenDebtTotals(d);
    if (selected) {
      const plansBundle = await loadMuhasebePersonList({
        orgScope,
        ledgerScopeFilter: scopeFilter,
      });
      const next = plansBundle.rows.find((r) => r.id === selected.id);
      if (next) setSelected(next);
    }
  };

  const sameNameCounts = useMemo(() => buildSameNameCounts(rows), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.phone != null && r.phone.includes(q)) ||
          (r.party_type_label != null && r.party_type_label.toLowerCase().includes(q))
      );
    }
    if (typeFilter !== 'all') list = list.filter((r) => r.party_type === typeFilter);
    if (debtOnly) list = list.filter((r) => (openDebtTotals.get(r.id)?.remaining ?? 0) >= 0.01);
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [rows, search, typeFilter, debtOnly, openDebtTotals]);

  const listStats = useMemo(() => {
    let debtSum = 0;
    let peopleWithDebt = 0;
    for (const r of filtered) {
      const rem = openDebtTotals.get(r.id)?.remaining ?? 0;
      if (rem >= 0.01) {
        debtSum += rem;
        peopleWithDebt += 1;
      }
    }
    return { total: filtered.length, debtSum, peopleWithDebt };
  }, [filtered, openDebtTotals]);

  const showList = wide || !selected;
  const showPanel = wide || !!selected;

  return (
    <MuhasebeWebShell title={t('muhasebeWebNavPayments')} subtitle={t('muhasebeWebPaymentsHint')}>
      {!orgScope ? (
        <View style={styles.hintBox}>
          <AdminOrgHint canUseAll={canUseAllOrg} />
          <Text style={styles.hintText}>{t('quickPaySelectOrg')}</Text>
        </View>
      ) : (
        <View style={[styles.workspace, wide && styles.workspaceWide]}>
          {showList ? (
            <View style={[styles.listPane, wide && styles.listPaneWide]}>
              <View style={styles.searchCard}>
                <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
                <TextInput
                  style={styles.searchInput}
                  value={search}
                  onChangeText={setSearch}
                  placeholder={t('quickPaySearchPlaceholder')}
                  placeholderTextColor={adminTheme.colors.textMuted}
                />
                {search ? (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.filterRow}>
                {TYPE_FILTERS.map((f) => {
                  const on = typeFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      style={[styles.filterChip, on && styles.filterChipOn]}
                      onPress={() => setTypeFilter(f.key)}
                    >
                      <Text style={[styles.filterText, on && styles.filterTextOn]}>{t(f.labelKey)}</Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.filterChip, debtOnly && styles.filterChipDebt]}
                  onPress={() => setDebtOnly((v) => !v)}
                >
                  <Text style={[styles.filterText, debtOnly && styles.filterTextOn]}>
                    {t('muhasebeWebDebtOnly')}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.scopeRow}>
                {(['all', 'hotel', 'personal'] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.scopeChip, scopeFilter === s && styles.scopeChipOn]}
                    onPress={() => setScopeFilter(s)}
                  >
                    <Text style={[styles.scopeText, scopeFilter === s && styles.scopeTextOn]}>
                      {s === 'all' ? t('quickPayScopeAll') : s === 'hotel' ? t('muhasebeWebScopeHotel') : t('muhasebeWebScopePersonal')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statsText}>
                  {t('muhasebeWebListStats', {
                    count: listStats.total,
                    debtPeople: listStats.peopleWithDebt,
                    debtSum: fmtMoneyTry(listStats.debtSum),
                  })}
                </Text>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => router.push('/admin/accounting/counterparties/new' as never)}
                >
                  <Ionicons name="person-add-outline" size={16} color={adminTheme.colors.accent} />
                  <Text style={styles.addBtnText}>{t('quickPayAddPerson')}</Text>
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator color={adminTheme.colors.accent} style={{ marginTop: 40 }} />
              ) : (
                <FlatList
                  data={filtered}
                  keyExtractor={(item) => item.id}
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
                  }
                  ListEmptyComponent={
                    <Text style={styles.empty}>{t('quickPayEmpty')}</Text>
                  }
                  renderItem={({ item }) => {
                    const bal = balances.get(item.id);
                    const debt = openDebtTotals.get(item.id)?.remaining ?? 0;
                    const meta = resolveCounterpartyTypeMeta(item.party_type, item.party_type_label);
                    const active = selected?.id === item.id;
                    const orgName =
                      orgScope === 'all'
                        ? organizationNameById(item.organization_id, organizations)
                        : null;
                    const dupe = sameNameCounts.get(normalizeCounterpartyName(item.name)) ?? 0;
                    return (
                      <TouchableOpacity
                        style={[styles.row, active && styles.rowActive]}
                        onPress={() => setSelected(item)}
                        activeOpacity={0.88}
                      >
                        <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.avatarText, { color: meta.color }]}>
                            {counterpartyInitials(item.name)}
                          </Text>
                        </View>
                        <View style={styles.rowBody}>
                          <Text style={styles.rowName} numberOfLines={1}>
                            {item.name}
                            {dupe >= 2 ? ` · ${dupe}` : ''}
                          </Text>
                          <Text style={styles.rowMeta} numberOfLines={1}>
                            {meta.label}
                            {orgName ? ` · ${orgName}` : ''}
                          </Text>
                        </View>
                        <View style={styles.rowAmounts}>
                          {debt >= 0.01 ? (
                            <Text style={styles.debtAmt}>{fmtMoneyTry(debt)}</Text>
                          ) : (
                            <Text style={styles.netAmt}>{fmtMoneyTry(bal?.net ?? 0)}</Text>
                          )}
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={adminTheme.colors.textMuted}
                          />
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          ) : null}

          {showPanel ? (
            <View style={[styles.detailPane, wide && styles.detailPaneWide]}>
              {selected && me?.id ? (
                <MuhasebePersonPayPanel
                  person={selected}
                  staffId={me.id}
                  balanceNet={balances.get(selected.id)?.net ?? 0}
                  openDebt={openDebtTotals.get(selected.id)?.remaining ?? 0}
                  onSaved={() => void afterSaved()}
                  onOpenDetail={() =>
                    router.push({
                      pathname: '/admin/accounting/counterparties/[id]',
                      params: { id: selected.id },
                    } as never)
                  }
                  onClearSelection={wide ? undefined : () => setSelected(null)}
                />
              ) : (
                <View style={styles.emptyPanel}>
                  <Ionicons name="hand-left-outline" size={36} color={adminTheme.colors.textMuted} />
                  <Text style={styles.emptyPanelTitle}>{t('muhasebeWebPickPerson')}</Text>
                  <Text style={styles.emptyPanelSub}>{t('muhasebeWebPaymentsHint')}</Text>
                </View>
              )}
            </View>
          ) : null}
        </View>
      )}
    </MuhasebeWebShell>
  );
}

function AdminOrgHint({ canUseAll }: { canUseAll: boolean }) {
  if (!canUseAll) return null;
  return <Ionicons name="business-outline" size={20} color={adminTheme.colors.accent} />;
}

const styles = StyleSheet.create({
  hintBox: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
    alignItems: 'flex-start',
  },
  hintText: { fontSize: 14, color: adminTheme.colors.textSecondary, lineHeight: 20 },
  workspace: { flex: 1, gap: 12, minHeight: 560 },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  listPane: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
    minHeight: 420,
  },
  listPaneWide: { flex: 0.42, maxWidth: 480 },
  detailPane: { flex: 1, minHeight: 480 },
  detailPaneWide: { flex: 0.58 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  filterChipOn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  filterChipDebt: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fca5a5' },
  filterText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary },
  filterTextOn: { color: adminTheme.colors.text },
  scopeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  scopeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  scopeChipOn: { backgroundColor: adminTheme.colors.primary },
  scopeText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary },
  scopeTextOn: { color: '#fff' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 6,
    gap: 8,
  },
  statsText: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  empty: {
    textAlign: 'center',
    color: adminTheme.colors.textMuted,
    marginTop: 40,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 2,
  },
  rowActive: { backgroundColor: '#fff7ed' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '800' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  rowMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  rowAmounts: { alignItems: 'flex-end', flexDirection: 'row', gap: 4 },
  debtAmt: { fontSize: 13, fontWeight: '800', color: '#b91c1c' },
  netAmt: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  emptyPanel: {
    flex: 1,
    minHeight: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyPanelTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text, marginTop: 8 },
  emptyPanelSub: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
