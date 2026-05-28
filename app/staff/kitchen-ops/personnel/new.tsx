import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_PERSONNEL_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';

export default function KitchenPersonnelNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [staffName, setStaffName] = useState('');
  const [staffRole, setStaffRole] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<(typeof KITCHEN_PERSONNEL_PAYMENT_TYPES)[number]['value'] | ''>('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!staffName.trim() || !amt || !paymentType) {
      Alert.alert('Eksik', 'Personel adı, tutar ve ödeme türü zorunlu.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_personnel_payments').insert({
        organization_id: staff?.organization_id,
        staff_name: staffName.trim(),
        staff_role: staffRole.trim() || null,
        amount: amt,
        payment_type: paymentType,
        description: description.trim() || null,
        created_by: staff?.id,
      });
      if (error) throw error;
      Alert.alert('Tamam', 'Ödeme kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Personel adı *</Text>
      <TextInput style={styles.input} value={staffName} onChangeText={setStaffName} placeholder="Ad soyad" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Görev</Text>
      <TextInput style={styles.input} value={staffRole} onChangeText={setStaffRole} placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Tutar (₺) *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Ödeme türü *</Text>
      <KitchenChipSelect options={KITCHEN_PERSONNEL_PAYMENT_TYPES.map((p) => ({ value: p.value, label: p.label }))} value={paymentType} onChange={setPaymentType} />
      <Text style={styles.label}>Açıklama</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />
      <KitchenSaveButton label="Kaydet" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.colors.text },
});
