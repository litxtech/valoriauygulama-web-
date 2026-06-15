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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { FinanceMovementReceiptActionsById } from '@/components/admin/FinanceMovementReceiptActionsById';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import {
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  LEDGER_SCOPE_LABELS,
  type FinanceMovementKind,
  type FinanceLedgerScope,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';

const PAY_METHODS: MovementPaymentMethod[] = ['cash', 'transfer', 'card', 'check', 'other'];

export default function AccountingMovementEdit() {
  const { id, returnCounterpartyId } = useLocalSearchParams<{
    id: string;
    returnCounterpartyId?: string;
  }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [counterpartyLabel, setCounterpartyLabel] = useState('');
  const [stripeLocked, setStripeLocked] = useState(false);
  const [kind, setKind] = useState<FinanceMovementKind>('expense');
  const [amount, setAmount] = useState('');
  const [movementDate, setMovementDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<MovementPaymentMethod>('cash');
  const [category, setCategory] = useState('other');
  const [ledgerScope, setLedgerScope] = useState<FinanceLedgerScope>('hotel');
  const [description, setDescription] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);

  const goBack = useCallback(() => {
    if (returnCounterpartyId) {
      router.replace({
        pathname: '/admin/accounting/counterparties/[id]',
        params: { id: returnCounterpartyId },
      } as never);
      return;
    }
    router.back();
  }, [returnCounterpartyId, router]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('finance_movements')
        .select(
          `
          id,
          organization_id,
          kind,
          amount,
          movement_date,
          payment_method,
          category,
          description,
          ledger_scope,
          source_payment_request_id,
          counterparty:counterparty_id(name),
          counterparty_name,
          guest:guest_id(full_name)
        `
        )
        .eq('id', id)
        .single();

      if (error || !data) {
        setLoading(false);
        Alert.alert('Hata', 'Kayıt bulunamadı.');
        goBack();
        return;
      }

      const row = data as {
        organization_id: string;
        kind: FinanceMovementKind;
        amount: number;
        movement_date: string;
        payment_method: MovementPaymentMethod;
        category: string;
        description: string | null;
        ledger_scope?: FinanceLedgerScope | null;
        source_payment_request_id?: string | null;
        counterparty?: { name: string } | null;
        counterparty_name?: string | null;
        guest?: { full_name: string | null } | null;
      };

      setOrgId(row.organization_id);
      setStripeLocked(!!row.source_payment_request_id);
      setKind(row.kind);
      setAmount(String(row.amount));
      setMovementDate(row.movement_date);
      setPaymentMethod(row.payment_method);
      setCategory(row.category);
      setLedgerScope(row.ledger_scope === 'personal' ? 'personal' : 'hotel');
      setDescription(row.description?.trim() ?? '');
      setCounterpartyLabel(
        row.guest?.full_name?.trim() ||
          row.counterparty?.name?.trim() ||
          row.counterparty_name?.trim() ||
          '—'
      );

      const opts = await loadMovementCategories(row.organization_id, row.kind);
      setCategoryOptions(opts);
      setLoading(false);
    })();
  }, [id, goBack]);

  useEffect(() => {
    if (!orgId) return;
    loadMovementCategories(orgId, kind).then((opts) => {
      setCategoryOptions(opts);
      if (opts.length && !opts.some((o) => o.code === category)) {
        setCategory(opts[0].code);
      }
    });
  }, [orgId, kind]);

  const save = async () => {
    if (!id || !me?.id) return;
    const a = parseFloat(amount.replace(',', '.'));
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Form', 'Geçerli tutar girin.');
      return;
    }
    setSaving(true);
    const patch: Record<string, unknown> = {
      kind,
      amount: a,
      movement_date: movementDate,
      payment_method: paymentMethod,
      category,
      description: description.trim(),
      ledger_scope: ledgerScope,
      updated_by_staff_id: me.id,
    };
    const { error } = await supabase.from('finance_movements').update(patch).eq('id', id);
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    if (orgId) invalidateCounterpartyBalanceCache(orgId);
    Alert.alert('Tamam', 'Kayıt güncellendi.', [{ text: 'Tamam', onPress: goBack }]);
  };

  const deleteRow = () => {
    Alert.alert('Sil', 'Bu ödeme / tahsilat kaydı silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('finance_movements').delete().eq('id', id);
          if (error) {
            Alert.alert('Hata', error.message);
            return;
          }
          if (orgId) invalidateCounterpartyBalanceCache(orgId);
          goBack();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>Kişi: {counterpartyLabel}</Text>
      {stripeLocked ? (
        <AdminCard style={styles.warn}>
          <Text style={styles.warnText}>
            Stripe bağlantılı kayıt — tutar ve ödeme tipi dikkatli değiştirilmeli.
          </Text>
        </AdminCard>
      ) : null}

      <AdminCard>
        <Text style={styles.label}>Tür</Text>
        <View style={styles.row}>
          {(['expense', 'income'] as FinanceMovementKind[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.opt, kind === k && (k === 'income' ? styles.optIn : styles.optOut)]}
              onPress={() => setKind(k)}
            >
              <Text style={[styles.optText, kind === k && styles.optTextOn]}>{MOVEMENT_KIND_LABELS[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Tutar (₺)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />

        <Text style={styles.label}>Tarih</Text>
        <TextInput style={styles.input} value={movementDate} onChangeText={setMovementDate} placeholder="YYYY-MM-DD" />

        <Text style={styles.label}>Kayıt türü</Text>
        <View style={styles.row}>
          {(['hotel', 'personal'] as FinanceLedgerScope[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.opt, ledgerScope === s && styles.optScope]}
              onPress={() => setLedgerScope(s)}
            >
              <Text style={[styles.optText, ledgerScope === s && styles.optTextOn]}>
                {LEDGER_SCOPE_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Ödeme şekli</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tags}>
          {PAY_METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.tag, paymentMethod === m && styles.tagOn]}
              onPress={() => setPaymentMethod(m)}
            >
              <Text style={[styles.tagText, paymentMethod === m && styles.tagTextOn]}>
                {PAYMENT_METHOD_LABELS[m]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tags}>
          {categoryOptions.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.tag, category === c.code && styles.tagOn]}
              onPress={() => setCategory(c.code)}
            >
              <Text style={[styles.tagText, category === c.code && styles.tagTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={description}
          onChangeText={setDescription}
          multiline
          placeholder="Not"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </AdminCard>

      {id && kind === 'expense' ? (
        <FinanceMovementReceiptActionsById movementId={id} compact={false} />
      ) : null}

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.delBtn} onPress={deleteRow}>
        <Ionicons name="trash-outline" size={18} color="#dc2626" />
        <Text style={styles.delBtnText}>Kaydı sil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  lead: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  warn: { marginBottom: 12, backgroundColor: '#fef3c7' },
  warnText: { fontSize: 13, color: '#92400e', lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 8, marginTop: 8 },
  input: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  area: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  opt: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  optIn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  optOut: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  optScope: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  optText: { fontWeight: '600', color: adminTheme.colors.text },
  optTextOn: { color: '#fff' },
  tags: { marginBottom: 8 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  tagOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tagText: { fontSize: 12, color: adminTheme.colors.text },
  tagTextOn: { color: '#fff', fontWeight: '600' },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    padding: 14,
  },
  delBtnText: { color: '#dc2626', fontWeight: '600' },
});
