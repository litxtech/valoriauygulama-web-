import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { AdminSalaryStaffPickerSheet } from '@/components/admin/AdminSalaryStaffPickerSheet';
import { adminTheme } from '@/constants/adminTheme';
import { sendNotification } from '@/lib/notificationService';
import {
  createAdminSalaryPayment,
  fetchStaffSalaryMonthSnapshot,
  SALARY_ENTRY_KIND_HINTS,
  SALARY_ENTRY_KIND_LABELS,
  type SalaryEntryKind,
} from '@/lib/adminSalaryPayments';
import { formatSalaryMoney } from '@/lib/staffSalaryTracking';
import type { OrgStaffOption } from '@/lib/notificationTemplateRecipients';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const PAYMENT_TYPES = [
  { value: 'transfer' as const, label: 'Havale / EFT', icon: 'card-outline' as const },
  { value: 'cash' as const, label: 'Nakit', icon: 'cash-outline' as const },
  { value: 'credit_card' as const, label: 'Kredi Kartı', icon: 'wallet-outline' as const },
];
const ENTRY_KINDS: SalaryEntryKind[] = ['regular', 'bonus', 'early_partial'];

const ENTRY_ICONS: Record<SalaryEntryKind, keyof typeof Ionicons.glyphMap> = {
  regular: 'wallet',
  bonus: 'gift',
  early_partial: 'pie-chart',
};

export default function AdminSalaryPayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ staffId?: string; kind?: string }>();
  const me = useAuthStore((s) => s.staff);
  const { selectedOrganizationId } = useAdminOrgStore();

  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const effectiveOrgId =
    canUseAllOrganizations && selectedOrganizationId !== 'all'
      ? selectedOrganizationId
      : me?.organization_id ?? null;

  const [staffId, setStaffId] = useState(params.staffId ?? '');
  const [staffName, setStaffName] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [entryKind, setEntryKind] = useState<SalaryEntryKind>(
    params.kind === 'bonus' || params.kind === 'early_partial' ? params.kind : 'regular'
  );
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentTime, setPaymentTime] = useState('12:00');
  const [paymentType, setPaymentType] = useState<'transfer' | 'cash' | 'credit_card'>('transfer');
  const [bankOrReference, setBankOrReference] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [monthSnap, setMonthSnap] = useState({ approvedTotal: 0, pendingTotal: 0, paymentCount: 0 });
  const [snapLoading, setSnapLoading] = useState(false);

  useEffect(() => {
    if (!params.staffId || staffName) return;
    void supabase
      .from('staff')
      .select('id, full_name')
      .eq('id', params.staffId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setStaffId(data.id);
        setStaffName((data.full_name ?? 'Personel').trim());
      });
  }, [params.staffId, staffName]);

  const onStaffPicked = useCallback((picked: OrgStaffOption | null) => {
    if (!picked) {
      setStaffId('');
      setStaffName(null);
      return;
    }
    setStaffId(picked.id);
    setStaffName((picked.full_name ?? 'Personel').trim());
  }, []);

  useEffect(() => {
    if (!staffId) {
      setMonthSnap({ approvedTotal: 0, pendingTotal: 0, paymentCount: 0 });
      return;
    }
    let cancelled = false;
    setSnapLoading(true);
    void fetchStaffSalaryMonthSnapshot(staffId, periodYear, periodMonth).then((snap) => {
      if (!cancelled) {
        setMonthSnap(snap);
        setSnapLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [staffId, periodMonth, periodYear]);

  const defaultDescription = useMemo(() => {
    const period = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
    if (entryKind === 'bonus') return `${period} ek ödeme / prim`;
    if (entryKind === 'early_partial') return `${period} erken parçalı maaş ödemesi`;
    return `${period} maaş ödemesi`;
  }, [entryKind, periodMonth, periodYear]);

  const save = async () => {
    if (canUseAllOrganizations && selectedOrganizationId === 'all') {
      Alert.alert('Otel seçin', 'Maaş ödemesi için tek bir otel seçmelisiniz.');
      return;
    }
    const num = parseFloat(amount.replace(/,/g, '.'));
    if (!staffId || !num || num <= 0) {
      Alert.alert('Eksik bilgi', 'Personel seçin ve geçerli tutar girin.');
      return;
    }
    if (!paymentDate) {
      Alert.alert('Eksik bilgi', 'Ödeme tarihi girin.');
      return;
    }

    setSaving(true);
    const { id, error } = await createAdminSalaryPayment({
      staffId,
      periodMonth,
      periodYear,
      amount: num,
      paymentDate,
      paymentTime: paymentTime || null,
      paymentType,
      bankOrReference: bankOrReference.trim() || null,
      description: (description.trim() || defaultDescription).trim(),
      entryKind,
      createdByStaffId: me?.id ?? null,
    });
    setSaving(false);

    if (error || !id) {
      Alert.alert('Kayıt yapılamadı', error ?? 'Bilinmeyen hata');
      return;
    }

    const periodLabel = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
    const kindLabel = SALARY_ENTRY_KIND_LABELS[entryKind];
    await sendNotification({
      staffId,
      title: entryKind === 'regular' ? 'Maaşınız yatırıldı!' : 'Ödeme bildirimi',
      body: `${kindLabel}\nDönem: ${periodLabel}\nTutar: ${formatSalaryMoney(num)}\nTarih: ${paymentDate}\n\nMaaş takibinden kontrol edip onaylayın.`,
      notificationType: 'salary_deposited',
      category: 'staff',
      data: { type: 'salary', paymentId: id, screen: '/staff/salary-history' },
      createdByStaffId: me?.id ?? null,
    }).catch(() => {});

    Alert.alert('Ödeme kaydedildi', 'Personele bildirim gönderildi.', [
      { text: 'Yeni ödeme', onPress: () => { setAmount(''); setDescription(''); } },
      { text: 'Listeye dön', onPress: () => router.replace('/admin/salary') },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient colors={['#065F46', '#059669', '#10B981']} style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="wallet" size={28} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>Maaş Öde</Text>
          <Text style={styles.heroSub}>Personel seçin, ödeme türünü belirleyin ve kaydedin.</Text>
        </LinearGradient>

        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={me?.organization_id} />

        <Text style={styles.label}>Personel</Text>
        <TouchableOpacity style={styles.staffPickBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
          <Ionicons name="person-circle-outline" size={22} color={adminTheme.colors.accent} />
          <Text style={styles.staffPickText} numberOfLines={1}>
            {staffName ?? 'Personel seçin…'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        {staffId ? (
          <View style={styles.snapCard}>
            <Text style={styles.snapTitle}>
              {MONTH_NAMES[periodMonth - 1]} {periodYear} özeti
            </Text>
            {snapLoading ? (
              <ActivityIndicator color={adminTheme.colors.accent} size="small" />
            ) : (
              <View style={styles.snapRow}>
                <View style={styles.snapItem}>
                  <Text style={styles.snapVal}>{formatSalaryMoney(monthSnap.approvedTotal)}</Text>
                  <Text style={styles.snapLbl}>Onaylı</Text>
                </View>
                <View style={styles.snapItem}>
                  <Text style={styles.snapVal}>{formatSalaryMoney(monthSnap.pendingTotal)}</Text>
                  <Text style={styles.snapLbl}>Bekleyen</Text>
                </View>
                <View style={styles.snapItem}>
                  <Text style={styles.snapVal}>{monthSnap.paymentCount}</Text>
                  <Text style={styles.snapLbl}>Kayıt</Text>
                </View>
              </View>
            )}
          </View>
        ) : null}

        <Text style={styles.label}>Ödeme türü</Text>
        <View style={styles.kindRow}>
          {ENTRY_KINDS.map((kind) => {
            const on = entryKind === kind;
            return (
              <TouchableOpacity
                key={kind}
                style={[styles.kindChip, on && styles.kindChipOn]}
                onPress={() => setEntryKind(kind)}
                activeOpacity={0.85}
              >
                <Ionicons name={ENTRY_ICONS[kind]} size={18} color={on ? '#fff' : '#059669'} />
                <Text style={[styles.kindChipText, on && styles.kindChipTextOn]} numberOfLines={2}>
                  {SALARY_ENTRY_KIND_LABELS[kind]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.hint}>{SALARY_ENTRY_KIND_HINTS[entryKind]}</Text>

        <Text style={styles.label}>Dönem</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
          {MONTH_NAMES.map((name, i) => {
            const m = i + 1;
            const on = periodMonth === m;
            return (
              <TouchableOpacity
                key={name}
                style={[styles.monthChip, on && styles.monthChipOn]}
                onPress={() => setPeriodMonth(m)}
              >
                <Text style={[styles.monthChipText, on && styles.monthChipTextOn]}>{name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TextInput
          style={styles.input}
          value={String(periodYear)}
          onChangeText={(t) => setPeriodYear(parseInt(t, 10) || new Date().getFullYear())}
          keyboardType="number-pad"
          placeholder="Yıl"
        />

        <Text style={styles.label}>Tutar (₺)</Text>
        <TextInput
          style={[styles.input, styles.amountInput]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0"
        />

        <Text style={styles.label}>Ödeme tarihi / saati</Text>
        <View style={styles.row2}>
          <TextInput style={[styles.input, styles.half]} value={paymentDate} onChangeText={setPaymentDate} placeholder="YYYY-MM-DD" />
          <TextInput style={[styles.input, styles.half]} value={paymentTime} onChangeText={setPaymentTime} placeholder="12:00" />
        </View>

        <Text style={styles.label}>Ödeme yöntemi</Text>
        <View style={styles.payTypeRow}>
          {PAYMENT_TYPES.map((opt) => {
            const on = paymentType === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.payTypeChip, on && styles.payTypeChipOn]}
                onPress={() => setPaymentType(opt.value)}
              >
                <Ionicons name={opt.icon} size={16} color={on ? '#fff' : adminTheme.colors.text} />
                <Text style={[styles.payTypeText, on && styles.payTypeTextOn]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.label}>Banka / referans</Text>
        <TextInput
          style={styles.input}
          value={bankOrReference}
          onChangeText={setBankOrReference}
          placeholder="IBAN, dekont no…"
        />

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder={defaultDescription}
          multiline
        />

        <TouchableOpacity style={styles.saveBtn} onPress={() => void save()} disabled={saving} activeOpacity={0.88}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Kaydet ve personele bildir</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <AdminSalaryStaffPickerSheet
        visible={pickerOpen}
        organizationId={effectiveOrgId}
        selectedStaffId={staffId || null}
        onSelect={onStaffPicked}
        onClose={() => setPickerOpen(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16 },
  hero: { borderRadius: 20, padding: 18, marginBottom: 16 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },
  heroSub: { marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8, marginTop: 4 },
  staffPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  staffPickText: { flex: 1, fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  snapCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 12,
  },
  snapTitle: { fontSize: 13, fontWeight: '700', color: '#047857', marginBottom: 10 },
  snapRow: { flexDirection: 'row', gap: 8 },
  snapItem: { flex: 1, alignItems: 'center' },
  snapVal: { fontSize: 15, fontWeight: '800', color: '#065F46' },
  snapLbl: { fontSize: 11, color: '#059669', marginTop: 2 },
  kindRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  kindChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kindChipOn: { backgroundColor: '#059669', borderColor: '#059669' },
  kindChipText: { fontSize: 11, fontWeight: '700', color: '#047857', textAlign: 'center' },
  kindChipTextOn: { color: '#fff' },
  hint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 12 },
  monthScroll: { marginBottom: 8, maxHeight: 44 },
  monthChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  monthChipOn: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  monthChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  monthChipTextOn: { color: '#fff' },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
    marginBottom: 12,
  },
  amountInput: { fontSize: 22, fontWeight: '800' },
  row2: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  payTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  payTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  payTypeChipOn: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  payTypeText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  payTypeTextOn: { color: '#fff' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
