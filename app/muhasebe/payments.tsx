import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
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
import { supabase } from '@/lib/supabase';

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
  const { width, height } = useWindowDimensions();
  const wide = width >= 960;
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const orgHydrated = useAdminOrgStore((s) => s.orgHydrated);

  const [rows, setRows] = useState<MuhasebeCounterpartyRow[]>([]);
  const [balances, setBalances] = useState<Map<string, MuhasebeBalance>>(new Map());
  const [openDebtTotals, setOpenDebtTotals] = useState<Map<string, CounterpartyOpenDebtTotals>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
    if (!orgHydrated) return;
    if (!orgScope) {
      setRows([]);
      setBalances(new Map());
      setOpenDebtTotals(new Map());
      setLoading(false);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      // Önce kişileri getir — bakiye beklerken arama/liste boş kalmasın
      let q = supabase
        .from('finance_counterparties')
        .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
        .eq('is_active', true)
        .order('name');
      if (orgScope !== 'all') q = q.eq('organization_id', orgScope);
      const { data, error } = await q;
      if (error) throw error;
      const list = ((data as MuhasebeCounterpartyRow[]) ?? []) as MuhasebeCounterpartyRow[];
      setRows(list);
      setSelected((prev) => {
        if (!prev) return null;
        return list.find((r) => r.id === prev.id) ?? null;
      });
      setLoading(false);

      const bundle = await loadMuhasebePersonList({
        orgScope,
        ledgerScopeFilter: scopeFilter,
      });
      setBalances(bundle.balances);
      setOpenDebtTotals(bundle.openDebtTotals);
      if (bundle.rows.length !== list.length) {
        setRows(bundle.rows);
      }
    } catch (err) {
      setLoadError((err as Error)?.message ?? t('muhasebeWebLoadError'));
      setLoading(false);
    }
  }, [orgScope, scopeFilter, orgHydrated, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const afterSaved = async () => {
    if (!orgScope) return;
    try {
      const { balances: b, openDebtTotals: d } = await refreshMuhasebeBalances({
        orgScope,
        organizationIds: rows.map((r) => r.organization_id),
        ledgerScopeFilter: scopeFilter,
        counterpartyIds: rows.map((r) => r.id),
      });
      setBalances(b);
      setOpenDebtTotals(d);
    } catch {
      // liste kalır
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
  const workspaceHeight = Math.max(480, height - 120);

  const selectPerson = (item: MuhasebeCounterpartyRow) => {
    setSelected(item);
  };

  return (
    <MuhasebeWebShell title={t('muhasebeWebNavPayments')} subtitle={t('muhasebeWebPaymentsHint')}>
      {!orgHydrated ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={adminTheme.colors.accent} />
        </View>
      ) : !orgScope ? (
        <View style={styles.hintBox}>
          {canUseAllOrg ? (
            <Ionicons name="business-outline" size={20} color={adminTheme.colors.accent} />
          ) : null}
          <Text style={styles.hintText}>{t('quickPaySelectOrg')}</Text>
        </View>
      ) : (
        <View
          style={[
            styles.workspace,
            wide && styles.workspaceWide,
            Platform.OS === 'web' ? { height: workspaceHeight } : { flex: 1, minHeight: workspaceHeight },
          ]}
        >
          {showList ? (
            <View style={[styles.listPane, wide && styles.listPaneWide]}>
              <View style={styles.listHeader}>
                <View style={styles.searchCard}>
                  <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('quickPaySearchPlaceholder')}
                    placeholderTextColor={adminTheme.colors.textMuted}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />
                  {search ? (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                      <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.filterScroll}
                  contentContainerStyle={styles.filterRow}
                >
                  {TYPE_FILTERS.map((f) => {
                    const on = typeFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        style={[styles.filterChip, on && styles.filterChipOn]}
                        onPress={() => setTypeFilter(f.key)}
                      >
                        <Text style={[styles.filterText, on && styles.filterTextOn]}>{t(f.labelKey)}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.filterChip, debtOnly && styles.filterChipDebt]}
                    onPress={() => setDebtOnly((v) => !v)}
                  >
                    <Text style={[styles.filterText, debtOnly && styles.filterTextOn]}>
                      {t('muhasebeWebDebtOnly')}
                    </Text>
                  </Pressable>
                </ScrollView>

                <View style={styles.scopeRow}>
                  {(['all', 'hotel', 'personal'] as const).map((s) => (
                    <Pressable
                      key={s}
                      style={[styles.scopeChip, scopeFilter === s && styles.scopeChipOn]}
                      onPress={() => setScopeFilter(s)}
                    >
                      <Text style={[styles.scopeText, scopeFilter === s && styles.scopeTextOn]}>
                        {s === 'all'
                          ? t('quickPayScopeAll')
                          : s === 'hotel'
                            ? t('muhasebeWebScopeHotel')
                            : t('muhasebeWebScopePersonal')}
                      </Text>
                    </Pressable>
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
              </View>

              <ScrollView
                style={styles.listScroll}
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
              >
                {loading ? (
                  <ActivityIndicator color={adminTheme.colors.accent} style={{ marginTop: 32 }} />
                ) : loadError ? (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{loadError}</Text>
                    <TouchableOpacity onPress={() => void load()} style={styles.retryBtn}>
                      <Text style={styles.retryText}>{t('muhasebeWebRetry')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : filtered.length === 0 ? (
                  <Text style={styles.empty}>
                    {search || typeFilter !== 'all' || debtOnly
                      ? t('quickPayNoResults')
                      : t('quickPayEmpty')}
                  </Text>
                ) : (
                  filtered.map((item) => {
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
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                          styles.row,
                          active && styles.rowActive,
                          pressed && styles.rowPressed,
                        ]}
                        onPress={() => selectPerson(item)}
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
                            color={active ? adminTheme.colors.accent : adminTheme.colors.textMuted}
                          />
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </View>
          ) : null}

          {showPanel ? (
            <View style={[styles.detailPane, wide && styles.detailPaneWide]}>
              {selected && me?.id ? (
                <MuhasebePersonPayPanel
                  key={selected.id}
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
                  onClearSelection={() => setSelected(null)}
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

const styles = StyleSheet.create({
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
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
  workspace: { gap: 12, width: '100%' },
  workspaceWide: { flexDirection: 'row', alignItems: 'stretch' },
  listPane: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    minWidth: 0,
  },
  listPaneWide: { flexGrow: 0, flexShrink: 0, flexBasis: 420, maxWidth: 460, width: 420 },
  listHeader: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
    flexShrink: 0,
    zIndex: 2,
    backgroundColor: adminTheme.colors.surface,
  },
  detailPane: { flex: 1, minWidth: 0, minHeight: 0 },
  detailPaneWide: { flex: 1 },
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
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
  },
  filterScroll: { marginTop: 10, maxHeight: 40 },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
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
    paddingVertical: 7,
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
    gap: 8,
  },
  statsText: { flex: 1, fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  listScroll: { flex: 1, minHeight: 0 },
  listContent: { padding: 8, paddingBottom: 24 },
  empty: {
    textAlign: 'center',
    color: adminTheme.colors.textMuted,
    marginTop: 40,
    fontSize: 14,
    paddingHorizontal: 16,
  },
  errorBox: { padding: 20, alignItems: 'center', gap: 12 },
  errorText: { color: adminTheme.colors.error, textAlign: 'center', fontSize: 14 },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
  },
  retryText: { color: adminTheme.colors.accent, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 2,
  },
  rowActive: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  rowPressed: { opacity: 0.85, backgroundColor: adminTheme.colors.surfaceTertiary },
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
