import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';

export default function KitchenSupplierNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [supplierName, setSupplierName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!supplierName.trim() || !amt) {
      Alert.alert('Eksik', 'Tedarikçi adı ve tutar zorunlu.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_supplier_debts').insert({
        organization_id: staff?.organization_id,
        supplier_name: supplierName.trim(),
        amount: amt,
        due_date: dueDate.trim() || null,
        description: description.trim() || null,
        status: 'pending',
        created_by: staff?.id,
      });
      if (error) throw error;
      Alert.alert('Tamam', 'Borç kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Tedarikçi *</Text>
      <TextInput style={styles.input} value={supplierName} onChangeText={setSupplierName} placeholder="Kasap, sebzeci..." placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Tutar (₺) *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Vade tarihi (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="2026-06-01" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" />
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
