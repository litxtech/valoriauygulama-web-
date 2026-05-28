import { useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_PAYMENT_TYPES } from '@/lib/kitchenOps/constants';

export default function KitchenRevenueNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<(typeof KITCHEN_PAYMENT_TYPES)[number]['value'] | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!description.trim() || !amt || amt <= 0 || !paymentType) {
      Alert.alert('Eksik', 'Açıklama, tutar ve ödeme tipi zorunlu.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_revenues').insert({
        organization_id: staff?.organization_id,
        description: description.trim(),
        amount: amt,
        payment_type: paymentType,
        note: note.trim() || null,
        created_by: staff?.id,
      });
      if (error) throw error;

      if (paymentType === 'otel_pos') {
        await supabase.from('kitchen_pos_transactions').insert({
          organization_id: staff?.organization_id,
          amount: amt,
          net_amount: amt,
          description: description.trim(),
          created_by: staff?.id,
        });
      }
      if (paymentType === 'otel_hesabi') {
        await supabase.from('kitchen_cari_ledger').insert({
          organization_id: staff?.organization_id,
          direction: 'kitchen_owes_hotel',
          category: 'hasilat',
          amount: amt,
          description: description.trim(),
          created_by: staff?.id,
        });
      }

      Alert.alert('Tamam', 'Hasılat kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Açıklama *</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Restoran satışı, grup yemeği..." placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Tutar (₺) *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Ödeme tipi *</Text>
      <KitchenChipSelect
        options={KITCHEN_PAYMENT_TYPES.map((p) => ({ value: p.value, label: p.label }))}
        value={paymentType}
        onChange={(v) => setPaymentType(v)}
      />

      <Text style={styles.label}>Not</Text>
      <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} multiline placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <KitchenSaveButton label="Kaydet" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
