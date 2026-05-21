import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { useTranslation } from 'react-i18next';

const UNITS = ['adet', 'kg', 'litre', 'paket', 'kutu', 'koli'];

export default function StaffStockManualEntryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { staff } = useAuthStore();

  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('adet');
  const [receivedByName, setReceivedByName] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uploadPhotoFromUri = async (uri: string): Promise<string> => {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: 'stock-proofs',
      uri,
      subfolder: 'stock',
    });
    return publicUrl;
  };

  const photoUriForUpload = (asset: { uri?: string; base64?: string | null; type?: string }) => {
    if (asset.uri && !asset.uri.startsWith('content://')) return asset.uri;
    if (asset.base64) {
      const mime = asset.type === 'png' ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${asset.base64}`;
    }
    return asset.uri ?? null;
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Stok girişi için fotoğraf çekmek amacıyla kamera erişimi gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Stok fotoğrafı için ayarlardan izin verin.',
    });
    if (!granted) return;
    if (Platform.OS === 'android') {
      await new Promise((r) => setTimeout(r, 320));
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: Platform.OS === 'ios',
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = photoUriForUpload(result.assets[0]);
    if (!uri) {
      Alert.alert(t('error'), t('feedPhotoPickFailed'));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhotoFromUri(uri);
      setPhoto(url);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('feedMediaUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Stok girisi icin galeriden fotograf secmek amaciyla izin istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Stok fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: Platform.OS === 'ios',
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const uri = photoUriForUpload(result.assets[0]);
    if (!uri) {
      Alert.alert(t('error'), t('feedImagePickFailed'));
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPhotoFromUri(uri);
      setPhoto(url);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('feedMediaUploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!staff?.id) {
      Alert.alert(t('missingInfo'), t('loginRequiredTitle'));
      return;
    }
    if (!staff.organization_id) {
      Alert.alert(t('error'), t('recordError'));
      return;
    }
    const name = productName.trim();
    if (!name) {
      Alert.alert(t('missingInfo'), t('required'));
      return;
    }
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      Alert.alert(t('error'), t('required'));
      return;
    }
    if (!photo) {
      Alert.alert(t('missingInfo'), t('galleryRequired'));
      return;
    }

    setSaving(true);
    try {
      const { data: newProduct, error: insertProdErr } = await supabase
        .from('stock_products')
        .insert({
          name,
          barcode: null,
          unit: unit || 'adet',
          current_stock: 0,
          created_by: staff.id,
          organization_id: staff.organization_id,
        })
        .select('id')
        .single();
      if (insertProdErr) {
        Alert.alert(t('error'), insertProdErr.message);
        setSaving(false);
        return;
      }
      const productId = newProduct!.id;

      const notesParts: string[] = [];
      if (receivedByName.trim()) notesParts.push(`Teslim alan: ${receivedByName.trim()}`);
      if (notes.trim()) notesParts.push(notes.trim());
      const finalNotes = notesParts.length ? notesParts.join(' · ') : 'Manuel giriş (barkodsuz ürün)';

      const { error } = await supabase.from('stock_movements').insert({
        product_id: productId,
        movement_type: 'in',
        quantity: q,
        staff_id: staff.id,
        photo_proof: photo,
        notes: finalNotes,
        status: 'pending',
      });
      if (error) throw error;

      const { notifyAdminPanel } = await import('@/lib/notificationService');
      void notifyAdminPanel({
        title: `📦 ${t('pendingApproval')}`,
        body: `${productName.trim()} · manuel stok girişi onay bekliyor.`,
        href: '/admin/stock/approvals',
        notificationType: 'stock_pending_approval',
      });

      Alert.alert(t('saved'), t('pendingApproval'), () => router.replace('/staff/stock'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
    }
    setSaving(false);
  };

  const canSubmit = productName.trim().length > 0 && quantity.length > 0 && parseInt(quantity, 10) > 0 && !!photo;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={22} color={theme.colors.primary} />
          <Text style={styles.infoText}>Barkodu olmayan ürünler için manuel stok girişi. Tüm alanları doldurun ve ürün fotoğrafı çekin.</Text>
        </View>

        <Text style={styles.label}>Ürün adı *</Text>
        <TextInput
          style={styles.input}
          placeholder="Örn: Özel karışım kahve 500g"
          placeholderTextColor={theme.colors.textMuted}
          value={productName}
          onChangeText={setProductName}
        />

        <Text style={styles.label}>Birim</Text>
        <View style={styles.unitRow}>
          {UNITS.map((u) => (
            <TouchableOpacity
              key={u}
              style={[styles.unitChip, unit === u && styles.unitChipActive]}
              onPress={() => setUnit(u)}
              activeOpacity={0.8}
            >
              <Text style={[styles.unitChipText, unit === u && styles.unitChipTextActive]}>{u}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Eklenecek miktar *</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="numeric"
          value={quantity}
          onChangeText={setQuantity}
        />

        <Text style={styles.label}>Teslim alan kişi (isteğe bağlı)</Text>
        <TextInput
          style={styles.input}
          placeholder="Teslim alan kişi adı"
          placeholderTextColor={theme.colors.textMuted}
          value={receivedByName}
          onChangeText={setReceivedByName}
        />

        <Text style={styles.label}>Ürün fotoğrafı *</Text>
        {photo ? (
          <View style={styles.photoWrap}>
            <TouchableOpacity onPress={() => setPreviewUri(photo)} activeOpacity={0.8}>
              <CachedImage uri={photo} style={[styles.photo, styles.photoLarge]} contentFit="cover" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)}>
              <Text style={styles.removePhotoText}>✕ Kaldır</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto} disabled={uploading} activeOpacity={0.8}>
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.cameraBtnText}>Kamera ile çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.galleryBtn} onPress={pickPhoto} disabled={uploading} activeOpacity={0.8}>
              <Ionicons name="images" size={22} color={theme.colors.primary} />
              <Text style={styles.galleryBtnText}>Galeriden seç</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.label}>Not (isteğe bağlı)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Açıklama veya ek bilgi..."
          placeholderTextColor={theme.colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />

        <TouchableOpacity style={styles.backLink} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backLinkText}>← Stok girişine dön</Text>
        </TouchableOpacity>

        <Text style={styles.warning}>Stok girişiniz admin onayından sonra işlenecektir. Yeni ürün barkodsuz oluşturulacak.</Text>

        <TouchableOpacity
          style={[styles.submitBtn, (!canSubmit || saving) && styles.submitBtnDisabled]}
          onPress={submit}
          disabled={!canSubmit || saving}
          activeOpacity={0.8}
        >
          <Text style={styles.submitBtnText}>{saving ? 'Kaydediliyor...' : 'Stok girişi yap'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: `${theme.colors.primary}14`,
    padding: 14,
    borderRadius: theme.radius.md,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  infoText: { flex: 1, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: theme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    fontSize: 15,
    backgroundColor: theme.colors.surface,
    color: '#111827',
    marginBottom: 16,
  },
  textArea: { minHeight: 72 },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  unitChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  unitChipText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  unitChipTextActive: { color: '#fff' },
  photoWrap: { marginBottom: 16, position: 'relative' },
  photo: { width: 120, height: 120, borderRadius: theme.radius.md },
  photoLarge: { width: '100%', height: 200, borderRadius: theme.radius.md },
  removePhoto: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.error,
  },
  removePhotoText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  photoButtons: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  cameraBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
  },
  cameraBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  galleryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  galleryBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  backLink: { marginBottom: 12 },
  backLinkText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  warning: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 20 },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
