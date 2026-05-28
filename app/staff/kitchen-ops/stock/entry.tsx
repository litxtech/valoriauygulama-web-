import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { KitchenProductSuggestInput } from '@/components/kitchenOps/KitchenProductSuggestInput';
import { KitchenChipSelect, KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';
import { KITCHEN_UNITS, KITCHEN_PROOFS_BUCKET } from '@/lib/kitchenOps/constants';
import { applyKitchenMovement, ensureKitchenCategory, upsertKitchenItem } from '@/lib/kitchenOps/api';
import { addKitchenStockItemImages } from '@/lib/kitchenOps/handover';
import type { KitchenStockItem } from '@/lib/kitchenOps/types';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { KitchenMultiPhotoPicker } from '@/components/kitchenOps/KitchenMultiPhotoPicker';
import { Ionicons } from '@expo/vector-icons';

function singleParam(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

export default function KitchenStockEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ itemId?: string; barcode?: string }>();
  const itemIdParam = singleParam(params.itemId);
  const barcodeParam = singleParam(params.barcode);

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('adet');
  const [categoryName, setCategoryName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [barcode, setBarcode] = useState(barcodeParam ?? '');
  const [selectedItem, setSelectedItem] = useState<KitchenStockItem | null>(null);
  const [productPhotos, setProductPhotos] = useState<string[]>([]);
  const [invoicePhoto, setInvoicePhoto] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (barcodeParam) setBarcode(barcodeParam);
  }, [barcodeParam]);

  const onSelectItem = (item: KitchenStockItem) => {
    setSelectedItem(item);
    setName(item.name);
    setUnit(item.unit);
    setCategoryName(item.category?.name ?? '');
    if (item.barcode) setBarcode(item.barcode);
    if (item.last_purchase_price) setUnitPrice(String(item.last_purchase_price));
  };

  const pickPhoto = async (setter: (url: string) => void, fromCamera: boolean) => {
    const granted = fromCamera
      ? await ensureCameraPermission({
          title: 'Kamera',
          message: 'Fotoğraf çekmek için kamera izni gerekiyor.',
          settingsMessage: 'Ayarlardan kamera izni verin.',
        })
      : await ensureMediaLibraryPermission({
          title: 'Galeri',
          message: 'Fotoğraf seçmek için galeri izni gerekiyor.',
          settingsMessage: 'Ayarlardan galeri iznini açın.',
        });
    if (!granted) return;

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.6,
        });

    if (result.canceled || !result.assets[0]?.uri) return;
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: KITCHEN_PROOFS_BUCKET,
        uri: result.assets[0].uri,
        subfolder: 'entry',
      });
      setter(publicUrl);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
  };

  const choosePhoto = (setter: (url: string) => void) => {
    Alert.alert('Fotoğraf ekle', undefined, [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kamera', onPress: () => pickPhoto(setter, true) },
      { text: 'Galeri', onPress: () => pickPhoto(setter, false) },
    ]);
  };

  const save = async () => {
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!name.trim() || !qty || qty <= 0) {
      Alert.alert('Eksik bilgi', 'Ürün adı ve miktar zorunludur.');
      return;
    }
    setSaving(true);
    try {
      let itemId = selectedItem?.id ?? itemIdParam;
      if (!itemId) {
        const categoryId = await ensureKitchenCategory(categoryName);
        itemId = await upsertKitchenItem({
          name: name.trim(),
          unit,
          categoryId,
          barcode: barcode.trim() || null,
          imageUrl: productPhotos[0] ?? null,
        });
      }
      await applyKitchenMovement({
        itemId,
        movementType: 'in',
        quantity: qty,
        note: note.trim() || null,
        unitPrice: unitPrice ? parseFloat(unitPrice.replace(',', '.')) : null,
        supplierName: supplier.trim() || null,
        expiresAt: expiresAt.trim() || null,
        productPhotoUrl: productPhotos[0] ?? null,
        invoicePhotoUrl: invoicePhoto,
        source: barcodeParam ? 'barcode' : 'manual',
      });
      if (productPhotos.length > 1) {
        await addKitchenStockItemImages(itemId, productPhotos.slice(1));
      }
      Alert.alert('Tamam', 'Stok girişi kaydedildi.', [{ text: 'Tamam', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {barcode ? (
        <View style={styles.barcodeRow}>
          <Ionicons name="barcode-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.barcodeText}>Barkod: {barcode}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Ürün adı *</Text>
      <KitchenProductSuggestInput value={name} onChangeText={(t) => { setName(t); setSelectedItem(null); }} onSelect={onSelectItem} autoFocus />

      <Text style={styles.label}>Miktar *</Text>
      <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Birim</Text>
      <KitchenChipSelect
        options={KITCHEN_UNITS.map((u) => ({ value: u, label: u }))}
        value={unit as typeof KITCHEN_UNITS[number]}
        onChange={(v) => setUnit(v)}
      />

      <Text style={styles.label}>Kategori</Text>
      <TextInput
        style={styles.input}
        value={categoryName}
        onChangeText={setCategoryName}
        placeholder="Örn. Sebze, Et, Süt ürünleri"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="sentences"
      />

      <Text style={styles.label}>Tedarikçi</Text>
      <TextInput style={styles.input} value={supplier} onChangeText={setSupplier} placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Alış fiyatı (₺)</Text>
      <TextInput style={styles.input} value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Son kullanma (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={expiresAt} onChangeText={setExpiresAt} placeholder="2026-06-01" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" />

      <Text style={styles.label}>Not</Text>
      <TextInput style={[styles.input, styles.multiline]} value={note} onChangeText={setNote} multiline placeholder="Opsiyonel" placeholderTextColor={theme.colors.textMuted} />

      <Text style={styles.label}>Ürün fotoğrafları</Text>
      <KitchenMultiPhotoPicker
        photos={productPhotos}
        onChange={setProductPhotos}
        subfolder="entry"
        label=""
        hint="İstediğiniz kadar ürün fotoğrafı ekleyebilirsiniz."
        onPreview={setPreviewUri}
      />

      <Text style={styles.label}>Fiş / fatura</Text>
      {invoicePhoto ? (
        <View style={styles.photoPreviewWrap}>
          <TouchableOpacity onPress={() => setPreviewUri(invoicePhoto)} activeOpacity={0.85}>
            <CachedImage uri={invoicePhoto} style={styles.photoPreview} contentFit="cover" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoRemove} onPress={() => setInvoicePhoto(null)}>
            <Text style={styles.photoRemoveText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoChangeBtn} onPress={() => choosePhoto(setInvoicePhoto)}>
            <Text style={styles.photoChangeBtnText}>Değiştir</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={styles.photoAddBtn} onPress={() => choosePhoto(setInvoicePhoto)}>
          <Ionicons name="document-outline" size={24} color={theme.colors.primary} />
          <Text style={styles.photoAddBtnText}>Kamera veya galeriden ekle</Text>
        </TouchableOpacity>
      )}

      <KitchenSaveButton label="Stoğa Ekle" onPress={save} loading={saving} />
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
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
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, padding: 10, backgroundColor: '#fffbeb', borderRadius: 10 },
  barcodeText: { fontSize: 14, fontWeight: '600', color: theme.colors.primaryDark },
  photoAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderStyle: 'dashed',
  },
  photoAddBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  photoPreviewWrap: { position: 'relative', marginBottom: 4 },
  photoPreview: { width: '100%', height: 180, borderRadius: 12, backgroundColor: theme.colors.borderLight },
  photoRemove: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  photoChangeBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  photoChangeBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
});
