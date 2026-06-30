import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { loadMovementCategories, insertMovementCategory } from '@/lib/financeCategoriesApi';
import { useRouter } from 'expo-router';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { CounterpartyListCard } from '@/components/admin/CounterpartyListCard';
import { BankStatementImportButton } from '@/components/admin/BankStatementImportButton';
import {
  fetchCounterpartyBalanceMap,
  invalidateCounterpartyBalanceCache,
} from '@/lib/financeCounterpartyBalances';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { fmtMoneyTry, LEDGER_SCOPE_LABELS } from '@/lib/financeLedger';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import {
  buildCounterpartyListReportHtml,
  counterpartyPartyTypeLabel,
  resolveFinanceReportFooter,
  type FinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import {
  accountingCanUseAllOrg,
  mergeCounterpartyBalancesForOrgs,
  organizationNameById,
  resolveAccountingOrgScope,
} from '@/lib/accountingOrgScope';
import {
  confirmBulkDeactivateCounterparties,
  bulkDeactivateFinanceCounterparties,
} from '@/lib/financeCounterpartyActions';
import {
  counterpartyInitials,
  formatCounterpartyBalance,
  resolveCounterpartyTypeMeta,
} from '@/lib/financeCounterpartyUi';
import {
  fetchOpenCounterpartyAgreements,
  fetchOpenDebtTotalsByCounterparty,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000] as const;
const HERO_GRAD = ['#0f172a', '#1e3a5f'] as const;
const PAY_GRAD = ['#dc2626', '#b91c1c'] as const;
const FAB_GRAD = ['#d97706', '#b45309'] as const;
const PAY_SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.92);

type Row = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  profile_image: string | null;
};

export default function AccountingQuickPayScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const organizations = useAdminOrgStore((s) => s.organizations);
  const [rows, setRows] = useState<Row[]>([]);
  const [balances, setBalances] = useState<Map<string, { income: number; expense: number; net: number }>>(
    new Map()
  );
  const [openDebtTotals, setOpenDebtTotals] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | FinanceLedgerScope>('all');
  const [selected, setSelected] = useState<Row | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>('hotel');
  const [category, setCategory] = useState('other');
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [openAgreements, setOpenAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const listRef = useRef<FlatList<Row>>(null);
  const paySheetScrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();

  const canUseAllOrg = accountingCanUseAllOrg(me);
  const orgScope = useMemo(
    () => resolveAccountingOrgScope(me, selectedOrganizationId),
    [me, selectedOrganizationId]
  );
  const pickerOrgId = orgScope && orgScope !== 'all' ? orgScope : me?.organization_id;

  const load = useCallback(async () => {
    if (!orgScope) {
      setRows([]);
      setBalances(new Map());
      setOpenDebtTotals(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    let q = supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, party_type_label, phone, profile_image')
      .eq('is_active', true)
      .order('name');
    if (orgScope !== 'all') q = q.eq('organization_id', orgScope);
    const { data } = await q;
    const list = (data as Row[]) ?? [];
    setRows(list);
    const scope = scopeFilter === 'all' ? null : scopeFilter;
    const debtOrgScope = orgScope === 'all' ? 'all' : orgScope;
    void fetchOpenDebtTotalsByCounterparty(debtOrgScope, list.map((r) => r.id))
      .then(setOpenDebtTotals)
      .catch(() => setOpenDebtTotals(new Map()));
    if (orgScope === 'all') {
      setBalances(
        await mergeCounterpartyBalancesForOrgs(
          list.map((r) => r.organization_id),
          (oid) => fetchCounterpartyBalanceMap(oid, scope)
        )
      );
    } else {
      setBalances(await fetchCounterpartyBalanceMap(orgScope, scope));
    }
    setLoading(false);
  }, [orgScope, scopeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadCategoriesForOrg = useCallback(async (organizationId: string) => {
    const opts = await loadMovementCategories(organizationId, 'expense');
    setCategoryOptions(opts);
    setCategory(opts[0]?.code ?? 'other');
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows;
    if (q) list = list.filter((r) => r.name.toLowerCase().includes(q) || r.phone?.includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [rows, search]);

  const openPay = (row: Row) => {
    setSelected(row);
    setAmount('');
    setNote('');
    setLedgerScope(row.party_type === 'private_person' ? 'personal' : 'hotel');
    setShowNewCategory(false);
    setNewCategoryName('');
    setLastSaved(null);
    setOpenAgreements([]);
    setSelectedAgreementId(null);
    void loadCategoriesForOrg(row.organization_id);
    setLoadingAgreements(true);
    void fetchOpenCounterpartyAgreements(row.id)
      .then((plans) => {
        setOpenAgreements(plans);
        if (plans.length === 1) {
          setSelectedAgreementId(plans[0].id);
          if (plans[0].amount_remaining > 0) {
            setAmount(String(plans[0].amount_remaining));
          }
        }
      })
      .catch(() => setOpenAgreements([]))
      .finally(() => setLoadingAgreements(false));
  };

  const closePay = () => {
    setSelected(null);
    setAmount('');
    setNote('');
    setShowNewCategory(false);
    setNewCategoryName('');
    setOpenAgreements([]);
    setSelectedAgreementId(null);
  };

  const addNewCategory = async () => {
    if (!selected?.organization_id) return;
    setAddingCategory(true);
    const res = await insertMovementCategory(selected.organization_id, {
      name: newCategoryName,
      appliesTo: 'expense',
    });
    setAddingCategory(false);
    if ('error' in res) {
      Alert.alert('Hata', res.error);
      return;
    }
    await loadCategoriesForOrg(selected.organization_id);
    setCategory(res.code);
    setNewCategoryName('');
    setShowNewCategory(false);
  };

  const savePayment = async () => {
    if (!selected?.organization_id || !me?.id) return;
    const a = parseFloat(amount.replace(',', '.'));
    if (!a || a <= 0) {
      Alert.alert(t('quickPayAmountRequired'));
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('finance_movements').insert({
      organization_id: selected.organization_id,
      kind: 'expense',
      amount: a,
      currency: 'TRY',
      movement_date: today,
      payment_method: 'cash',
      category,
      counterparty_id: selected.id,
      description: note.trim() || t('quickPayDefaultNote'),
      ledger_scope: ledgerScope,
      agreement_id: selectedAgreementId,
      created_by_staff_id: me.id,
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('quickPaySaveError'), error.message);
      return;
    }
    invalidateCounterpartyBalanceCache(selected.organization_id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setLastSaved(`${selected.name}: ${fmtMoneyTry(a)}`);
    setAmount('');
    setNote('');
    const scope = scopeFilter === 'all' ? null : scopeFilter;
    if (orgScope === 'all') {
      setBalances(
        await mergeCounterpartyBalancesForOrgs(
          rows.map((r) => r.organization_id),
          (oid) => fetchCounterpartyBalanceMap(oid, scope)
        )
      );
    } else {
      setBalances(await fetchCounterpartyBalanceMap(selected.organization_id, scope));
    }
  };

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
    scopeFilter === 'all' ? t('quickPayScopeAll') : LEDGER_SCOPE_LABELS[scopeFilter];

  const listStats = useMemo(() => {
    let totalExpense = 0;
    for (const r of filtered) totalExpense += balances.get(r.id)?.expense ?? 0;
    return { totalPeople: filtered.length, totalExpense };
  }, [filtered, balances]);

  const selectedBalance = useMemo(() => {
    if (!selected) return null;
    return balances.get(selected.id) ?? null;
  }, [selected, balances]);

  const reportFooter = useMemo(
    () =>
      resolveFinanceReportFooter(
        footerOptsFromOrganization(organizations.find((o) => o.id === pickerOrgId))
      ),
    [organizations, pickerOrgId]
  );

  const needOrg = !orgScope;

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(filtered.map((r) => r.id)));
  }, [filtered]);

  const enterSelectionWith = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const bulkRemoveSelected = useCallback(() => {
    if (selectedIds.size === 0 || bulkActing) return;
    const targets = filtered.filter((r) => selectedIds.has(r.id));
    confirmBulkDeactivateCounterparties(targets.length, async () => {
      setBulkActing(true);
      const res = await bulkDeactivateFinanceCounterparties(targets);
      setBulkActing(false);
      if (res.ok > 0) {
        const removed = new Set(targets.map((r) => r.id));
        if (selected && removed.has(selected.id)) closePay();
        setRows((prev) => prev.filter((r) => !removed.has(r.id)));
        setBalances((prev) => {
          const next = new Map(prev);
          for (const id of removed) next.delete(id);
          return next;
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      exitSelectionMode();
      if (res.failed > 0) {
        Alert.alert(
          t('quickPaySaveError'),
          t('quickPayBulkRemoveFailed', { count: res.failed, error: res.lastError ?? '' })
        );
      }
    });
  }, [bulkActing, exitSelectionMode, filtered, selected, selectedIds.size, t]);

  const renderItem = ({ item }: { item: Row }) => {
    const bal = balances.get(item.id);
    return (
      <CounterpartyListCard
        id={item.id}
        name={item.name}
        party_type={item.party_type}
        party_type_label={item.party_type_label}
        organizationName={
          orgScope === 'all'
            ? organizationNameById(item.organization_id, organizations)
            : undefined
        }
        phone={item.phone}
        profileImage={item.profile_image}
        income={bal?.income ?? 0}
        expense={bal?.expense ?? 0}
        net={bal?.net ?? 0}
        openDebt={openDebtTotals.get(item.id) ?? 0}
        selectionMode={selectionMode}
        selected={selectedIds.has(item.id)}
        onPress={() => {
          if (selectionMode) {
            toggleSelect(item.id);
            return;
          }
          openPay(item);
        }}
        onLongPress={() => {
          if (selectionMode) toggleSelect(item.id);
          else enterSelectionWith(item.id);
        }}
        dense
      />
    );
  };

  const appendQuickAmount = (value: number) => {
    const cur = parseFloat(amount.replace(',', '.')) || 0;
    setAmount(String(cur + value));
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[...HERO_GRAD]} style={[styles.heroBar, { paddingTop: insets.top + 8 }]}>
        <AdminStackBackButton tintColor="#fff" fallback="/staff/(tabs)/profile" />
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            {t('profileUiPersonPaymentsQuick')}
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            {t('quickPaySubtitle')}
          </Text>
        </View>
        <View style={styles.topActions}>
          <BankStatementImportButton variant="hero" />
          {!selectionMode ? (
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={() => setSelectionMode(true)}
              accessibilityLabel={t('quickPayBulkRemoveMode')}
            >
              <Ionicons name="checkbox-outline" size={22} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.heroIconBtn}
              onPress={exitSelectionMode}
              accessibilityLabel={t('cancel')}
            >
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/accounting/counterparties/new' as never)}
            accessibilityLabel={t('quickPayAddPerson')}
          >
            <Ionicons name="person-add-outline" size={22} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.heroIconBtn}
            onPress={() => router.push('/admin/accounting/counterparties')}
            accessibilityLabel={t('quickPayFullList')}
          >
            <Ionicons name="list-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {needOrg ? (
        <View style={styles.needOrgWrap}>
          <AdminOrganizationPicker
            canUseAll={canUseAllOrg}
            ownOrganizationId={me?.organization_id}
          />
          <View style={styles.hintBox}>
            <Text style={styles.hintText}>{t('quickPaySelectOrg')}</Text>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.listArea}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 52 : 0}
        >
          <View style={styles.searchCard}>
            <Ionicons name="search" size={18} color={adminTheme.colors.accent} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('quickPaySearchPlaceholder')}
              placeholderTextColor={adminTheme.colors.textMuted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              onFocus={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} style={styles.searchClear}>
                <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <FlatList
            ref={listRef}
            style={styles.list}
            data={loading && !refreshing ? [] : filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListHeaderComponent={
              <QuickPayListHeader
                canUseAllOrg={canUseAllOrg}
                ownOrganizationId={me?.organization_id}
                lastSaved={lastSaved}
                scopeFilter={scopeFilter}
                onScopeFilter={setScopeFilter}
                showExport={filtered.length > 0}
                scopeLabelForReport={scopeLabelForReport}
                listReportRows={listReportRows}
                listReportTotals={listReportTotals}
                reportFooter={reportFooter}
                loading={loading && !refreshing}
                listStats={listStats}
                searchActive={search.trim().length > 0}
                selectionMode={selectionMode}
                selectedCount={selectedIds.size}
                visibleCount={filtered.length}
                onSelectAll={selectAllVisible}
                onClearSelection={() => setSelectedIds(new Set())}
                onBulkRemove={bulkRemoveSelected}
                bulkActing={bulkActing}
              />
            }
            contentContainerStyle={[
              styles.listContent,
              selectionMode && { paddingBottom: 120 + Math.max(insets.bottom, 10) },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load().finally(() => setRefreshing(false));
              }}
            />
          }
          ListEmptyComponent={
            loading && !refreshing ? null : (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="wallet-outline" size={36} color={adminTheme.colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>{t('quickPayEmpty')}</Text>
                <Text style={styles.emptySub}>{t('quickPaySubtitle')}</Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push('/admin/accounting/counterparties/new' as never)}
                  activeOpacity={0.9}
                >
                  <Ionicons name="person-add" size={18} color="#fff" />
                  <Text style={styles.emptyBtnText}>{t('quickPayAddPerson')}</Text>
                </TouchableOpacity>
              </View>
            )
          }
          />
        </KeyboardAvoidingView>
      )}

      {!needOrg && !selectionMode ? (
        <View style={[styles.fabWrap, { paddingBottom: Math.max(insets.bottom, 10) }]} pointerEvents="box-none">
          <TouchableOpacity
            onPress={() => router.push('/admin/accounting/counterparties/new' as never)}
            activeOpacity={0.88}
            accessibilityLabel={t('quickPayAddPerson')}
          >
            <LinearGradient colors={[...FAB_GRAD]} style={styles.fab}>
              <Ionicons name="add" size={26} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      {selectionMode && !needOrg ? (
        <View style={[styles.bulkFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <TouchableOpacity
            style={[
              styles.bulkRemoveBtn,
              (selectedIds.size === 0 || bulkActing) && styles.bulkRemoveBtnDisabled,
            ]}
            onPress={bulkRemoveSelected}
            disabled={selectedIds.size === 0 || bulkActing}
            activeOpacity={0.9}
          >
            {bulkActing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color="#fff" />
                <Text style={styles.bulkRemoveBtnText}>
                  {t('quickPayBulkRemoveSelected', { count: selectedIds.size })}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closePay}>
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlayDismiss} onPress={closePay} accessibilityLabel="Kapat" />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKb}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
          >
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              {selected ? (
                <>
                  <View style={styles.sheetHandle} />
                  <View style={styles.sheetHeaderRow}>
                    <Text style={styles.sheetTitle}>{t('quickPaySheetHint')}</Text>
                    <TouchableOpacity onPress={closePay} hitSlop={10} style={styles.sheetCloseBtn}>
                      <Ionicons name="close" size={22} color={adminTheme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {(() => {
                    const meta = resolveCounterpartyTypeMeta(
                      selected.party_type,
                      selected.party_type_label
                    );
                    const bal = selectedBalance ? formatCounterpartyBalance(selectedBalance.net) : null;
                    const orgName = organizationNameById(selected.organization_id, organizations);
                    return (
                      <View style={styles.personHero}>
                        <View style={[styles.personAvatar, { backgroundColor: meta.bg }]}>
                          <Text style={[styles.personAvatarText, { color: meta.color }]}>
                            {counterpartyInitials(selected.name)}
                          </Text>
                        </View>
                        <View style={styles.personHeroBody}>
                          <Text style={styles.personName} numberOfLines={2}>
                            {selected.name}
                          </Text>
                          <View style={styles.personMetaRow}>
                            <View style={[styles.personTypePill, { backgroundColor: meta.bg }]}>
                              <Ionicons name={meta.icon} size={12} color={meta.color} />
                              <Text style={[styles.personTypeText, { color: meta.color }]}>{meta.label}</Text>
                            </View>
                            {orgName ? (
                              <View style={styles.personOrgPill}>
                                <Ionicons name="business" size={10} color="#1d4ed8" />
                                <Text style={styles.personOrgText} numberOfLines={1}>
                                  {orgName}
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          {bal && bal.tone !== 'zero' ? (
                            <Text
                              style={[
                                styles.personBalance,
                                bal.tone === 'positive' && styles.personBalancePos,
                                bal.tone === 'negative' && styles.personBalanceNeg,
                              ]}
                            >
                              {bal.text}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })()}

                  <ScrollView
                    ref={paySheetScrollRef}
                    style={styles.sheetScroll}
                    contentContainerStyle={styles.sheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    automaticallyAdjustKeyboardInsets
                    showsVerticalScrollIndicator
                    nestedScrollEnabled
                  >
                    <LinearGradient colors={['#fff7ed', '#ffffff']} style={styles.amountHero}>
                      <Text style={styles.amountLbl}>{t('quickPayAmountLabel')}</Text>
                      <View style={styles.amountRow}>
                        <Text style={styles.amountCurrency}>₺</Text>
                        <TextInput
                          style={styles.amountInput}
                          value={amount}
                          onChangeText={setAmount}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor="#cbd5e1"
                          autoFocus
                        />
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.quickAmtScroll}
                        keyboardShouldPersistTaps="handled"
                      >
                        {QUICK_AMOUNTS.map((v) => (
                          <TouchableOpacity
                            key={v}
                            style={styles.quickAmtChip}
                            onPress={() => appendQuickAmount(v)}
                            activeOpacity={0.85}
                          >
                            <Text style={styles.quickAmtText}>+{v.toLocaleString('tr-TR')}</Text>
                          </TouchableOpacity>
                        ))}
                        {amount ? (
                          <TouchableOpacity
                            style={styles.quickAmtClear}
                            onPress={() => setAmount('')}
                            activeOpacity={0.85}
                          >
                            <Ionicons name="refresh" size={14} color={adminTheme.colors.textMuted} />
                            <Text style={styles.quickAmtClearText}>Sıfırla</Text>
                          </TouchableOpacity>
                        ) : null}
                      </ScrollView>
                    </LinearGradient>

                    {loadingAgreements ? (
                      <View style={styles.planLoading}>
                        <ActivityIndicator size="small" color="#7c3aed" />
                      </View>
                    ) : openAgreements.length > 0 ? (
                      <View style={styles.sheetSection}>
                        <Text style={styles.sectionLbl}>{t('quickPayPlanLabel')}</Text>
                        <Text style={styles.planHint}>{t('quickPayPlanHint')}</Text>
                        <TouchableOpacity
                          style={[styles.planChip, !selectedAgreementId && styles.planChipOn]}
                          onPress={() => setSelectedAgreementId(null)}
                          activeOpacity={0.85}
                        >
                          <Text style={[styles.planChipText, !selectedAgreementId && styles.planChipTextOn]}>
                            {t('quickPayPlanNone')}
                          </Text>
                        </TouchableOpacity>
                        {openAgreements.map((plan) => {
                          const active = selectedAgreementId === plan.id;
                          return (
                            <TouchableOpacity
                              key={plan.id}
                              style={[styles.planRow, active && styles.planRowOn]}
                              onPress={() => {
                                setSelectedAgreementId(plan.id);
                                if (plan.amount_remaining > 0 && !amount.trim()) {
                                  setAmount(String(plan.amount_remaining));
                                }
                              }}
                              activeOpacity={0.85}
                            >
                              <View style={styles.planRowBody}>
                                <Text style={[styles.planRowTitle, active && styles.planRowTitleOn]} numberOfLines={1}>
                                  {plan.title}
                                </Text>
                                <Text style={styles.planRowMeta}>
                                  {t('quickPayPlanRemaining', { amount: fmtMoneyTry(plan.amount_remaining) })}
                                </Text>
                              </View>
                              {active ? (
                                <Ionicons name="checkmark-circle" size={20} color="#7c3aed" />
                              ) : (
                                <Ionicons name="ellipse-outline" size={20} color={adminTheme.colors.textMuted} />
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}

                    <View style={styles.sheetSection}>
                      <Text style={styles.sectionLbl}>{t('quickPayScopeLabel')}</Text>
                      <View style={styles.segmented}>
                        {(['hotel', 'personal'] as FinanceLedgerScope[]).map((s) => (
                          <TouchableOpacity
                            key={s}
                            style={[styles.segment, ledgerScope === s && styles.segmentOn]}
                            onPress={() => setLedgerScope(s)}
                            activeOpacity={0.88}
                          >
                            <Ionicons
                              name={s === 'hotel' ? 'business-outline' : 'person-outline'}
                              size={15}
                              color={ledgerScope === s ? '#fff' : adminTheme.colors.textMuted}
                            />
                            <Text style={[styles.segmentText, ledgerScope === s && styles.segmentTextOn]}>
                              {LEDGER_SCOPE_LABELS[s]}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.sheetSection}>
                      <View style={styles.catHeadRow}>
                        <Text style={styles.sectionLbl}>{t('quickPayCategoryLabel')}</Text>
                        <View style={styles.catHeadActions}>
                          <TouchableOpacity onPress={() => setShowNewCategory((v) => !v)} hitSlop={8}>
                            <Ionicons
                              name={showNewCategory ? 'remove-circle-outline' : 'add-circle-outline'}
                              size={20}
                              color={adminTheme.colors.accent}
                            />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => router.push('/admin/accounting/categories' as never)}
                            hitSlop={8}
                          >
                            <Ionicons name="settings-outline" size={20} color={adminTheme.colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.catScroll}
                        keyboardShouldPersistTaps="handled"
                      >
                        {categoryOptions.map((c) => (
                          <TouchableOpacity
                            key={c.code}
                            style={[styles.catChip, category === c.code && styles.catChipOn]}
                            onPress={() => setCategory(c.code)}
                          >
                            <Text style={[styles.catChipText, category === c.code && styles.catChipTextOn]}>
                              {c.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                      {showNewCategory ? (
                        <View style={styles.addCatRow}>
                          <TextInput
                            style={styles.addCatInput}
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            placeholder={t('quickPayCategoryNamePlaceholder')}
                            placeholderTextColor={adminTheme.colors.textMuted}
                          />
                          <TouchableOpacity
                            style={styles.addCatBtn}
                            onPress={addNewCategory}
                            disabled={addingCategory || !newCategoryName.trim()}
                          >
                            {addingCategory ? (
                              <ActivityIndicator size="small" color="#fff" />
                            ) : (
                              <Ionicons name="checkmark" size={20} color="#fff" />
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.sheetSection}>
                      <Text style={styles.sectionLbl}>{t('quickPayNoteLabel')}</Text>
                      <TextInput
                        style={styles.noteInput}
                        value={note}
                        onChangeText={setNote}
                        placeholder={t('quickPayNotePlaceholder')}
                        placeholderTextColor={adminTheme.colors.textMuted}
                        multiline
                        onFocus={() => {
                          setTimeout(() => paySheetScrollRef.current?.scrollToEnd({ animated: true }), 120);
                        }}
                      />
                    </View>

                    <TouchableOpacity
                      style={styles.detailLink}
                      onPress={() => {
                        closePay();
                        router.push({
                          pathname: '/admin/accounting/counterparties/[id]',
                          params: { id: selected.id },
                        } as never);
                      }}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="person-circle-outline" size={26} color="#7c3aed" />
                      <View style={styles.detailLinkBody}>
                        <Text style={styles.detailLinkTitle}>{t('quickPayViewDetail')}</Text>
                        <Text style={styles.detailLinkSub}>{t('quickPayViewDetailSub')}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#a78bfa" />
                    </TouchableOpacity>
                  </ScrollView>

                  <View style={styles.sheetFooter}>
                    <TouchableOpacity
                      onPress={savePayment}
                      disabled={saving}
                      activeOpacity={0.9}
                    >
                      <LinearGradient colors={[...PAY_GRAD]} style={styles.saveBtn}>
                        {saving ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <>
                            <Ionicons name="flash" size={20} color="#fff" />
                            <Text style={styles.saveBtnText}>{t('quickPaySaveNext')}</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingBottom: 10,
  },
  heroIconBtn: { padding: 8 },
  heroTitleWrap: { flex: 1, marginHorizontal: 4 },
  heroTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center' },
  listArea: { flex: 1 },
  list: { flex: 1 },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
    zIndex: 2,
  },
  searchClear: { padding: 4 },
  listHeader: { paddingTop: 2, marginBottom: 4 },
  orgCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  listLoader: { marginVertical: 12 },
  needOrgWrap: { flex: 1, paddingTop: 8 },
  hintBox: {
    margin: 16,
    padding: 16,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  hintText: { textAlign: 'center', color: adminTheme.colors.textMuted },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  savedBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#166534', lineHeight: 17 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  statPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statPillExpense: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  statPillNum: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  statPillNumExpense: { color: '#dc2626', flexShrink: 1 },
  statPillLbl: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  scopeSegmented: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  scopeSegment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  scopeSegmentOn: {
    backgroundColor: adminTheme.colors.surface,
    ...adminTheme.shadow.sm,
  },
  scopeSegmentText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeSegmentTextOn: { color: adminTheme.colors.text, fontWeight: '800' },
  listHint: {
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  bulkToolRow: {
    marginBottom: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 8,
  },
  bulkToolMeta: { fontSize: 12, fontWeight: '700', color: '#991b1b' },
  bulkToolActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  bulkToolChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  bulkToolChipText: { fontSize: 12, fontWeight: '700', color: '#991b1b' },
  bulkToolChipDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  bulkToolChipDangerText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  bulkToolChipDisabled: { opacity: 0.45 },
  bulkFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: adminTheme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
  },
  bulkRemoveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    minHeight: 48,
  },
  bulkRemoveBtnDisabled: { opacity: 0.45 },
  bulkRemoveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  reportSection: { marginBottom: 6 },
  reportToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  reportToggleText: { flex: 1, fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10, color: adminTheme.colors.text },
  listContent: { paddingHorizontal: 16, paddingBottom: 96 },
  fabWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'flex-end',
    paddingTop: 6,
    paddingRight: 18,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...adminTheme.shadow.lg,
  },
  emptyCard: {
    alignItems: 'center',
    marginTop: 24,
    padding: 24,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, textAlign: 'center' },
  emptySub: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
    backgroundColor: adminTheme.colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalOverlayDismiss: { ...StyleSheet.absoluteFillObject },
  modalKb: { width: '100%', maxHeight: PAY_SHEET_HEIGHT },
  sheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    height: PAY_SHEET_HEIGHT,
    maxHeight: PAY_SHEET_HEIGHT,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sheetTitle: { flex: 1, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  sheetCloseBtn: { padding: 4 },
  personHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  personAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personAvatarText: { fontSize: 18, fontWeight: '800' },
  personHeroBody: { flex: 1, minWidth: 0 },
  personName: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  personMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  personTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  personTypeText: { fontSize: 11, fontWeight: '700' },
  personOrgPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    maxWidth: '100%',
  },
  personOrgText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1d4ed8',
    textTransform: 'uppercase',
    maxWidth: 120,
  },
  personBalance: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  personBalancePos: { color: '#16a34a' },
  personBalanceNeg: { color: '#dc2626' },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 24, flexGrow: 1 },
  amountHero: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  amountLbl: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.accent, marginBottom: 6 },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountCurrency: { fontSize: 32, fontWeight: '800', color: adminTheme.colors.accent, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingVertical: 4,
  },
  quickAmtScroll: { marginTop: 10, maxHeight: 34 },
  quickAmtChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginRight: 8,
  },
  quickAmtText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  quickAmtClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginRight: 8,
  },
  quickAmtClearText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  sheetSection: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  sectionLbl: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 8 },
  planLoading: { alignItems: 'center', paddingVertical: 8 },
  planHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginBottom: 8, lineHeight: 15 },
  planChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
    marginBottom: 8,
  },
  planChipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  planChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  planChipTextOn: { color: '#fff' },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
    marginBottom: 6,
  },
  planRowOn: { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  planRowBody: { flex: 1, minWidth: 0 },
  planRowTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  planRowTitleOn: { color: '#5b21b6' },
  planRowMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  segmented: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  segmentOn: { backgroundColor: adminTheme.colors.primary },
  segmentText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  segmentTextOn: { color: '#fff', fontWeight: '800' },
  catHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  catHeadActions: { flexDirection: 'row', gap: 10 },
  catScroll: { marginTop: 4, maxHeight: 38 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catChipOn: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  catChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  catChipTextOn: { color: '#fff' },
  addCatRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  addCatInput: {
    flex: 1,
    fontSize: 14,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: adminTheme.colors.surface,
  },
  addCatBtn: {
    backgroundColor: adminTheme.colors.accent,
    width: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteInput: {
    fontSize: 14,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 88,
    backgroundColor: adminTheme.colors.surface,
    textAlignVertical: 'top',
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  detailLinkBody: { flex: 1, minWidth: 0 },
  detailLinkTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  detailLinkSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  sheetFooter: {
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
  },
  saveBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    ...adminTheme.shadow.md,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

type QuickPayListHeaderProps = {
  canUseAllOrg: boolean;
  ownOrganizationId?: string | null;
  lastSaved: string | null;
  scopeFilter: 'all' | FinanceLedgerScope;
  onScopeFilter: (s: 'all' | FinanceLedgerScope) => void;
  showExport: boolean;
  scopeLabelForReport: string;
  listReportRows: {
    name: string;
    partyTypeLabel: string;
    phone: string | null;
    income: number;
    expense: number;
    net: number;
    currentDebt?: number;
  }[];
  listReportTotals: { grandIncome: number; grandExpense: number };
  reportFooter: FinanceReportFooter;
  loading: boolean;
  listStats: { totalPeople: number; totalExpense: number };
  searchActive: boolean;
  selectionMode?: boolean;
  selectedCount?: number;
  visibleCount?: number;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  onBulkRemove?: () => void;
  bulkActing?: boolean;
};

function QuickPayListHeader({
  canUseAllOrg,
  ownOrganizationId,
  lastSaved,
  scopeFilter,
  onScopeFilter,
  showExport,
  scopeLabelForReport,
  listReportRows,
  listReportTotals,
  reportFooter,
  loading,
  listStats,
  searchActive,
  selectionMode = false,
  selectedCount = 0,
  visibleCount = 0,
  onSelectAll,
  onClearSelection,
  onBulkRemove,
  bulkActing = false,
}: QuickPayListHeaderProps) {
  const { t } = useTranslation();
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <View style={styles.listHeader}>
      <View style={styles.orgCard}>
        <AdminOrganizationPicker canUseAll={canUseAllOrg} ownOrganizationId={ownOrganizationId} />
      </View>

      {lastSaved ? (
        <View style={styles.savedBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={styles.savedBannerText} numberOfLines={2}>
            {t('quickPaySaved', { detail: lastSaved })}
          </Text>
        </View>
      ) : null}

      {listStats.totalPeople > 0 ? (
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <Ionicons name="people" size={14} color={adminTheme.colors.primary} />
            <Text style={styles.statPillNum}>{listStats.totalPeople}</Text>
            <Text style={styles.statPillLbl}>{searchActive ? 'sonuç' : 'kişi'}</Text>
          </View>
          <View style={[styles.statPill, styles.statPillExpense]}>
            <Ionicons name="arrow-down" size={14} color="#dc2626" />
            <Text style={[styles.statPillNum, styles.statPillNumExpense]}>
              {fmtMoneyTry(listStats.totalExpense)}
            </Text>
            <Text style={styles.statPillLbl}>ödenen</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.scopeSegmented}>
        {(['all', 'hotel', 'personal'] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.scopeSegment, scopeFilter === s && styles.scopeSegmentOn]}
            onPress={() => onScopeFilter(s)}
            activeOpacity={0.88}
          >
            <Text style={[styles.scopeSegmentText, scopeFilter === s && styles.scopeSegmentTextOn]}>
              {s === 'all' ? t('quickPayScopeAll') : LEDGER_SCOPE_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.listHint}>
        {selectionMode
          ? t('quickPayBulkSelectHint')
          : t('quickPayListHint')}
      </Text>

      {selectionMode && visibleCount > 0 ? (
        <View style={styles.bulkToolRow}>
          <Text style={styles.bulkToolMeta}>
            {t('quickPayBulkSelectedMeta', { count: selectedCount, total: visibleCount })}
          </Text>
          <View style={styles.bulkToolActions}>
            <TouchableOpacity style={styles.bulkToolChip} onPress={onSelectAll} disabled={bulkActing}>
              <Text style={styles.bulkToolChipText}>{t('quickPaySelectAll')}</Text>
            </TouchableOpacity>
            {selectedCount > 0 ? (
              <TouchableOpacity
                style={styles.bulkToolChip}
                onPress={onClearSelection}
                disabled={bulkActing}
              >
                <Text style={styles.bulkToolChipText}>{t('quickPayClearSelection')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.bulkToolChip, styles.bulkToolChipDanger, !selectedCount && styles.bulkToolChipDisabled]}
              onPress={onBulkRemove}
              disabled={!selectedCount || bulkActing}
            >
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={styles.bulkToolChipDangerText}>
                {t('quickPayBulkRemoveSelected', { count: selectedCount })}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {showExport && !selectionMode ? (
        <View style={styles.reportSection}>
          <TouchableOpacity
            style={styles.reportToggle}
            onPress={() => setReportOpen((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.reportToggleText}>Rapor / dışa aktar</Text>
            <Ionicons
              name={reportOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={adminTheme.colors.textMuted}
            />
          </TouchableOpacity>
          {reportOpen ? (
            <FinanceReportExportButtons
              compact
              fileName="kisi-odemeleri-hizli"
              mailSubject={`${t('profileUiPersonPaymentsQuick')} — ${scopeLabelForReport}`}
              shareDialogTitle={t('profileUiPersonPaymentsQuick')}
              getHtml={(kind) =>
                buildCounterpartyListReportHtml(
                  {
                    scopeLabel: scopeLabelForReport,
                    rows: listReportRows,
                    grandIncome: listReportTotals.grandIncome,
                    grandExpense: listReportTotals.grandExpense,
                    footer: reportFooter,
                  },
                  kind
                )
              }
            />
          ) : null}
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={styles.listLoader} color={adminTheme.colors.accent} /> : null}
    </View>
  );
}
