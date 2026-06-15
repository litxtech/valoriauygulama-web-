import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_EXPENSE_CATEGORIES, KITCHEN_PROOFS_BUCKET } from '@/lib/kitchenOps/constants';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { CachedImage } from '@/components/CachedImage';
import { expenseReceiptPreviewStyle } from '@/lib/expenseReceiptPreviewStyles';
import { Ionicons } from '@expo/vector-icons';

export default function KitchenExpenseNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  const [receiptRequiredAbove, setReceiptRequiredAbove] = useState(1000);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('kitchen_ops_settings').select('receipt_required_above').maybeSingle().then(({ data }) => {
      if (data?.receipt_required_above) setReceiptRequiredAbove(Number(data.receipt_required_above));
    });
  }, []);

  const pickReceipt = async () => {
    const granted = await ensureCameraPermission({ title: 'Kamera', message: 'Fiş fotoğrafı için kamera gerekli.', settingsMessage: 'Ayarlardan izin verin.' });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.6 });
    if (result.canceled || !result.assets[0]?.uri) return;
    const { publicUrl } = await uploadUriToPublicBucket({ bucketId: KITCHEN_PROOFS_BUCKET, uri: result.assets[0].uri, subfolder: 'expense' });
    setReceiptPhoto(publicUrl);
  };

  const save = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    const cleanCategory = category.trim();
    if (!cleanCategory || !amt || amt <= 0) {
      Alert.alert('Eksik', 'Kategori ve tutar zorunlu.');
      return;
    }
    if (amt >= receiptRequiredAbove && !receiptPhoto) {
      Alert.alert('Fiş zorunlu', `${receiptRequiredAbove} ₺ üzeri giderlerde fiş/fatura fotoğrafı zorunludur.`);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_expenses').insert({
        organization_id: staff?.organization_id,
        category: cleanCategory,
        amount: amt,
        description: description.trim() || null,
        supplier_name: supplier.trim() || null,
        note: note.trim() || null,
        receipt_photo_url: receiptPhoto,
        created_by: staff?.id,
      });
      if (error) throw error;
      Alert.alert('Tamam', 'Gider kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Kategori *</Text>
      <Text style={styles.hint}>Hazır seçeneklerden birine dokunun veya kendiniz yazın.</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="Örn: Sebze, Temizlik, Kira…"
        placeholderTextColor={theme.colors.textMuted}
        maxLength={80}
        autoCapitalize="sentences"
      />
      <KitchenChipSelect
        options={KITCHEN_EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        value={KITCHEN_EXPENSE_CATEGORIES.includes(category as (typeof KITCHEN_EXPENSE_CATEGORIES)[number]) ? category : ''}
        onChange={setCategory}
      />

      <Text style={styles.label}>Tutar (₺) *</Text>
      <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Tedarikçi</Text>
      <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Açıklama</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Not</Text>
      <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} multiline placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <TouchableOpacity style={styles.photoBtn} onPress={pickReceipt}>
        {receiptPhoto ? (
          <CachedImage uri={receiptPhoto} style={styles.photoThumb} contentFit="cover" />
        ) : (
          <Ionicons name="receipt-outline" size={32} color={theme.colors.primary} />
        )}
        <Text style={styles.photoLabel}>Fiş / fatura {parseFloat(amount.replace(',', '.') || '0') >= receiptRequiredAbove ? '*' : '(opsiyonel)'}</Text>
      </TouchableOpacity>

      <KitchenSaveButton label="Kaydet" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 6, marginTop: 12 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8, lineHeight: 17 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: theme.colors.text, marginBottom: 8 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  photoBtn: { alignItems: 'center', padding: 16, backgroundColor: theme.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight, marginTop: 16 },
  photoThumb: expenseReceiptPreviewStyle,
  photoLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 10 },
});
