import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { CHECK_DIR_META } from '@/lib/financeCheckTheme';
import {
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';
import { FinanceCheckQuickStatusButtons } from '@/components/financeChecks/FinanceCheckQuickStatusButtons';
import { FinanceCheckPreviewCard } from '@/components/financeChecks/FinanceCheckPreviewCard';

const ADVANCED_STATUSES: FinanceCheckStatus[] = ['draft', 'presented', 'partial', 'cancelled'];

export default function AdminFinanceCheckEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<FinanceCheckDirection>('given');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState<FinanceCheckStatus>('registered');
  const [notes, setNotes] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('finance_checks').select('*').eq('id', id).single();
    if (error || !data) {
      setLoading(false);
      Alert.alert('Hata', error?.message ?? 'Bulunamadı');
      router.back();
      return;
    }
    const r = data as Record<string, unknown>;
    setDirection(r.direction as FinanceCheckDirection);
    setCounterparty(String(r.counterparty_name ?? ''));
    setAmount(String(r.amount ?? ''));
    setCheckNumber(String(r.check_number ?? ''));
    setBankName(String(r.bank_name ?? ''));
    setBranchName(String(r.branch_name ?? ''));
    setIssueDate(String(r.issue_date ?? '').slice(0, 10));
    setDueDate(String(r.due_date ?? '').slice(0, 10));
    setPurpose(String(r.purpose ?? ''));
    setStatus(r.status as FinanceCheckStatus);
    setNotes(String(r.notes ?? ''));
    setImageUrls(Array.isArray(r.image_urls) ? (r.image_urls as string[]) : []);
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirMeta = CHECK_DIR_META[direction];
  const parsedAmount = parseFloat(amount.replace(',', '.'));

  const previewData = {
    direction,
    counterparty_name: counterparty.trim() || '—',
    amount: Number.isNaN(parsedAmount) ? 0 : parsedAmount,
    status,
    check_number: checkNumber.trim() || null,
    bank_name: bankName.trim() || null,
    branch_name: branchName.trim() || null,
    issue_date: issueDate || null,
    due_date: dueDate.trim() || null,
    purpose: purpose.trim() || null,
    notes: notes.trim() || null,
    image_urls: imageUrls,
  };

  const addImage = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-checks',
        uri,
        subfolder: 'check',
      });
      setImageUrls((u) => [...u, publicUrl]);
    } catch (e) {
      Alert.alert('Yükleme hatası', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (uri: string) => {
    Alert.alert('Görseli kaldır', 'Bu çek görseli listeden çıkarılsın mı?', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: () => setImageUrls((u) => u.filter((x) => x !== uri)) },
    ]);
  };

  const pickCamera = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Çek görüntüsü için kamera gerekli.',
      settingsMessage: 'Ayarlardan kamera iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (!r.canceled && r.assets[0]?.uri) await addImage(r.assets[0].uri);
  };

  const pickLib = async () => {
    const uris = await pickGalleryImages({ quality: 0.75, selectionLimit: 8 });
    for (const uri of uris) await addImage(uri);
  };

  const save = async () => {
    if (!id || !me?.id) return;
    const a = parseFloat(amount.replace(',', '.'));
    if (!counterparty.trim() || Number.isNaN(a) || a < 0) {
      Alert.alert('Form', 'Karşı taraf ve geçerli tutar girin.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('finance_checks')
      .update({
        direction,
        counterparty_name: counterparty.trim(),
        amount: a,
        check_number: checkNumber.trim() || null,
        bank_name: bankName.trim() || null,
        branch_name: branchName.trim() || null,
        issue_date: issueDate || null,
        due_date: dueDate.trim() || null,
        purpose: purpose.trim() || null,
        status,
        image_urls: imageUrls,
        notes: notes.trim() || null,
        updated_by_staff_id: me.id,
      })
      .eq('id', id);
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    Alert.alert('Güncellendi', 'Çek kaydı kaydedildi.');
    router.replace({ pathname: '/admin/finance-checks/[id]', params: { id } } as never);
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
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.previewToggle} onPress={() => setShowPreview((v) => !v)} activeOpacity={0.85}>
          <Ionicons name={showPreview ? 'eye-off-outline' : 'eye-outline'} size={18} color={adminTheme.colors.primary} />
          <Text style={styles.previewToggleText}>{showPreview ? 'Önizlemeyi gizle' : 'Canlı önizleme'}</Text>
        </TouchableOpacity>
      </View>

      {showPreview ? (
        <FinanceCheckPreviewCard data={previewData} large />
      ) : null}

      <Text style={styles.sectionLabel}>Çek yönü</Text>
      <View style={styles.dirRow}>
        {(['given', 'received'] as FinanceCheckDirection[]).map((d) => {
          const meta = CHECK_DIR_META[d];
          const active = direction === d;
          return (
            <TouchableOpacity key={d} style={styles.dirOptWrap} onPress={() => setDirection(d)} activeOpacity={0.9}>
              {active ? (
                <LinearGradient colors={meta.gradient} style={styles.dirOpt}>
                  <Ionicons name={meta.icon} size={22} color="#fff" />
                  <Text style={styles.dirOptTextOn}>{CHECK_DIRECTION_LABELS[d]}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.dirOpt, { backgroundColor: meta.bg, borderColor: meta.border }]}>
                  <Ionicons name={meta.icon} size={22} color={meta.color} />
                  <Text style={[styles.dirOptText, { color: meta.color }]}>{CHECK_DIRECTION_LABELS[d]}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <AdminCard style={[styles.card, { borderLeftColor: dirMeta.color, borderLeftWidth: 4 }]}>
        <Text style={styles.label}>Karşı taraf</Text>
        <TextInput style={styles.input} value={counterparty} onChangeText={setCounterparty} />
        <Text style={styles.label}>Tutar (₺)</Text>
        <TextInput
          style={[styles.input, styles.amountInput]}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Durum</Text>
        <FinanceCheckQuickStatusButtons status={status} onSelect={setStatus} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hScroll}>
          {ADVANCED_STATUSES.map((s) => (
            <TouchableOpacity key={s} style={[styles.tag, status === s && styles.tagOn]} onPress={() => setStatus(s)}>
              <Text style={[styles.tagText, status === s && styles.tagTextOn]}>{CHECK_STATUS_LABELS[s]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>Çek no</Text>
        <TextInput style={styles.input} value={checkNumber} onChangeText={setCheckNumber} />
        <Text style={styles.label}>Banka / Şube</Text>
        <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="Banka" />
        <TextInput style={[styles.input, { marginTop: 8 }]} value={branchName} onChangeText={setBranchName} placeholder="Şube" />
        <View style={styles.dateRow}>
          <View style={styles.dateCol}>
            <Text style={styles.label}>Düzenleme</Text>
            <TextInput style={styles.input} value={issueDate} onChangeText={setIssueDate} placeholder="YYYY-MM-DD" />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.label}>Vade</Text>
            <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />
          </View>
        </View>
        <Text style={styles.label}>Amaç</Text>
        <TextInput style={[styles.input, styles.multiline]} value={purpose} onChangeText={setPurpose} multiline />
        <Text style={styles.label}>Notlar</Text>
        <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline />
      </AdminCard>

      <AdminCard>
        <Text style={styles.label}>Çek görüntüsü</Text>
        <View style={styles.imgActions}>
          <TouchableOpacity style={styles.imgBtn} onPress={pickCamera} disabled={uploading}>
            <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Çek</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imgBtn} onPress={pickLib} disabled={uploading}>
            <Ionicons name="images-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
        {uploading ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
        <View style={styles.thumbs}>
          {imageUrls.map((u) => (
            <TouchableOpacity key={u} onLongPress={() => removeImage(u)} activeOpacity={0.9}>
              <Image source={{ uri: u }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </View>
        {imageUrls.length > 0 ? (
          <Text style={styles.hint}>Görseli kaldırmak için uzun basın.</Text>
        ) : null}
      </AdminCard>

      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: dirMeta.color }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Değişiklikleri kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const T = adminTheme;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topActions: { marginBottom: 10 },
  previewToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  previewToggleText: { fontSize: 13, fontWeight: '700', color: T.colors.primary },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: T.colors.textSecondary, marginBottom: 8, marginTop: 8 },
  dirRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  dirOptWrap: { flex: 1 },
  dirOpt: {
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    minHeight: 72,
    justifyContent: 'center',
  },
  dirOptText: { fontSize: 13, fontWeight: '800', marginTop: 4 },
  dirOptTextOn: { fontSize: 13, fontWeight: '800', color: '#fff', marginTop: 4 },
  card: { marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: T.colors.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: T.colors.surface,
    color: T.colors.text,
  },
  amountInput: { fontSize: 20, fontWeight: '800' },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  hScroll: { gap: 8, paddingVertical: 4 },
  tag: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: T.colors.surfaceTertiary },
  tagOn: { backgroundColor: T.colors.primary },
  tagText: { fontSize: 12, color: T.colors.textSecondary },
  tagTextOn: { color: '#fff', fontWeight: '600' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateCol: { flex: 1 },
  imgActions: { flexDirection: 'row', gap: 12 },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  imgBtnText: { fontSize: 14, fontWeight: '600', color: T.colors.primary },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  hint: { fontSize: 11, color: T.colors.textMuted, marginTop: 6 },
  saveBtn: { paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
