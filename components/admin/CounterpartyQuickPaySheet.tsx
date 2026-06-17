import { useCallback, useEffect, useRef, useState } from 'react';
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
import { supabase } from '@/lib/supabase';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import {
  fetchOpenCounterpartyAgreements,
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
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>(defaultLedgerScope);
  const [category, setCategory] = useState('other');
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [openAgreements, setOpenAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const [loadingAgreements, setLoadingAgreements] = useState(false);

  const reset = useCallback(() => {
    setAmount(prefillAmount ?? '');
    setNote('');
    setLedgerScope(defaultLedgerScope);
    setCategory('other');
    setOpenAgreements([]);
    setSelectedAgreementId(preselectedAgreementId ?? null);
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
        const pick = preselectedAgreementId ?? (plans.length === 1 ? plans[0].id : null);
        setSelectedAgreementId(pick);
        if (!prefillAmount && pick) {
          const plan = plans.find((p) => p.id === pick);
          if (plan && plan.amount_remaining > 0) {
            setAmount(String(plan.amount_remaining));
          }
        }
      })
      .catch(() => setOpenAgreements([]))
      .finally(() => setLoadingAgreements(false));
  }, [visible, person, preselectedAgreementId, prefillAmount, reset]);

  const save = async () => {
    if (!person?.organization_id || !staffId) return;
    const a = parseFloat(amount.replace(',', '.'));
    if (!a || a <= 0) {
      Alert.alert('Tutar', 'Geçerli tutar girin.');
      return;
    }
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.from('finance_movements').insert({
      organization_id: person.organization_id,
      kind: 'expense',
      amount: a,
      currency: 'TRY',
      movement_date: today,
      payment_method: 'cash',
      category,
      counterparty_id: person.id,
      description: note.trim() || 'Ödeme',
      ledger_scope: ledgerScope,
      agreement_id: selectedAgreementId,
      created_by_staff_id: staffId,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    invalidateCounterpartyBalanceCache(person.organization_id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
    onClose();
  };

  if (!person) return null;

  const meta = resolveCounterpartyTypeMeta(person.party_type, person.party_type_label);

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
                <Text style={styles.lbl}>Tutar (₺)</Text>
                <View style={styles.amountRow}>
                  <Text style={styles.currency}>₺</Text>
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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {QUICK_AMOUNTS.map((v) => (
                    <TouchableOpacity
                      key={v}
                      style={styles.quickChip}
                      onPress={() => {
                        const cur = parseFloat(amount.replace(',', '.')) || 0;
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
                  <Text style={styles.lbl}>Hangi borca?</Text>
                  <Text style={styles.hint}>Borç seçerseniz kalan tutar düşer ve borç kapanır.</Text>
                  <TouchableOpacity
                    style={[styles.planOpt, !selectedAgreementId && styles.planOptOn]}
                    onPress={() => setSelectedAgreementId(null)}
                  >
                    <Text style={[styles.planOptText, !selectedAgreementId && styles.planOptTextOn]}>
                      Genel ödeme (borçsuz)
                    </Text>
                  </TouchableOpacity>
                  {openAgreements.map((plan) => {
                    const active = selectedAgreementId === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[styles.planOpt, active && styles.planOptOn]}
                        onPress={() => {
                          setSelectedAgreementId(plan.id);
                          if (plan.amount_remaining > 0) setAmount(String(plan.amount_remaining));
                        }}
                      >
                        <View style={styles.planOptBody}>
                          <Text style={[styles.planOptTitle, active && styles.planOptTextOn]} numberOfLines={1}>
                            {plan.title}
                          </Text>
                          <Text style={styles.planOptMeta}>Kalan {fmtMoneyTry(plan.amount_remaining)}</Text>
                        </View>
                        {active ? (
                          <Ionicons name="checkmark-circle" size={18} color="#7c3aed" />
                        ) : null}
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
                      <Text style={styles.saveBtnText}>Ödemeyi kaydet</Text>
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
  planOpt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 6,
  },
  planOptOn: { borderColor: '#c4b5fd', backgroundColor: '#faf5ff' },
  planOptBody: { flex: 1, minWidth: 0 },
  planOptTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  planOptText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  planOptTextOn: { color: '#5b21b6' },
  planOptMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
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
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
