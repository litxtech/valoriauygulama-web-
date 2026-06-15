import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import {
  fmtMoneyTry,
  PAYMENT_METHOD_LABELS,
  notifyDebtPaymentParties,
  type DebtPaymentMethod,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import {
  DEBT_CATEGORY_META,
  DEBT_STATUS_META,
  DEBT_TONE_STYLES,
  debtPaidPercent,
  debtPartyBorrow,
  debtPartyLend,
  debtRowPerspective,
  formatDebtPaidLine,
  isDebtOverdue,
  type DebtListRow,
} from '@/lib/debtUi';

type PayRow = {
  id: string;
  amount: number;
  payment_method: DebtPaymentMethod;
  paid_at: string;
  notes: string | null;
  finance_check_id: string | null;
};

const PAY_METHODS: DebtPaymentMethod[] = ['cash', 'transfer', 'card', 'check', 'other'];

export default function AdminDebtDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [debt, setDebt] = useState<DebtListRow | null>(null);
  const [payments, setPayments] = useState<PayRow[]>([]);
  const [checks, setChecks] = useState<{ id: string; counterparty_name: string; amount: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<DebtPaymentMethod>('cash');
  const [payNote, setPayNote] = useState('');
  const [payCheckId, setPayCheckId] = useState<string | null>(null);
  const [savingPay, setSavingPay] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
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
      setDebt(null);
      setLoading(false);
      return;
    }
    const debtRow = d as unknown as DebtListRow;
    setDebt(debtRow);

    const { data: p } = await supabase
      .from('staff_debt_payments')
      .select('id, amount, payment_method, paid_at, notes, finance_check_id')
      .eq('debt_entry_id', id)
      .order('paid_at', { ascending: false });
    setPayments((p as PayRow[]) ?? []);

    if (debtRow.organization_id) {
      const { data: c } = await supabase
        .from('finance_checks')
        .select('id, counterparty_name, amount')
        .eq('organization_id', debtRow.organization_id)
        .not('status', 'eq', 'paid')
        .not('status', 'eq', 'bounced')
        .not('status', 'eq', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(40);
      setChecks(((c ?? []) as { id: string; counterparty_name: string; amount: number }[]) ?? []);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const perspective = useMemo(() => (debt ? debtRowPerspective(debt) : null), [debt]);
  const pct = debt ? debtPaidPercent(debt.amount_principal, debt.amount_remaining) : 0;

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
      Alert.alert('Ödeme', error.message);
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

  const removeDebt = () => {
    Alert.alert('Sil', 'Borç kaydı ve ödemeler silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await supabase.from('staff_debt_entries').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else router.back();
        },
      },
    ]);
  };

  if (loading || !debt || !perspective) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const catMeta = DEBT_CATEGORY_META[debt.category];
  const stMeta = DEBT_STATUS_META[debt.status];
  const toneStyle = DEBT_TONE_STYLES[perspective.tone];
  const overdue = isDebtOverdue(debt.due_date, debt.status);

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderLeftColor: toneStyle.stripe }]}>
          <View style={styles.heroTop}>
            <View style={[styles.toneBadge, { backgroundColor: toneStyle.pillBg }]}>
              <Ionicons name={toneStyle.icon} size={18} color={toneStyle.pillFg} />
              <Text style={[styles.toneBadgeText, { color: toneStyle.pillFg }]}>
                {perspective.tone === 'receivable'
                  ? 'Alacak'
                  : perspective.tone === 'payable'
                    ? 'Borç'
                    : 'Personel'}
              </Text>
            </View>
            <View style={[styles.stBadge, { backgroundColor: stMeta.bg }]}>
              <Ionicons name={stMeta.icon} size={14} color={stMeta.color} />
              <Text style={[styles.stBadgeText, { color: stMeta.color }]}>{stMeta.label}</Text>
            </View>
          </View>

          <Text style={styles.heroLine}>{perspective.line}</Text>

          <Text style={styles.remLabel}>Kalan</Text>
          <Text style={styles.remVal}>{fmtMoneyTry(Number(debt.amount_remaining))}</Text>

          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: toneStyle.stripe }]} />
          </View>
          <Text style={styles.paidMeta}>{formatDebtPaidLine(debt.amount_principal, debt.amount_remaining)}</Text>

          {overdue ? (
            <View style={styles.overdueBanner}>
              <Ionicons name="alert-circle" size={16} color="#b45309" />
              <Text style={styles.overdueText}>Vade geçti · {formatDateShort(debt.due_date!)}</Text>
            </View>
          ) : debt.due_date ? (
            <Text style={styles.dueLine}>Vade: {formatDateShort(debt.due_date)}</Text>
          ) : null}
        </View>

        <View style={styles.flowCard}>
          <View style={styles.flowCol}>
            <Text style={styles.flowLbl}>Borçlu</Text>
            <Ionicons name="person-circle-outline" size={28} color={adminTheme.colors.primary} />
            <Text style={styles.flowName} numberOfLines={2}>
              {debtPartyBorrow(debt)}
            </Text>
          </View>
          <View style={styles.flowMid}>
            <Ionicons name="arrow-forward" size={24} color={adminTheme.colors.textMuted} />
            <Text style={styles.flowAmt}>{fmtMoneyTry(Number(debt.amount_principal))}</Text>
          </View>
          <View style={styles.flowCol}>
            <Text style={styles.flowLbl}>Alacaklı</Text>
            <Ionicons name="wallet-outline" size={28} color={adminTheme.colors.accent} />
            <Text style={styles.flowName} numberOfLines={2}>
              {debtPartyLend(debt)}
            </Text>
          </View>
        </View>

        <View style={styles.metaCard}>
          <View style={[styles.catRow, { backgroundColor: catMeta.bg }]}>
            <Ionicons name={catMeta.icon} size={16} color={catMeta.color} />
            <Text style={[styles.catText, { color: catMeta.color }]}>{catMeta.label}</Text>
          </View>
          {debt.description?.trim() ? (
            <Text style={styles.desc}>{debt.description.trim()}</Text>
          ) : null}
          <Text style={styles.createdMeta}>Kayıt · {formatDateShort(debt.created_at)}</Text>
        </View>

        {debt.status !== 'closed' ? (
          <TouchableOpacity style={styles.payBtn} onPress={() => setPayOpen(true)} activeOpacity={0.9}>
            <Ionicons name="add-circle" size={24} color="#fff" />
            <Text style={styles.payBtnText}>Ödeme ekle</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.closedBanner}>
            <Ionicons name="checkmark-circle" size={20} color="#15803d" />
            <Text style={styles.closedText}>Bu kayıt kapatıldı</Text>
          </View>
        )}

        <Text style={styles.secTitle}>Ödeme geçmişi</Text>
        {payments.length === 0 ? (
          <View style={styles.emptyPay}>
            <Text style={styles.emptyPayText}>Henüz ödeme yok. Kısmi ödemeler kalanı otomatik düşürür.</Text>
          </View>
        ) : (
          payments.map((p, idx) => (
            <View key={p.id} style={styles.timelineItem}>
              <View style={styles.timelineDotCol}>
                <View style={styles.timelineDot} />
                {idx < payments.length - 1 ? <View style={styles.timelineLine} /> : null}
              </View>
              <View style={styles.timelineBody}>
                <Text style={styles.payAmt}>−{fmtMoneyTry(Number(p.amount))}</Text>
                <Text style={styles.payMeta}>
                  {PAYMENT_METHOD_LABELS[p.payment_method]} · {formatDateShort(p.paid_at)}
                </Text>
                {p.notes ? <Text style={styles.payNote}>{p.notes}</Text> : null}
                {p.finance_check_id ? (
                  <Text style={styles.payCheck}>Çek kaydına bağlı</Text>
                ) : null}
              </View>
            </View>
          ))
        )}

        {me?.role === 'admin' ? (
          <TouchableOpacity style={styles.delBtn} onPress={removeDebt}>
            <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
            <Text style={styles.delText}>Kaydı sil</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal visible={payOpen} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => !savingPay && setPayOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Ödeme ekle</Text>
            <Text style={styles.modalSub}>
              Kalan {fmtMoneyTry(Number(debt.amount_remaining))} — tutar otomatik düşer
            </Text>

            <TouchableOpacity
              style={styles.quickFill}
              onPress={() => setPayAmount(String(debt.amount_remaining))}
            >
              <Text style={styles.quickFillText}>Tamamını öde</Text>
            </TouchableOpacity>

            <Text style={styles.label}>Tutar (₺)</Text>
            <TextInput
              style={styles.input}
              value={payAmount}
              onChangeText={setPayAmount}
              keyboardType="decimal-pad"
              placeholder="0"
            />

            <Text style={styles.label}>Ödeme şekli</Text>
            <View style={styles.methods}>
              {PAY_METHODS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.mChip, payMethod === m && styles.mChipOn]}
                  onPress={() => setPayMethod(m)}
                >
                  <Text style={[styles.mChipText, payMethod === m && styles.mChipTextOn]}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </Text>
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
              {savingPay ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.savePayText}>Kaydet</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelPay} onPress={() => setPayOpen(false)} disabled={savingPay}>
              <Text style={styles.cancelPayText}>İptal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderLeftWidth: 5,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  toneBadgeText: { fontSize: 13, fontWeight: '800' },
  stBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stBadgeText: { fontSize: 11, fontWeight: '700' },
  heroLine: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 12 },
  remLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 14, fontWeight: '600' },
  remVal: { fontSize: 32, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  progressTrack: {
    height: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: 4,
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  paidMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8, fontWeight: '600' },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.warningLight,
  },
  overdueText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.warning },
  dueLine: { fontSize: 13, color: adminTheme.colors.info, marginTop: 10, fontWeight: '600' },
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  flowCol: { flex: 1, alignItems: 'center', gap: 6 },
  flowLbl: { fontSize: 10, fontWeight: '700', color: adminTheme.colors.textMuted, textTransform: 'uppercase' },
  flowName: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text, textAlign: 'center' },
  flowMid: { alignItems: 'center', paddingHorizontal: 8 },
  flowAmt: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.accent, marginTop: 4 },
  metaCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  catText: { fontSize: 12, fontWeight: '700' },
  desc: { fontSize: 14, color: adminTheme.colors.text, marginTop: 12, lineHeight: 20 },
  createdMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 10 },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 16,
  },
  payBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  closedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#dcfce7',
    marginBottom: 16,
  },
  closedText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  secTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 12 },
  emptyPay: {
    padding: 16,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  emptyPayText: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center' },
  timelineItem: { flexDirection: 'row', marginBottom: 4 },
  timelineDotCol: { width: 24, alignItems: 'center' },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: adminTheme.colors.accent,
    marginTop: 6,
  },
  timelineLine: { flex: 1, width: 2, backgroundColor: adminTheme.colors.border, marginVertical: 4 },
  timelineBody: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  payAmt: { fontSize: 17, fontWeight: '800', color: '#dc2626' },
  payMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  payNote: { fontSize: 13, color: adminTheme.colors.text, marginTop: 6 },
  payCheck: { fontSize: 11, color: adminTheme.colors.info, marginTop: 4, fontWeight: '700' },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    marginTop: 8,
  },
  delText: { color: adminTheme.colors.error, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
    maxHeight: '88%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  modalSub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  quickFill: {
    alignSelf: 'flex-start',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  quickFillText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  label: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  ta: { minHeight: 72, textAlignVertical: 'top' },
  methods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  mChip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  mChipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  mChipText: { fontSize: 12, color: adminTheme.colors.textSecondary, fontWeight: '600' },
  mChipTextOn: { color: '#fff' },
  checkScroll: { maxHeight: 120, marginBottom: 8 },
  checkRow: {
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  checkRowOn: { backgroundColor: adminTheme.colors.infoLight, borderWidth: 1, borderColor: adminTheme.colors.info },
  savePay: {
    backgroundColor: adminTheme.colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  savePayText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelPay: { padding: 14, alignItems: 'center' },
  cancelPayText: { fontSize: 15, color: adminTheme.colors.textMuted, fontWeight: '600' },
});
