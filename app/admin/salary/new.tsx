import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { sendNotification } from '@/lib/notificationService';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const PAYMENT_TYPES = [
  { value: 'transfer', label: 'Havale / EFT' },
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
] as const;

type StaffOption = { id: string; full_name: string | null; department: string | null };

export default function AdminSalaryNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ staffId?: string }>();
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [staffId, setStaffId] = useState<string>(params.staffId ?? '');
  const [periodMonth, setPeriodMonth] = useState(() => new Date().getMonth() + 1);
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentTime, setPaymentTime] = useState('12:00');
  const [paymentType, setPaymentType] = useState<'transfer' | 'cash' | 'credit_card'>('transfer');
  const [bankOrReference, setBankOrReference] = useState('');
  const [description, setDescription] = useState('');
  const [sendNotif, setSendNotif] = useState(true);
  const [saving, setSaving] = useState(false);
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const loadStaff = useCallback(async () => {
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    let q = supabase
      .from('staff')
      .select('id, full_name, department')
      .eq('is_active', true)
      .order('full_name');
    if (orgId && orgId !== 'all') q = q.eq('organization_id', orgId);
    const { data } = await q;
    setStaffList((data ?? []) as StaffOption[]);
    if (params.staffId && !staffId) setStaffId(params.staffId);
  }, [canUseAllOrganizations, me?.organization_id, params.staffId, selectedOrganizationId, staffId]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const save = async () => {
    if (canUseAllOrganizations && selectedOrganizationId === 'all') {
      Alert.alert('Otel seçin', 'Maaş kaydı için tek bir otel seçmelisiniz.');
      return;
    }
    const num = parseFloat(amount.replace(/,/g, '.'));
    if (!staffId || !num || num <= 0) {
      Alert.alert('Eksik bilgi', 'Personel seçin ve geçerli maaş tutarı girin.');
      return;
    }
    if (!paymentDate) {
      Alert.alert('Eksik bilgi', 'Ödeme tarihi girin.');
      return;
    }
    setSaving(true);
    const { data: inserted, error } = await supabase
      .from('salary_payments')
      .insert({
        staff_id: staffId,
        organization_id: canUseAllOrganizations && selectedOrganizationId !== 'all'
          ? selectedOrganizationId
          : me?.organization_id ?? null,
        period_month: periodMonth,
        period_year: periodYear,
        amount: num,
        payment_date: paymentDate,
        payment_time: paymentTime || null,
        payment_type: paymentType,
        bank_or_reference: bankOrReference.trim() || null,
        description: description.trim() || null,
        status: 'pending_approval',
        created_by: me?.id ?? null,
      })
      .select('id')
      .single();

    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }

    if (sendNotif) {
      const staff = staffList.find((s) => s.id === staffId);
      const periodLabel = `${MONTH_NAMES[periodMonth - 1]} ${periodYear}`;
      await sendNotification({
        staffId,
        title: 'Maaşınız yatırıldı!',
        body: `Dönem: ${periodLabel}\nTutar: ${new Intl.NumberFormat('tr-TR').format(num)} ₺\nÖdeme tarihi: ${paymentDate}\n\nLütfen kontrol edip onaylayın.`,
        notificationType: 'salary_deposited',
        category: 'staff',
        data: { type: 'salary', paymentId: inserted?.id, screen: '/staff/salary' },
        createdByStaffId: me?.id ?? null,
      });
    }

    Alert.alert('Kaydedildi', 'Maaş kaydı oluşturuldu.' + (sendNotif ? ' Personel bilgilendirildi.' : ''), [
      { text: 'Tamam', onPress: () => router.replace('/admin/salary') },
    ]);
  };

  const selectedStaff = staffList.find((s) => s.id === staffId);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker
          canUseAll={canUseAllOrganizations}
          ownOrganizationId={me?.organization_id}
        />
        <Text style={styles.label}>Personel</Text>
        <View style={styles.pickerWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
            {staffList.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.pickerChip, staffId === s.id && styles.pickerChipActive]}
                onPress={() => setStaffId(s.id)}
              >
                <Text style={[styles.pickerChipText, staffId === s.id && styles.pickerChipTextActive]} numberOfLines={1}>
                  {s.full_name ?? '—'} ({s.department ?? '—'})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.label}>Dönem</Text>
        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.sublabel}>Ay</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.monthRow}>
                {MONTH_NAMES.map((_, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.monthChip, periodMonth === i + 1 && styles.monthChipActive]}
                    onPress={() => setPeriodMonth(i + 1)}
                  >
                    <Text style={[styles.monthChipText, periodMonth === i + 1 && styles.monthChipTextActive]}>{MONTH_NAMES[i]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.sublabel}>Yıl</Text>
          <TextInput
            style={styles.input}
            value={String(periodYear)}
            onChangeText={(t) => setPeriodYear(parseInt(t, 10) || new Date().getFullYear())}
            keyboardType="number-pad"
            placeholder="2026"
          />
        </View>

        <Text style={styles.label}>Maaş tutarı (₺)</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="18500"
        />

        <Text style={styles.label}>Ödeme tarihi</Text>
        <TextInput
          style={styles.input}
          value={paymentDate}
          onChangeText={setPaymentDate}
          placeholder="YYYY-MM-DD"
        />

        <Text style={styles.label}>Ödeme saati</Text>
        <TextInput style={styles.input} value={paymentTime} onChangeText={setPaymentTime} placeholder="14:30" />

        <Text style={styles.label}>Ödeme türü</Text>
        <View style={styles.radioGroup}>
          {PAYMENT_TYPES.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={styles.radioRow}
              onPress={() => setPaymentType(opt.value)}
            >
              <Ionicons name={paymentType === opt.value ? 'radio-button-on' : 'radio-button-off'} size={22} color={adminTheme.colors.accent} />
              <Text style={styles.radioLabel}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Banka / İşlem no</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bankOrReference}
          onChangeText={setBankOrReference}
          placeholder="Garanti Bankası - IBAN: TR12..."
          multiline
        />

        <Text style={styles.label}>Açıklama</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Şubat 2026 maaş ödemesi"
          multiline
        />

        <TouchableOpacity style={styles.checkRow} onPress={() => setSendNotif((v) => !v)}>
          <Ionicons name={sendNotif ? 'checkbox' : 'square-outline'} size={24} color={adminTheme.colors.accent} />
          <Text style={styles.checkLabel}>Kaydettikten sonra personel bildirimi gönder</Text>
        </TouchableOpacity>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => router.back()} disabled={saving}>
            <Text style={styles.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="notifications-outline" size={18} color="#fff" />
                <Text style={styles.saveBtnText}>Bildirim gönder & Kaydet</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>Kaydettikten sonra personele "Maaşınız yatırıldı" bildirimi gidecek.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 6 },
  sublabel: { fontSize: 12, color: adminTheme.colors.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.sm,
    padding: 12,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
    marginBottom: 16,
  },
  textArea: { minHeight: 60 },
  pickerWrap: { marginBottom: 16 },
  pickerScroll: { maxHeight: 44 },
  pickerChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  pickerChipActive: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  pickerChipText: { fontSize: 13, color: adminTheme.colors.text },
  pickerChipTextActive: { color: '#fff', fontWeight: '600' },
  row: { marginBottom: 12 },
  half: { flex: 1 },
  monthRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  monthChipActive: { backgroundColor: adminTheme.colors.accent, borderColor: adminTheme.colors.accent },
  monthChipText: { fontSize: 12, color: adminTheme.colors.text },
  monthChipTextActive: { color: '#fff', fontWeight: '600' },
  radioGroup: { marginBottom: 16 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  radioLabel: { fontSize: 14, color: adminTheme.colors.text },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  checkLabel: { fontSize: 14, color: adminTheme.colors.text, flex: 1 },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.textSecondary },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.accent,
  },
  saveBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  hint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 12 },
});
