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
import { AdminStackBackButton } from '@/lib/adminStackBack';
import {
  createAdminSalaryPayment,
  fetchStaffSalaryMonthSnapshot,
  SALARY_ENTRY_KIND_HINTS,
  SALARY_ENTRY_KIND_LABELS,
  type SalaryEntryKind,
} from '@/lib/adminSalaryPayments';
import { formatSalaryMoney } from '@/lib/staffSalaryTracking';
import type { OrgStaffOption } from '@/lib/notificationTemplateRecipients';
import { counterpartyInitials, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';

const MONTH_NAMES = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];
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
const HERO_GRAD = ['#0f172a', '#1e3a5f'] as const;
const PAY_GRAD = ['#dc2626', '#b91c1c'] as const;
const QUICK_AMOUNTS = [1000, 2500, 5000, 10000, 15000, 25000] as const;

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

  const staffMeta = resolveCounterpartyTypeMeta('staff');

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

  const appendQuickAmount = (value: number) => {
    const cur = parseFloat(amount.replace(',', '.')) || 0;
    setAmount(String(cur + value));
  };

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
      {
        text: 'Yeni ödeme',
        onPress: () => {
          setAmount('');
          setDescription('');
        },
      },
      { text: 'Listeye dön', onPress: () => router.replace('/admin/salary') },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={[...HERO_GRAD]} style={[styles.heroBar, { paddingTop: insets.top + 8 }]}>
        <AdminStackBackButton tintColor="#fff" fallback="/admin/salary" />
        <View style={styles.heroTitleWrap}>
          <Text style={styles.heroTitle} numberOfLines={1}>
            Maaş öde
          </Text>
          <Text style={styles.heroSub} numberOfLines={1}>
            Personel seçin · tutar girin · kaydedin
          </Text>
        </View>
        <TouchableOpacity
          style={styles.heroIconBtn}
          onPress={() => router.push('/admin/salary/all')}
          accessibilityLabel="Tüm ödemeler"
        >
          <Ionicons name="list-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={me?.organization_id} />

        <Text style={styles.label}>Personel</Text>
        <TouchableOpacity style={styles.staffPickBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
          {staffName ? (
            <View style={[styles.staffAvatar, { backgroundColor: staffMeta.bg }]}>
              <Text style={[styles.staffAvatarText, { color: staffMeta.color }]}>
                {counterpartyInitials(staffName)}
              </Text>
            </View>
          ) : (
            <Ionicons name="person-circle-outline" size={22} color={adminTheme.colors.accent} />
          )}
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
                  <Text style={[styles.snapVal, styles.snapValPending]}>
                    {formatSalaryMoney(monthSnap.pendingTotal)}
                  </Text>
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
                <Ionicons name={ENTRY_ICONS[kind]} size={18} color={on ? '#fff' : '#0f172a'} />
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

        <LinearGradient colors={['#fff7ed', '#ffffff']} style={styles.amountHero}>
          <Text style={styles.amountLbl}>Tutar (₺)</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amountCurrency}>₺</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#cbd5e1"
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickAmtScroll}
            keyboardShouldPersistTaps="handled"
          >
            <TouchableOpacity
              style={styles.quickAmtClear}
              onPress={() => setAmount('')}
              hitSlop={6}
            >
              <Ionicons name="backspace-outline" size={14} color={adminTheme.colors.textMuted} />
              <Text style={styles.quickAmtClearText}>Temizle</Text>
            </TouchableOpacity>
            {QUICK_AMOUNTS.map((v) => (
              <TouchableOpacity key={v} style={styles.quickAmtChip} onPress={() => appendQuickAmount(v)}>
                <Text style={styles.quickAmtText}>+{v.toLocaleString('tr-TR')}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </LinearGradient>

        <Text style={styles.label}>Ödeme tarihi / saati</Text>
        <View style={styles.row2}>
          <TextInput
            style={[styles.input, styles.half]}
            value={paymentDate}
            onChangeText={setPaymentDate}
            placeholder="YYYY-MM-DD"
          />
          <TextInput
            style={[styles.input, styles.half]}
            value={paymentTime}
            onChangeText={setPaymentTime}
            placeholder="12:00"
          />
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

        <TouchableOpacity onPress={() => void save()} disabled={saving} activeOpacity={0.9}>
          <LinearGradient colors={[...PAY_GRAD]} style={styles.saveBtn}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="flash" size={20} color="#fff" />
                <Text style={styles.saveBtnText}>Kaydet ve personele bildir</Text>
              </>
            )}
          </LinearGradient>
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
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
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
  container: { flex: 1 },
  content: { padding: 16 },
  label: {
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  staffPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
    marginBottom: 12,
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: { fontSize: 13, fontWeight: '800' },
  staffPickText: { flex: 1, fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  snapCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  snapTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 10 },
  snapRow: { flexDirection: 'row', gap: 8 },
  snapItem: { flex: 1, alignItems: 'center' },
  snapVal: { fontSize: 14, fontWeight: '800', color: '#16a34a' },
  snapValPending: { color: '#b45309' },
  snapLbl: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
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
    borderColor: adminTheme.colors.border,
  },
  kindChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  kindChipText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, textAlign: 'center' },
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
  monthChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
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
  payTypeChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  payTypeText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  payTypeTextOn: { color: '#fff' },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
    ...adminTheme.shadow.md,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
