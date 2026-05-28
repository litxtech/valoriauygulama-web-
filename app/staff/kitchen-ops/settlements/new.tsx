import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';

export default function KitchenSettlementNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [payer, setPayer] = useState('');
  const [payee, setPayee] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('nakit');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!amt) {
      Alert.alert('Eksik', 'Tutar zorunlu.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_settlements').insert({
        organization_id: staff?.organization_id,
        payer_name: payer.trim() || null,
        payee_name: payee.trim() || null,
        amount: amt,
        method,
        description: description.trim() || null,
        handover_from: staff?.id,
        handover_at: method === 'nakit' ? new Date().toISOString() : null,
        status: 'pending',
        created_by: staff?.id,
      });
      if (error) throw error;
      Alert.alert('Tamam', 'Ödeme kaydı oluşturuldu.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Kim ödedi</Text>
      <TextInput style={styles.input} value={payer} onChangeText={setPayer} placeholder="Teslim eden" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Kime ödendi</Text>
      <TextInput style={styles.input} value={payee} onChangeText={setPayee} placeholder="Teslim alan" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Tutar (₺) *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />
      <Text style={styles.label}>Yöntem</Text>
      <TextInput style={styles.input} value={method} onChangeText={setMethod} placeholder="nakit, havale..." placeholderTextColor={theme.colors.textMuted} />
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
