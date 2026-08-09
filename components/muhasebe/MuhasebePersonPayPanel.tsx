import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';
import { adminTheme } from '@/constants/adminTheme';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import {
  fetchOpenCounterpartyAgreements,
  summarizeOpenAgreements,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';
import { fmtMoneyTry, LEDGER_SCOPE_LABELS, type FinanceLedgerScope } from '@/lib/financeLedger';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';
import {
  defaultLedgerScopeForParty,
  MUHASEBE_QUICK_AMOUNTS,
  parsePaymentAmount,
  saveMuhasebePersonPayment,
  suggestAgreementIdsForAmount,
  type MuhasebeCounterpartyRow,
} from '@/lib/muhasebePersonPayments';

export type MuhasebePayMode = 'expense' | 'income';

type Props = {
  person: MuhasebeCounterpartyRow;
  staffId: string;
  balanceNet?: number;
  openDebt?: number;
  onSaved: () => void;
  onOpenDetail: () => void;
  onClearSelection?: () => void;
};

export function MuhasebePersonPayPanel({
  person,
  staffId,
  balanceNet = 0,
  openDebt = 0,
  onSaved,
  onOpenDetail,
  onClearSelection,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<MuhasebePayMode>('expense');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>(
    defaultLedgerScopeForParty(person.party_type)
  );
  const [category, setCategory] = useState('other');
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [openAgreements, setOpenAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const manualSelect = useRef(false);
  const skipSuggest = useRef(false);

  const resetForPerson = useCallback(() => {
    setAmount('');
    setNote('');
    setLedgerScope(defaultLedgerScopeForParty(person.party_type));
    setSelectedIds([]);
    setLastSaved(null);
    manualSelect.current = false;
    skipSuggest.current = false;
    setMode(person.party_type === 'customer' ? 'income' : 'expense');
  }, [person.id, person.party_type]);

  useEffect(() => {
    resetForPerson();
  }, [resetForPerson]);

  useEffect(() => {
    void loadMovementCategories(person.organization_id, mode === 'expense' ? 'expense' : 'income').then(
      (opts) => {
        setCategoryOptions(opts);
        setCategory(opts[0]?.code ?? 'other');
      }
    );
  }, [person.organization_id, mode]);

  useEffect(() => {
    setLoadingAgreements(true);
    void fetchOpenCounterpartyAgreements(person.id, mode)
      .then((plans) => {
        setOpenAgreements(plans);
        if (plans.length === 1) {
          setSelectedIds([plans[0].id]);
          manualSelect.current = true;
          if (plans[0].amount_remaining > 0) {
            skipSuggest.current = true;
            setAmount(String(plans[0].amount_remaining));
          }
        } else {
          setSelectedIds([]);
          manualSelect.current = false;
        }
      })
      .catch(() => setOpenAgreements([]))
      .finally(() => setLoadingAgreements(false));
  }, [person.id, mode]);

  useEffect(() => {
    if (openAgreements.length === 0 || mode !== 'expense') return;
    if (skipSuggest.current) {
      skipSuggest.current = false;
      return;
    }
    if (manualSelect.current) return;
    setSelectedIds(suggestAgreementIdsForAmount(amount, openAgreements));
  }, [amount, openAgreements, mode]);

  const selectedSum = useMemo(() => {
    const set = new Set(selectedIds);
    return (
      Math.round(
        openAgreements
          .filter((p) => set.has(p.id))
          .reduce((s, p) => s + (Number(p.amount_remaining) || 0), 0) * 100
      ) / 100
    );
  }, [openAgreements, selectedIds]);

  const payAmount = parsePaymentAmount(amount);
  const gap = Math.round((payAmount - selectedSum) * 100) / 100;
  const debtSummary = summarizeOpenAgreements(openAgreements, mode);
  const meta = resolveCounterpartyTypeMeta(person.party_type, person.party_type_label);

  const toggleCard = (id: string) => {
    if (mode === 'income') {
      setSelectedIds((prev) => (prev[0] === id ? [] : [id]));
      return;
    }
    manualSelect.current = true;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const save = async (andClear: boolean) => {
    const a = parsePaymentAmount(amount);
    if (!a) {
      Alert.alert(t('quickPayAmountRequired'));
      return;
    }
    if (mode === 'expense' && openAgreements.length > 0 && selectedIds.length === 0) {
      Alert.alert(t('quickPayPlanPickRequired'));
      return;
    }
    setSaving(true);
    const { error, allocatedCount } = await saveMuhasebePersonPayment({
      organizationId: person.organization_id,
      counterpartyId: person.id,
      kind: mode,
      amount: a,
      category,
      description:
        note.trim() ||
        (mode === 'income' ? t('muhasebeWebCollectDefaultNote') : t('quickPayDefaultNote')),
      ledgerScope,
      agreementIds: mode === 'expense' ? selectedIds : null,
      agreementId: mode === 'income' ? selectedIds[0] ?? null : null,
      staffId,
    });
    setSaving(false);
    if (error) {
      Alert.alert(t('quickPaySaveError'), error);
      return;
    }
    setLastSaved(
      allocatedCount > 0
        ? `${person.name}: ${fmtMoneyTry(a)} · ${allocatedCount}`
        : `${person.name}: ${fmtMoneyTry(a)}`
    );
    setAmount('');
    setNote('');
    setSelectedIds([]);
    manualSelect.current = false;
    onSaved();
    if (andClear) onClearSelection?.();
  };

  return (
    <View style={styles.panel}>
      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
          <Text style={[styles.avatarText, { color: meta.color }]}>
            {counterpartyInitials(person.name)}
          </Text>
        </View>
        <View style={styles.headBody}>
          <Text style={styles.name} numberOfLines={2}>
            {person.name}
          </Text>
          <Text style={styles.meta}>
            {meta.label}
            {person.phone ? ` · ${person.phone}` : ''}
          </Text>
          <View style={styles.statsRow}>
            <Text style={styles.stat}>
              {t('muhasebeWebNet')}: {fmtMoneyTry(balanceNet)}
            </Text>
            {openDebt >= 0.01 ? (
              <Text style={[styles.stat, styles.statDebt]}>
                {t('muhasebeWebOpenDebt')}: {fmtMoneyTry(openDebt)}
              </Text>
            ) : null}
          </View>
        </View>
        {onClearSelection ? (
          <TouchableOpacity onPress={onClearSelection} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'expense' && styles.modeBtnPay]}
          onPress={() => setMode('expense')}
        >
          <Text style={[styles.modeText, mode === 'expense' && styles.modeTextOn]}>
            {t('muhasebeWebModePay')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'income' && styles.modeBtnCollect]}
          onPress={() => setMode('income')}
        >
          <Text style={[styles.modeText, mode === 'income' && styles.modeTextOn]}>
            {t('muhasebeWebModeCollect')}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.formScroll}
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {lastSaved ? (
          <View style={styles.savedBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            <Text style={styles.savedText}>{t('quickPaySaved', { detail: lastSaved })}</Text>
          </View>
        ) : null}

        <Text style={styles.lbl}>{t('quickPayAmountLabel')}</Text>
        <View style={styles.amountBox}>
          <Text style={styles.currency}>₺</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
        <View style={styles.quickRow}>
          {MUHASEBE_QUICK_AMOUNTS.map((v) => (
            <TouchableOpacity
              key={v}
              style={styles.quickChip}
              onPress={() => setAmount(String(parsePaymentAmount(amount) + v))}
            >
              <Text style={styles.quickChipText}>+{v.toLocaleString('tr-TR')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loadingAgreements ? (
          <ActivityIndicator color={adminTheme.colors.accent} style={{ marginVertical: 12 }} />
        ) : openAgreements.length > 0 ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>
              {mode === 'income' ? t('muhasebeWebOpenReceivables') : t('quickPayPlanLabel')}
            </Text>
            <Text style={styles.blockHint}>
              {t('muhasebeWebDebtSummary', {
                opened: fmtMoneyTry(debtSummary.opened),
                remaining: fmtMoneyTry(debtSummary.remaining),
              })}
            </Text>
            {openAgreements.map((plan) => {
              const on = selectedIds.includes(plan.id);
              return (
                <TouchableOpacity
                  key={plan.id}
                  style={[styles.planRow, on && styles.planRowOn]}
                  onPress={() => toggleCard(plan.id)}
                >
                  <View style={[styles.planCheck, on && styles.planCheckOn]}>
                    {on ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planTitle} numberOfLines={1}>
                      {plan.title || t('muhasebeWebUntitledPlan')}
                    </Text>
                    <Text style={styles.planSub}>
                      {t('quickPayPlanRemaining', { amount: fmtMoneyTry(plan.amount_remaining) })}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            {mode === 'expense' && payAmount > 0 && selectedIds.length > 0 ? (
              <Text style={styles.gapHint}>
                {Math.abs(gap) < 0.01
                  ? t('quickPayPlanExact')
                  : gap > 0
                    ? t('quickPayPlanOver', { sum: fmtMoneyTry(selectedSum), gap: fmtMoneyTry(gap) })
                    : t('quickPayPlanShort', {
                        sum: fmtMoneyTry(selectedSum),
                        gap: fmtMoneyTry(Math.abs(gap)),
                      })}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.lbl}>{t('quickPayScopeLabel')}</Text>
        <View style={styles.scopeRow}>
          {(['hotel', 'personal'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.scopeChip, ledgerScope === s && styles.scopeChipOn]}
              onPress={() => setLedgerScope(s)}
            >
              <Text style={[styles.scopeText, ledgerScope === s && styles.scopeTextOn]}>
                {LEDGER_SCOPE_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.lbl}>{t('quickPayCategoryLabel')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
          {categoryOptions.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.catChip, category === c.code && styles.catChipOn]}
              onPress={() => setCategory(c.code)}
            >
              <Text style={[styles.catText, category === c.code && styles.catTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.lbl}>{t('quickPayNoteLabel')}</Text>
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder={t('quickPayNotePlaceholder')}
          placeholderTextColor={adminTheme.colors.textMuted}
        />

        <TouchableOpacity
          style={styles.detailLink}
          onPress={onOpenDetail}
          activeOpacity={0.85}
        >
          <Ionicons name="open-outline" size={16} color={adminTheme.colors.info} />
          <Text style={styles.detailLinkText}>{t('muhasebeWebOpenFullDetail')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.saveSecondary}
          onPress={() => void save(true)}
          disabled={saving}
          activeOpacity={0.88}
        >
          <Text style={styles.saveSecondaryText}>{t('muhasebeWebSaveAndNext')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.savePrimaryWrap}
          onPress={() => void save(false)}
          disabled={saving}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={mode === 'income' ? ['#16a34a', '#15803d'] : ['#dc2626', '#b91c1c']}
            style={styles.savePrimary}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.savePrimaryText}>
                {mode === 'income' ? t('muhasebeWebSaveCollect') : t('muhasebeWebSavePay')}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    minHeight: 480,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  headBody: { flex: 1 },
  name: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 2 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  stat: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  statDebt: { color: '#b91c1c' },
  closeBtn: { padding: 4 },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  modeBtnPay: { backgroundColor: '#fee2e2' },
  modeBtnCollect: { backgroundColor: '#dcfce7' },
  modeText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.textSecondary },
  modeTextOn: { color: adminTheme.colors.text },
  formScroll: { flex: 1 },
  formContent: { padding: 16, paddingBottom: 24 },
  savedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  savedText: { flex: 1, fontSize: 13, color: '#047857', fontWeight: '600' },
  lbl: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    marginBottom: 6,
    marginTop: 10,
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  currency: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.textMuted, marginRight: 6 },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingVertical: 12,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  quickChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  block: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  blockTitle: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  blockHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 8 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
  },
  planRowOn: { backgroundColor: '#e0f2fe' },
  planCheck: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCheckOn: { backgroundColor: adminTheme.colors.info, borderColor: adminTheme.colors.info },
  planTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  planSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 1 },
  gapHint: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary, marginTop: 6 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  scopeChipOn: { backgroundColor: adminTheme.colors.primary },
  scopeText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  scopeTextOn: { color: '#fff' },
  catScroll: { marginBottom: 4 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginRight: 6,
  },
  catChipOn: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74' },
  catText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  catTextOn: { color: adminTheme.colors.accent },
  noteInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
  },
  detailLinkText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.info },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  saveSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  saveSecondaryText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  savePrimaryWrap: { flex: 1.4, borderRadius: 12, overflow: 'hidden' },
  savePrimary: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  savePrimaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
