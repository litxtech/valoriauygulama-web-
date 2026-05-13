import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

type CategoryRow = { id: string; name: string; icon: string | null };

const PAYMENT_TYPES: { value: 'cash' | 'credit_card' | 'company_card'; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'company_card', label: 'Şirket Kartı' },
];

export default function NewExpenseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  /** Android: KAV davranışı yok; klavye yüksekliği kadar alt boşluk — form yukarı kaydırılabilsin. */
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const { staff } = useAuthStore();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseTime, setExpenseTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [amount, setAmount] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit_card' | 'company_card'>('cash');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    supabase
      .from('expense_categories')
      .select('id, name, icon')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as CategoryRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setAndroidKeyboardInset(0);
      return;
    }
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const scrollFocusedFieldIntoView = () => {
    const delay = Platform.OS === 'android' ? 220 : 120;
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, delay);
  };

  const uploadReceipt = async (uri: string): Promise<string> => {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: 'expense-receipts',
      uri,
      subfolder: 'receipt',
    });
    return publicUrl;
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Fiş fotoğrafı çekmek için kamera erişimi gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Fiş fotoğrafı için ayarlardan izin verin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUri(url);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : (e as Error)?.message ?? 'Fotoğraf yüklenemedi.';
      Alert.alert('Hata', msg);
    } finally {
      setUploading(false);
    }
  };

  const pickFromGallery = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Fis fotografi secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Fis fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadReceipt(result.assets[0].uri);
      setReceiptUri(url);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : (e as Error)?.message ?? 'Fotoğraf yüklenemedi.';
      Alert.alert('Hata', msg);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum gerekli.');
      return;
    }
    if (!receiptUri) {
      Alert.alert('Eksik', 'Fiş fotoğrafı zorunludur.');
      return;
    }
    if (!categoryId) {
      Alert.alert('Eksik', 'Kategori seçiniz.');
      return;
    }
    const num = parseFloat(amount.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      Alert.alert('Hata', 'Geçerli tutar girin.');
      return;
    }
    const tagArray = tags.trim() ? tags.trim().split(/\s+/).filter(Boolean) : null;
    setSaving(true);
    try {
      const rpc = await supabase.rpc('insert_my_staff_expense', {
        p_category_id: categoryId,
        p_expense_date: expenseDate,
        p_expense_time: expenseTime,
        p_amount: num,
        p_payment_type: paymentType,
        p_description: description.trim() || null,
        p_receipt_image_url: receiptUri,
        p_tags: tagArray,
      });
      let error = rpc.error;
      const fnMissing =
        !!error &&
        (error.message?.toLowerCase().includes('function') ||
          error.message?.toLowerCase().includes('does not exist') ||
          error.code === '42883' ||
          error.code === 'PGRST202');
      if (fnMissing) {
        const direct = await supabase.from('staff_expenses').insert({
          staff_id: staff.id,
          category_id: categoryId,
          expense_date: expenseDate,
          expense_time: expenseTime,
          amount: num,
          payment_type: paymentType,
          description: description.trim() || null,
          receipt_image_url: receiptUri,
          tags: tagArray,
          status: 'pending',
        });
        error = direct.error;
      }
      if (error) throw error;
      Alert.alert('Kaydedildi', 'Harcamanız admin onayından sonra kesinleşecektir.', [
        { text: 'Tamam', onPress: () => router.replace('/staff/expenses') },
      ]);
    } catch (e) {
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string'
          ? (e as { message: string }).message
          : (e as Error)?.message ?? 'Kayıt yapılamadı.';
      Alert.alert('Hata', msg);
    } finally {
      setSaving(false);
    }
  };

  const contentPaddingBottom =
    Math.max(insets.bottom, 16) + 32 + (Platform.OS === 'android' ? androidKeyboardInset : 0);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: contentPaddingBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fiş fotoğrafı (Zorunlu)</Text>
          <View style={styles.receiptBox}>
            {receiptUri ? (
              <View style={styles.receiptPreview}>
                <CachedImage uri={receiptUri} style={styles.receiptImg} contentFit="contain" />
                <TouchableOpacity style={styles.removeReceipt} onPress={() => setReceiptUri(null)}>
                  <Ionicons name="close-circle" size={28} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.receiptPlaceholder}>
                <TouchableOpacity style={styles.photoBtn} onPress={takePhoto} disabled={uploading}>
                  <Ionicons name="camera" size={32} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>Fotoğraf çek</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={pickFromGallery} disabled={uploading}>
                  <Ionicons name="images" size={32} color={theme.colors.primary} />
                  <Text style={styles.photoBtnText}>Galeriden yükle</Text>
                </TouchableOpacity>
                {uploading && <ActivityIndicator size="small" color={theme.colors.primary} style={styles.uploadIndicator} />}
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Harcama bilgileri</Text>
          <Text style={styles.label}>Kategori</Text>
          <View style={styles.categoryRow}>
            {categories.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.categoryChip, categoryId === c.id && styles.categoryChipActive]}
                onPress={() => setCategoryId(c.id)}
              >
                <Text style={[styles.categoryChipText, categoryId === c.id && styles.categoryChipTextActive]} numberOfLines={1}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Tarih</Text>
              <TextInput
                style={styles.input}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Saat</Text>
              <TextInput
                style={styles.input}
                value={expenseTime}
                onChangeText={setExpenseTime}
                placeholder="14:30"
                placeholderTextColor={theme.colors.textMuted}
              />
            </View>
          </View>

          <Text style={styles.label}>Tutar (₺)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0,00"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
          />

          <Text style={styles.label}>Ödeme türü</Text>
          <View style={styles.paymentRow}>
            {PAYMENT_TYPES.map((p) => (
              <TouchableOpacity
                key={p.value}
                style={[styles.radio, paymentType === p.value && styles.radioActive]}
                onPress={() => setPaymentType(p.value)}
              >
                <Text style={[styles.radioText, paymentType === p.value && styles.radioTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>Açıklama</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="Harcama detayı (örn: Klima tamiri için yedek parça)"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={3}
            blurOnSubmit={false}
            scrollEnabled
          />

          <Text style={styles.label}>Etiketler (opsiyonel)</Text>
          <TextInput
            style={styles.input}
            value={tags}
            onChangeText={setTags}
            onFocus={scrollFocusedFieldIntoView}
            placeholder="#klima #teknik"
            placeholderTextColor={theme.colors.textMuted}
          />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator color={theme.colors.white} size="small" /> : <Text style={styles.saveBtnText}>Harcama kaydet</Text>}
        </TouchableOpacity>

        <Text style={styles.note}>Harcamanız admin onayından sonra kesinleşecektir.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  content: { padding: 16, flexGrow: 1 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  receiptBox: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: 12, minHeight: 140, borderWidth: 1, borderColor: theme.colors.borderLight },
  receiptPlaceholder: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  receiptPreview: { position: 'relative', alignSelf: 'flex-start' },
  receiptImg: { width: 160, height: 160, borderRadius: theme.radius.sm },
  removeReceipt: { position: 'absolute', top: 4, right: 4 },
  photoBtn: { padding: 12, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.sm, alignItems: 'center', minWidth: 120 },
  photoBtnText: { fontSize: 12, color: theme.colors.primary, marginTop: 4 },
  uploadIndicator: { marginTop: 8 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: theme.colors.text },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.full },
  categoryChipActive: { backgroundColor: theme.colors.primary },
  categoryChipText: { fontSize: 13, color: theme.colors.text },
  categoryChipTextActive: { color: theme.colors.white, fontWeight: '600' },
  paymentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  radio: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm },
  radioActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryLight + '20' },
  radioText: { fontSize: 13, color: theme.colors.text },
  radioTextActive: { color: theme.colors.primary, fontWeight: '600' },
  saveBtn: { backgroundColor: theme.colors.primary, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  note: { fontSize: 12, color: theme.colors.textMuted, marginTop: 12, textAlign: 'center' },
});
