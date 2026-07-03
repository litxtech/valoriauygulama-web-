import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import {
  fmtMoneyTry,
  DEBT_CATEGORY_LABELS,
  DEBT_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  notifyDebtPaymentParties,
  type DebtCategory,
  type DebtStatus,
  type DebtPaymentMethod,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import { useTranslation } from 'react-i18next';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type DebtDetailCache = {
  debt: DebtRow;
  payments: PayRow[];
  checks: { id: string; counterparty_name: string; amount: number }[];
};

type DebtRow = {
  id: string;
  organization_id: string;
  category: DebtCategory;
  borrower_staff_id: string | null;
  borrower_is_organization: boolean;
  lender_staff_id: string | null;
  lender_is_organization: boolean;
  description: string;
  amount_principal: number;
  amount_remaining: number;
  status: DebtStatus;
  due_date: string | null;
  created_at: string;
  borrower?: { full_name: string | null } | null;
  lender?: { full_name: string | null } | null;
};

type PayRow = {
  id: string;
  amount: number;
  payment_method: DebtPaymentMethod;
  paid_at: string;
  notes: string | null;
  finance_check_id: string | null;
};

const PAY_METHODS: DebtPaymentMethod[] = ['cash', 'transfer', 'card', 'check', 'other'];

export default function StaffDebtDetail() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useAuthStore((s) => s.staff);
  const [debt, setDebt] = useState<DebtRow | null>(null);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [checks, setChecks] = useState<{ id: string; counterparty_name: string; amount: number }[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<DebtPaymentMethod>('cash');
  const [payNote, setPayNote] = useState('');
  const [payCheckId, setPayCheckId] = useState<string | null>(null);
  const [savingPay, setSavingPay] = useState(false);

  const fetchData = useCallback(async (): Promise<DebtDetailCache | null> => {
    if (!id) return null;
    const { data: d, error: e1 } = await supabase
      .from('staff_debt_entries')
      .select(
        `
        id,
        organization_id,
        category,
        borrower_staff_id,
        borrower_is_organization,
        lender_staff_id,
        lender_is_organization,
        description,
        amount_principal,
        amount_remaining,
        status,
        due_date,
        created_at,
        borrower:borrower_staff_id(full_name),
        lender:lender_staff_id(full_name)
      `
      )
      .eq('id', id)
      .single();
    if (e1 || !d) {
      Alert.alert(t('staffDebtsRecordLabel'), t('staffDebtsAccessDenied'));
      return null;
    }
    const dr = d as DebtRow;
    const [{ data: p }, { data: c }] = await Promise.all([
      supabase
        .from('staff_debt_payments')
        .select('id, amount, payment_method, paid_at, notes, finance_check_id')
        .eq('debt_entry_id', id)
        .order('paid_at', { ascending: false }),
      supabase
        .from('finance_checks')
        .select('id, counterparty_name, amount')
        .eq('organization_id', dr.organization_id)
        .not('status', 'eq', 'paid')
        .not('status', 'eq', 'bounced')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);
    return {
      debt: dr,
      payments: (p as PayRow[]) ?? [],
      checks: ((c ?? []) as { id: string; counterparty_name: string; amount: number }[]) ?? [],
    };
  }, [id, t]);

  const { data: cached, reload, showContent } = useCachedFocusLoad({
    cacheKey: id ? `staff-debt-detail:${id}` : 'staff-debt-detail:none',
    enabled: !!id,
    fetchData,
  });

  useEffect(() => {
    if (!cached) return;
    setDebt(cached.debt);
    setPayments(cached.payments);
    setChecks(cached.checks);
  }, [cached]);

  const load = reload;

  const submitPayment = async () => {
    if (!id || !me?.id || !debt) return;
    const a = parseFloat(payAmount.replace(',', '.'));
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Tutar', 'Geçerli ödeme tutarı girin.');
      return;
    }
    if (a > Number(debt.amount_remaining) + 0.009) {
      Alert.alert('Tutar', 'Kalan tutardan fazla olamaz.');
      return;
    }
    setSavingPay(true);
    const { error } = await supabase.from('staff_debt_payments').insert({
      debt_entry_id: id,
      amount: a,
      payment_method: payMethod,
      finance_check_id: payCheckId,
      notes: payNote.trim() || null,
      recorded_by_staff_id: me.id,
    });
    setSavingPay(false);
    if (error) {
      Alert.alert(t('staffDebtsPaymentLabel'), error.message);
      return;
    }
    await notifyDebtPaymentParties({
      debtId: id,
      amount: a,
      payerStaffId: me.id,
      borrowerStaffId: debt.borrower_staff_id,
      lenderStaffId: debt.lender_staff_id,
      note: payNote,
    });
    setPayOpen(false);
    setPayAmount('');
    setPayNote('');
    setPayCheckId(null);
    await load();
  };

  if (!showContent && !debt) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.cat}>{DEBT_CATEGORY_LABELS[debt.category]}</Text>
        <Text style={styles.parties}>
          {t('staffDebtsBorrowerLabel')}:{' '}
          {debt.borrower_is_organization ? t('staffDebtsCompany') : debt.borrower?.full_name || '—'}
        </Text>
        <Text style={styles.parties}>
          {t('staffDebtsLenderLabel')}:{' '}
          {debt.lender_is_organization ? t('staffDebtsCompany') : debt.lender?.full_name || '—'}
        </Text>
        <Text style={styles.desc}>{debt.description}</Text>
        <View style={styles.sum}>
          <Text style={styles.sumLabel}>Kalan</Text>
          <Text style={styles.sumVal}>{fmtMoneyTry(Number(debt.amount_remaining))}</Text>
        </View>
        <Text style={styles.meta}>
          {DEBT_STATUS_LABELS[debt.status]} · Ana para {fmtMoneyTry(Number(debt.amount_principal))}
        </Text>
        {debt.due_date ? <Text style={styles.due}>Vade: {formatDateShort(debt.due_date)}</Text> : null}
      </View>

      <TouchableOpacity style={styles.payBtn} onPress={() => setPayOpen(true)} disabled={debt.status === 'closed'}>
        <Ionicons name="cash-outline" size={22} color="#fff" />
        <Text style={styles.payBtnText}>Ödeme ekle</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.secTitle}>Ödemeler</Text>
        {payments.length === 0 ? (
          <Text style={styles.empty}>Henüz ödeme yok.</Text>
        ) : (
          payments.map((p) => (
            <View key={p.id} style={styles.payRow}>
              <Text style={styles.payAmt}>{fmtMoneyTry(Number(p.amount))}</Text>
              <Text style={styles.payMeta}>
                {PAYMENT_METHOD_LABELS[p.payment_method]} · {formatDateShort(p.paid_at)}
              </Text>
              {p.notes ? <Text style={styles.payNote}>{p.notes}</Text> : null}
              {p.finance_check_id ? (
                <Text style={styles.payCheck}>Çek kaydına bağlı ödeme</Text>
              ) : null}
            </View>
          ))
        )}
      </View>

      <Modal visible={payOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => !savingPay && setPayOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ödeme</Text>
            <Text style={styles.label}>Tutar (kalan {fmtMoneyTry(Number(debt.amount_remaining))})</Text>
            <TextInput style={styles.input} value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" />
            <Text style={styles.label}>Yöntem</Text>
            <View style={styles.methods}>
              {PAY_METHODS.map((m) => (
                <TouchableOpacity key={m} style={[styles.mChip, payMethod === m && styles.mChipOn]} onPress={() => setPayMethod(m)}>
                  <Text style={[styles.mChipText, payMethod === m && styles.mChipTextOn]}>{PAYMENT_METHOD_LABELS[m]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {payMethod === 'check' && checks.length > 0 ? (
              <>
                <Text style={styles.label}>Çek kaydı (isteğe bağlı)</Text>
                <ScrollView style={styles.checkScroll} nestedScrollEnabled>
                  <TouchableOpacity
                    style={[styles.checkRow, !payCheckId && styles.checkRowOn]}
                    onPress={() => setPayCheckId(null)}
                  >
                    <Text>Bağlama</Text>
                  </TouchableOpacity>
                  {checks.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.checkRow, payCheckId === c.id && styles.checkRowOn]}
                      onPress={() => setPayCheckId(c.id)}
                    >
                      <Text numberOfLines={1}>
                        {c.counterparty_name} · {fmtMoneyTry(Number(c.amount))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : null}
            <Text style={styles.label}>Not</Text>
            <TextInput style={[styles.input, styles.ta]} value={payNote} onChangeText={setPayNote} multiline />
            <TouchableOpacity style={styles.savePay} onPress={submitPayment} disabled={savingPay}>
              {savingPay ? <ActivityIndicator color="#fff" /> : <Text style={styles.savePayText}>Kaydet</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelPay} onPress={() => setPayOpen(false)} disabled={savingPay}>
              <Text>İptal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cat: { fontSize: 13, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 },
  parties: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 4 },
  desc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 8 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  sumLabel: { fontSize: 14, color: theme.colors.textMuted },
  sumVal: { fontSize: 22, fontWeight: '800', color: theme.colors.primary },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  due: { fontSize: 13, color: theme.colors.primaryDark, marginTop: 6 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  payBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: theme.colors.text },
  empty: { color: theme.colors.textMuted },
  payRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  payAmt: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  payMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  payCheck: { fontSize: 12, color: theme.colors.primary, marginTop: 4, fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  ta: { minHeight: 64, textAlignVertical: 'top' },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: theme.colors.backgroundSecondary },
  mChipOn: { backgroundColor: theme.colors.primary },
  mChipText: { fontSize: 12, color: theme.colors.textSecondary },
  mChipTextOn: { color: '#fff', fontWeight: '600' },
  checkScroll: { maxHeight: 140 },
  checkRow: { padding: 10, borderRadius: 8, marginBottom: 6, backgroundColor: theme.colors.backgroundSecondary },
  checkRowOn: { backgroundColor: '#e0f2fe' },
  savePay: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 16,
  },
  savePayText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelPay: { padding: 14, alignItems: 'center' },
});
