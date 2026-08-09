import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import {
  fetchOpenCounterpartyAgreements,
  recordCounterpartyPayment,
  suggestAgreementsToClose,
  summarizeOpenAgreements,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';
import { fmtMoneyTry, LEDGER_SCOPE_LABELS, type FinanceLedgerScope } from '@/lib/financeLedger';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

const QUICK_AMOUNTS = [100, 250, 500, 1000, 2000, 5000] as const;
const PAY_GRAD = ['#dc2626', '#b91c1c'] as const;
const SHEET_HEIGHT = Math.round(Dimensions.get('window').height * 0.92);

type Person = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
};

type Props = {
  visible: boolean;
  person: Person | null;
  defaultLedgerScope: FinanceLedgerScope;
  staffId: string | null | undefined;
  preselectedAgreementId?: string | null;
  prefillAmount?: string;
  onClose: () => void;
  onSaved: () => void;
};

function parseAmount(raw: string): number {
  const a = parseFloat(raw.replace(',', '.'));
  return !a || a <= 0 ? 0 : Math.round(a * 100) / 100;
}

export function CounterpartyQuickPaySheet({
  visible,
  person,
  defaultLedgerScope,
  staffId,
  preselectedAgreementId,
  prefillAmount,
  onClose,
  onSaved,
}: Props) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const skipNextSuggest = useRef(false);
  const manualSelect = useRef(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>(defaultLedgerScope);
  const [category, setCategory] = useState('other');
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [openAgreements, setOpenAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingAgreements, setLoadingAgreements] = useState(false);

  const reset = useCallback(() => {
    setAmount(prefillAmount ?? '');
    setNote('');
    setLedgerScope(defaultLedgerScope);
    setCategory('other');
    setOpenAgreements([]);
    setSelectedIds(preselectedAgreementId ? [preselectedAgreementId] : []);
    skipNextSuggest.current = Boolean(preselectedAgreementId || prefillAmount);
    manualSelect.current = Boolean(preselectedAgreementId);
  }, [defaultLedgerScope, prefillAmount, preselectedAgreementId]);

  useEffect(() => {
    if (!visible || !person) return;
    reset();
    void loadMovementCategories(person.organization_id, 'expense').then((opts) => {
      setCategoryOptions(opts);
      setCategory(opts[0]?.code ?? 'other');
    });
    setLoadingAgreements(true);
    void fetchOpenCounterpartyAgreements(person.id, 'expense')
      .then((plans) => {
        setOpenAgreements(plans);
        if (preselectedAgreementId) {
          const plan = plans.find((p) => p.id === preselectedAgreementId);
          setSelectedIds(plan ? [plan.id] : []);
          if (!prefillAmount && plan && plan.amount_remaining > 0) {
            setAmount(String(plan.amount_remaining));
          }
          return;
        }
        if (prefillAmount) {
          const target = parseAmount(prefillAmount);
          if (target > 0 && plans.length > 0) {
            const sug = suggestAgreementsToClose(target, plans);
            setSelectedIds(sug.ids);
          }
          return;
        }
        if (plans.length > 0) {
          setAmount('');
          setSelectedIds([]);
        }
      })
      .catch(() => setOpenAgreements([]))
      .finally(() => setLoadingAgreements(false));
  }, [visible, person, preselectedAgreementId, prefillAmount, reset]);

  // Tutar değişince hangi kartların kapanacağını öner (manuel seçim yoksa)
  useEffect(() => {
    if (!visible || openAgreements.length === 0) return;
    if (skipNextSuggest.current) {
      skipNextSuggest.current = false;
      return;
    }
    if (manualSelect.current) return;
    const target = parseAmount(amount);
    if (target <= 0) {
      setSelectedIds([]);
      return;
    }
    const sug = suggestAgreementsToClose(target, openAgreements);
    setSelectedIds(sug.ids);
  }, [amount, openAgreements, visible]);

  const selectedSum = useMemo(() => {
    const set = new Set(selectedIds);
    return Math.round(
      openAgreements
        .filter((p) => set.has(p.id))
        .reduce((s, p) => s + (Number(p.amount_remaining) || 0), 0) * 100
    ) / 100;
  }, [openAgreements, selectedIds]);

  const payAmount = parseAmount(amount);
  const gap = Math.round((payAmount - selectedSum) * 100) / 100;

  const suggestedSet = useMemo(() => {
    const t = parseAmount(amount);
    if (t <= 0) return new Set<string>();
    return new Set(suggestAgreementsToClose(t, openAgreements).ids);
  }, [amount, openAgreements]);

  const toggleCard = (id: string) => {
    manualSelect.current = true;
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const applySuggestion = () => {
    const target = parseAmount(amount);
    if (target <= 0) {
      Alert.alert('Tutar', 'Önce ödeme tutarını girin.');
      return;
    }
    manualSelect.current = false;
    const sug = suggestAgreementsToClose(target, openAgreements);
    setSelectedIds(sug.ids);
    void Haptics.selectionAsync();
  };

  const setAmountFromSelection = () => {
    if (selectedSum <= 0) return;
    skipNextSuggest.current = true;
    setAmount(String(selectedSum));
    void Haptics.selectionAsync();
  };

  const save = async () => {
    if (!person?.organization_id || !staffId) return;
    const a = parseAmount(amount);
    if (!a) {
      Alert.alert('Tutar', 'Geçerli tutar girin.');
      return;
    }
    if (openAgreements.length > 0 && selectedIds.length === 0) {
      Alert.alert(
        'Kart seçin',
        'Kapatılacak borç kartlarını seçin. Tutarı girince öneri otomatik gelir; kartlara dokunarak değiştirebilirsiniz.'
      );
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error, allocatedCount, leftover } = await recordCounterpartyPayment({
      organizationId: person.organization_id,
      counterpartyId: person.id,
      kind: 'expense',
      amount: a,
      movementDate: today,
      category,
      description: note.trim() || 'Ödeme',
      ledgerScope,
      agreementId: null,
      agreementIds: selectedIds.length > 0 ? selectedIds : null,
      createdByStaffId: staffId,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error);
      return;
    }
    invalidateCounterpartyBalanceCache(person.organization_id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (allocatedCount > 0) {
      const msg =
        leftover > 0.009
          ? `${allocatedCount} kart kapatıldı/düşüldü; fazla ${leftover.toFixed(2)} TL plansız kaldı.`
          : `${allocatedCount} borç kartına işlendi.`;
      Alert.alert('Ödeme kaydedildi', msg);
    }
    onSaved();
    onClose();
  };

  if (!person) return null;

  const meta = resolveCounterpartyTypeMeta(person.party_type, person.party_type_label);
  const openDebtSummary = summarizeOpenAgreements(openAgreements, 'expense');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.overlayDismiss} onPress={onClose} accessibilityLabel="Kapat" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kb}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.handle} />
            <View style={styles.headRow}>
              <Text style={styles.headTitle}>Ödeme yap</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons name="close" size={22} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.personRow}>
              <View style={[styles.avatar, { backgroundColor: meta.bg }]}>
                <Text style={[styles.avatarText, { color: meta.color }]}>{counterpartyInitials(person.name)}</Text>
              </View>
              <View style={styles.personBody}>
                <Text style={styles.personName} numberOfLines={2}>
                  {person.name}
                </Text>
                <Text style={styles.personSub}>Bu kişiye para ödüyorsunuz</Text>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator
              nestedScrollEnabled
            >
              <View style={styles.amountBox}>
                <Text style={styles.lbl}>Ödeme tutarı (₺)</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.currency}>₺</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    placeholder="Örn. 14880"
                    placeholderTextColor="#cbd5e1"
                    autoFocus
                  />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {QUICK_AMOUNTS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={styles.quickChip}
                      onPress={() => {
                        const cur = parseAmount(amount);
                        setAmount(String(cur + v));
                      }}
                    >
                      <Text style={styles.quickChipText}>+{v.toLocaleString('tr-TR')}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {loadingAgreements ? (
                <ActivityIndicator color="#7c3aed" style={{ marginVertical: 8 }} />
              ) : openAgreements.length > 0 ? (
                <View style={styles.block}>
                  <View style={styles.debtSummaryBox}>
                    <Text style={styles.debtSummaryTitle}>Açık cari</Text>
                    <View style={styles.debtSummaryRow}>
                      <Text style={styles.debtSummaryLbl}>Açılan</Text>
                      <Text style={styles.debtSummaryVal}>{fmtMoneyTry(openDebtSummary.opened)}</Text>
                    </View>
                    <View style={styles.debtSummaryRow}>
                      <Text style={styles.debtSummaryLbl}>Ödenen</Text>
                      <Text style={[styles.debtSummaryVal, { color: '#dc2626' }]}>
                        {fmtMoneyTry(openDebtSummary.paid)}
                      </Text>
                    </View>
                    <View style={styles.debtSummaryRow}>
                      <Text style={styles.debtSummaryLbl}>Kalan</Text>
                      <Text style={[styles.debtSummaryVal, { color: '#b45309' }]}>
                        {fmtMoneyTry(openDebtSummary.remaining)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.lbl}>Kapatılacak kartlar</Text>
                  <Text style={styles.hint}>
                    Tutarı girin — hangi kartları kapatırsanız bu tutara ulaşırsınız otomatik işaretlenir.
                    İsterseniz kartlara dokunarak değiştirin.
                  </Text>

                  {payAmount > 0 ? (
                    <View
                      style={[
                        styles.matchBox,
                        Math.abs(gap) < 0.01
                          ? styles.matchBoxOk
                          : gap > 0
                            ? styles.matchBoxWarn
                            : styles.matchBoxOver,
                      ]}
                    >
                      <Text style={styles.matchTitle}>
                        {Math.abs(gap) < 0.01
                          ? 'Tam tutar — seçili kartlar kapanır'
                          : gap > 0
                            ? `Seçili kartlar ${fmtMoneyTry(selectedSum)} · ${fmtMoneyTry(gap)} eksik`
                            : `Seçili kartlar ${fmtMoneyTry(selectedSum)} · fazla ${fmtMoneyTry(Math.abs(gap))} kısmi kalır`}
                      </Text>
                      <Text style={styles.matchSub}>
                        Ödeme {fmtMoneyTry(payAmount)} · {selectedIds.length} kart seçili
                      </Text>
                      <View style={styles.matchActions}>
                        <TouchableOpacity style={styles.matchBtn} onPress={applySuggestion}>
                          <Ionicons name="sparkles-outline" size={14} color="#7c3aed" />
                          <Text style={styles.matchBtnText}>Yeniden öner</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.matchBtn} onPress={setAmountFromSelection}>
                          <Ionicons name="resize-outline" size={14} color="#7c3aed" />
                          <Text style={styles.matchBtnText}>Tutarı seçiliye eşitle</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : null}

                  {openAgreements.map((plan) => {
                    const active = selectedIds.includes(plan.id);
                    const suggested = suggestedSet.has(plan.id);
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[styles.planOpt, active && styles.planOptOn]}
                        onPress={() => toggleCard(plan.id)}
                        activeOpacity={0.85}
                      >
                        <Ionicons
                          name={active ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={active ? '#7c3aed' : '#94a3b8'}
                        />
                        <View style={styles.planOptBody}>
                          <View style={styles.planTitleRow}>
                            <Text style={[styles.planOptTitle, active && styles.planOptTextOn]} numberOfLines={1}>
                              {plan.title}
                            </Text>
                            {suggested && !active ? (
                              <Text style={styles.suggestBadge}>öneri</Text>
                            ) : null}
                            {suggested && active ? (
                              <Text style={styles.suggestBadgeOn}>önerilen</Text>
                            ) : null}
                          </View>
                          <Text style={styles.planOptMeta}>
                            Kalan {fmtMoneyTry(plan.amount_remaining)} · Ödenen{' '}
                            {fmtMoneyTry(
                              plan.amount_paid >= 0.01
                                ? plan.amount_paid
                                : Math.max(0, plan.target_amount - plan.amount_remaining)
                            )}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.block}>
                <Text style={styles.lbl}>Kayıt türü</Text>
                <View style={styles.segRow}>
                  {(['hotel', 'personal'] as FinanceLedgerScope[]).map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={[styles.seg, ledgerScope === s && styles.segOn]}
                      onPress={() => setLedgerScope(s)}
                    >
                      <Text style={[styles.segText, ledgerScope === s && styles.segTextOn]}>
                        {LEDGER_SCOPE_LABELS[s]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {categoryOptions.length > 0 ? (
                <View style={styles.block}>
                  <Text style={styles.lbl}>Kategori</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
                </View>
              ) : null}

              <View style={styles.block}>
                <Text style={styles.lbl}>Not (isteğe bağlı)</Text>
                <TextInput
                  style={styles.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Kısa açıklama"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  multiline
                  onFocus={() => {
                    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
                  }}
                />
              </View>

              <TouchableOpacity onPress={() => void save()} disabled={saving} activeOpacity={0.9} style={styles.saveWrap}>
                <LinearGradient colors={[...PAY_GRAD]} style={styles.saveBtn}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                      <Text style={styles.saveBtnText}>
                        {selectedIds.length > 0
                          ? `${selectedIds.length} kartı kapat · Ödemeyi kaydet`
                          : 'Ödemeyi kaydet'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  overlayDismiss: { ...StyleSheet.absoluteFillObject },
  kb: { width: '100%', maxHeight: SHEET_HEIGHT },
  sheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    height: SHEET_HEIGHT,
    maxHeight: SHEET_HEIGHT,
  },
  sheetScroll: { flex: 1 },
  sheetScrollContent: { paddingBottom: 32, flexGrow: 1 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  headTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  personSub: { fontSize: 12, color: '#b91c1c', marginTop: 2 },
  amountBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginBottom: 12,
  },
  lbl: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 6 },
  hint: { fontSize: 11, color: adminTheme.colors.textMuted, marginBottom: 8, lineHeight: 15 },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  currency: { fontSize: 22, fontWeight: '800', color: '#ea580c', marginRight: 4 },
  amountInput: { flex: 1, fontSize: 34, fontWeight: '800', color: adminTheme.colors.text, padding: 0 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: '#fed7aa',
    marginRight: 8,
  },
  quickChipText: { fontSize: 12, fontWeight: '700', color: '#c2410c' },
  block: { marginBottom: 12 },
  debtSummaryBox: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 4,
  },
  debtSummaryTitle: { fontSize: 12, fontWeight: '800', color: '#92400e', marginBottom: 4 },
  debtSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  debtSummaryLbl: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  debtSummaryVal: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  matchBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  matchBoxOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  matchBoxWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  matchBoxOver: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  matchTitle: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  matchSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  matchActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  matchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
  },
  matchBtnText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  planOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 6,
  },
  planOptOn: { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  planOptBody: { flex: 1, minWidth: 0 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planOptTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  planOptTextOn: { color: '#5b21b6' },
  planOptMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  suggestBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#a16207',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  suggestBadgeOn: {
    fontSize: 10,
    fontWeight: '700',
    color: '#5b21b6',
    backgroundColor: '#ede9fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  segRow: { flexDirection: 'row', gap: 8 },
  seg: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  segOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  segText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  segTextOn: { color: '#fff' },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catChipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  catChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  catChipTextOn: { color: '#fff' },
  noteInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: adminTheme.colors.text,
    minHeight: 88,
    textAlignVertical: 'top',
  },
  saveWrap: { marginTop: 8, marginBottom: 8 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
