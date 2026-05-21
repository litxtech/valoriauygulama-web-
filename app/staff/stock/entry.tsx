import { useState, useEffect, useRef } from 'react';
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
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { useAuthStore } from '@/stores/authStore';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { useTranslation } from 'react-i18next';

type Product = { id: string; name: string; unit: string | null; current_stock: number | null; min_stock?: number | null };

/** Expo-router bazen param'ı dizi veriyor; tek string değer kullan. */
function singleParam(value: string | string[] | undefined): string | undefined {
  if (value == null) return undefined;
  const s = Array.isArray(value) ? value[0] : value;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

export default function StaffStockEntryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ productId?: string; barcode?: string }>();
  const { staff } = useAuthStore();

  const productIdParam = singleParam(params.productId);
  const barcodeParam = singleParam(params.barcode);

  const [product, setProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  /** Barkod ayrı, ürün adı ayrı: barkod okutulunca sadece barkod gösterilir; ürün adını kullanıcı yazar. */
  const [productNameFree, setProductNameFree] = useState('');
  /** Barkod okutulduğunda teslim alan kişi ismi. */
  const [receivedByName, setReceivedByName] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (productIdParam) {
      supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock')
        .eq('id', productIdParam)
        .single()
        .then(({ data }) => setProduct(data ?? null));
      return;
    }
    if (barcodeParam) {
      supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock')
        .eq('barcode', barcodeParam)
        .maybeSingle()
        .then(({ data }) => setProduct(data ?? null));
      return;
    }
    supabase.from('stock_products').select('id, name, unit, current_stock').order('name').then(({ data }) => setProducts(data ?? []));
  }, [productIdParam, barcodeParam]);

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

  const takeProductPhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Stok ürünü fotoğrafı çekmek için kamera erişimi gerekiyor.',
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

  const pickProductPhoto = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Stok urunu fotografi secmek icin galeri erisimi istiyoruz.',
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

  const saveMovement = async () => {
    if (!staff?.id) {
      Alert.alert(t('missingInfo'), t('loginRequiredTitle'));
      return;
    }
    if (!staff.organization_id) {
      Alert.alert(t('error'), t('recordError'));
      return;
    }
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      Alert.alert(t('error'), t('required'));
      return;
    }

    let productId: string;

    if (product) {
      productId = product.id;
    } else if (barcodeParam && productNameFree.trim()) {
      // Barkod okutuldu ama ürün yoktu: yeni ürün oluştur (barkod + ad)
      const { data: newProduct, error: insertProdErr } = await supabase
        .from('stock_products')
        .insert({
          name: productNameFree.trim(),
          barcode: barcodeParam,
          unit: 'adet',
          current_stock: 0,
          organization_id: staff.organization_id,
        })
        .select('id')
        .single();
      if (insertProdErr) {
        Alert.alert(t('error'), insertProdErr.message);
        return;
      }
      productId = newProduct!.id;
    } else {
      Alert.alert(t('missingInfo'), t('productNotFoundTitle'));
      return;
    }

    const notesParts: string[] = [];
    if (receivedByName.trim()) notesParts.push(`Teslim alan: ${receivedByName.trim()}`);
    if (notes.trim()) notesParts.push(notes.trim());
    const finalNotes = notesParts.length ? notesParts.join(' · ') : null;

    const { error } = await supabase.from('stock_movements').insert({
      product_id: productId,
      movement_type: 'in',
      quantity: q,
      staff_id: staff.id,
      photo_proof: photo,
      notes: finalNotes,
      status: 'pending',
    });

    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    const { notifyAdminPanel } = await import('@/lib/notificationService');
    void notifyAdminPanel({
      title: `📦 ${t('pendingApproval')}`,
      body: `${product?.name ?? (productNameFree.trim() || 'Ürün')} · stok girişi onay bekliyor.`,
      href: '/admin/stock/approvals',
      notificationType: 'stock_pending_approval',
    });
    Alert.alert(t('saved'), t('pendingApproval'), [
      { text: t('ok'), onPress: () => router.replace('/staff/stock/entry') },
    ]);
  };

  const clearProduct = () => router.replace('/staff/stock/entry');

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const isNewProductFromBarcode = !!barcodeParam && !product;

  // Barkod okutuldu ama ürün bulunamadı: ürün adı + miktar + fotoğraf ile giriş (isim yazma bölümü her zaman görünsün)
  if (isNewProductFromBarcode) {
    return (
      <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.barcodeInfo}>
          <Text style={styles.barcodeInfoTitle}>📷 Barkod okutuldu</Text>
          <Text style={styles.barcodeLabel}>Barkod</Text>
          <Text style={styles.barcodeInfoCode}>{barcodeParam}</Text>
          <Text style={styles.barcodeInfoHint}>Bu barkoda kayıtlı ürün yok. Aşağıya ürün adını (ismini) yazın; arama yaparken bu isimle aranacak.</Text>
        </View>
        <Text style={styles.label}>Ürün adı *</Text>
        <TextInput style={styles.input} placeholder="Ürün ismi yazın (örn: Coca Cola 330ml)" placeholderTextColor="#6b7280" value={productNameFree} onChangeText={setProductNameFree} />
        <Text style={styles.label}>Teslim alan kişi (isim)</Text>
        <TextInput style={styles.input} placeholder="Teslim alan kişi adı" placeholderTextColor="#6b7280" value={receivedByName} onChangeText={setReceivedByName} />
        <Text style={styles.label}>Eklenecek miktar (adet)</Text>
        <TextInput style={styles.input} placeholder="0" placeholderTextColor="#6b7280" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
        <Text style={styles.label}>Ürün fotoğrafı (isteğe bağlı)</Text>
        {photo ? (
          <View style={styles.photoWrap}>
            <TouchableOpacity onPress={() => setPreviewUri(photo)} activeOpacity={0.8}>
              <CachedImage uri={photo} style={[styles.photo, styles.photoLarge]} contentFit="cover" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.productPhotoRow}>
            <TouchableOpacity style={styles.cameraMainBtn} onPress={takeProductPhoto} disabled={uploading}>
              <Text style={styles.cameraMainBtnText}>📷 Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.galeriSmallBtn} onPress={pickProductPhoto} disabled={uploading}>
              <Text style={styles.galeriSmallBtnText}>Galeri</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.label}>Not</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Açıklama..." placeholderTextColor="#6b7280" multiline numberOfLines={2} value={notes} onChangeText={setNotes} />
        <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/staff/stock/entry')}>
          <Text style={styles.changeProductBtnText}>← Başka ürün seç / Barkod okut</Text>
        </TouchableOpacity>
        <Text style={styles.warning}>Stok girişiniz admin onayından sonra işlenecektir. Yeni ürün otomatik oluşturulacak.</Text>
        <TouchableOpacity
          style={[styles.submit, (!quantity || !productNameFree.trim() || parseInt(quantity, 10) <= 0) && styles.submitDisabled]}
          onPress={saveMovement}
          disabled={!quantity || !productNameFree.trim() || parseInt(quantity, 10) <= 0}
        >
          <Text style={styles.submitText}>Stok girişi yap</Text>
        </TouchableOpacity>
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
    );
  }

  // Ürün seçilmemiş: Barkod Okut + manuel arama
  if (!product) {
    return (
      <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.barcodeBtn} onPress={() => router.push('/staff/stock/scan')} activeOpacity={0.8}>
          <Text style={styles.barcodeBtnText}>📷 Barkod Okut</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manuelBarkodsuzBtn}
          onPress={() => router.push('/staff/stock/manual')}
          activeOpacity={0.8}
        >
          <Text style={styles.manuelBarkodsuzBtnText}>✏️ Manuel Giriş – Barkodsuz ürün</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.manuelGirisBtn}
          onPress={() => searchInputRef.current?.focus()}
          activeOpacity={0.8}
        >
          <Text style={styles.manuelGirisBtnText}>📋 Ürün listesinden seç</Text>
        </TouchableOpacity>
        <Text style={styles.label}>Ürün adı ile ara</Text>
        <TextInput
          ref={searchInputRef}
          style={styles.input}
          placeholder="Ürün ismi yazın (en az 2 karakter)..."
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
        />
        {search.length >= 2 && (
          <View style={styles.searchList} pointerEvents="box-none">
            {filteredProducts.slice(0, 12).map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.searchItem}
                onPress={() => { setProduct(p); setSearch(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.searchItemName}>{p.name}</Text>
                <Text style={styles.searchItemStock}>{p.current_stock ?? 0} {p.unit ?? 'adet'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
    );
  }

  // Ürün seçilmiş: miktar, fotoğraf, not, gönder
  const cur = product.current_stock ?? 0;
  const isLow = cur <= 3;
  /** Barkod okutuldu ve bu barkoda kayıtlı ürün bulundu → "Bu ürün var, stok sayısı artır" vurgusu */
  const isExistingProductFromBarcode = !!barcodeParam && !!product;

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isExistingProductFromBarcode && (
        <View style={styles.existingBarcodeCard}>
          <Text style={styles.existingBarcodeTitle}>✓ Bu ürün kayıtlı</Text>
          <Text style={styles.existingBarcodeHint}>Stok sayısını artırmak için aşağıya eklenecek miktarı girin.</Text>
        </View>
      )}
      <View style={styles.productCard}>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productStock}>Mevcut stok: {cur} {product.unit ?? 'adet'}{isLow ? ' (Kritik)' : ''}</Text>
        <TouchableOpacity style={styles.changeProductBtn} onPress={clearProduct}>
          <Text style={styles.changeProductBtnText}>Başka ürün seç</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Eklenecek miktar ({product.unit ?? 'adet'})</Text>
      <TextInput
        style={styles.input}
        placeholder="0"
        placeholderTextColor="#6b7280"
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
      />

      <Text style={styles.label}>Ürün fotoğrafı (isteğe bağlı)</Text>
      {photo ? (
        <View style={styles.photoWrap}>
          <TouchableOpacity onPress={() => setPreviewUri(photo)} activeOpacity={0.8}>
            <CachedImage uri={photo} style={[styles.photo, styles.photoLarge]} contentFit="cover" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
        </View>
      ) : (
        <View style={styles.productPhotoRow}>
          <TouchableOpacity style={styles.cameraMainBtn} onPress={takeProductPhoto} disabled={uploading}>
            <Text style={styles.cameraMainBtnText}>📷 Kamera</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.galeriSmallBtn} onPress={pickProductPhoto} disabled={uploading}>
            <Text style={styles.galeriSmallBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.label}>Not</Text>
      <TextInput style={[styles.input, styles.textArea]} placeholder="Açıklama..." placeholderTextColor="#6b7280" multiline numberOfLines={2} value={notes} onChangeText={setNotes} />

      <Text style={styles.warning}>Stok girişiniz admin onayından sonra işlenecektir.</Text>

      <TouchableOpacity
        style={[styles.submit, (!quantity || parseInt(quantity, 10) <= 0) && styles.submitDisabled]}
        onPress={saveMovement}
        disabled={!quantity || parseInt(quantity, 10) <= 0}
      >
        <Text style={styles.submitText}>Stok girişi yap</Text>
      </TouchableOpacity>
    </ScrollView>
    <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 40 },
  barcodeBtn: { backgroundColor: '#b8860b', padding: 18, borderRadius: 12, marginBottom: 12 },
  barcodeBtnText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 17 },
  barcodeInfo: { backgroundColor: '#fef3c7', padding: 16, borderRadius: 12, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#b8860b' },
  barcodeInfoTitle: { fontSize: 16, fontWeight: '700', color: '#92400e' },
  barcodeLabel: { fontSize: 12, color: '#78716c', marginTop: 8, fontWeight: '600' },
  barcodeInfoCode: { fontSize: 14, fontFamily: 'monospace', color: '#b45309', marginTop: 4 },
  barcodeInfoHint: { fontSize: 13, color: '#6b7280', marginTop: 8 },
  backLink: { marginBottom: 12 },
  orLabel: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 16 },
  manuelGirisBtn: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#b8860b',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  manuelGirisBtnText: { fontSize: 15, fontWeight: '700', color: '#b8860b', textAlign: 'center' },
  manuelBarkodsuzBtn: {
    backgroundColor: '#ecfdf5',
    borderWidth: 2,
    borderColor: '#059669',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  manuelBarkodsuzBtnText: { fontSize: 15, fontWeight: '700', color: '#047857', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#374151' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#fff', color: '#111827' },
  textArea: { minHeight: 72 },
  searchList: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 8, backgroundColor: '#fff', maxHeight: 280 },
  searchItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  searchItemName: { fontSize: 15, fontWeight: '500' },
  searchItemStock: { fontSize: 13, color: '#6b7280' },
  existingBarcodeCard: {
    backgroundColor: '#ecfdf5',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#059669',
  },
  existingBarcodeTitle: { fontSize: 16, fontWeight: '700', color: '#047857' },
  existingBarcodeHint: { fontSize: 13, color: '#065f46', marginTop: 4 },
  productCard: { backgroundColor: '#fff', padding: 16, borderRadius: 12, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: '#b8860b' },
  productName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  productStock: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  changeProductBtn: { marginTop: 12 },
  changeProductBtnText: { fontSize: 14, color: '#b8860b', fontWeight: '600' },
  photoWrap: { position: 'relative', marginBottom: 16 },
  photo: { width: 120, height: 120, borderRadius: 10 },
  photoLarge: { width: '100%', height: 180 },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center' },
  removePhotoText: { color: '#fff', fontWeight: '700' },
  productPhotoRow: { position: 'relative', marginBottom: 16, minHeight: 56 },
  cameraMainBtn: { backgroundColor: '#b8860b', paddingVertical: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cameraMainBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  galeriSmallBtn: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    zIndex: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  galeriSmallBtnText: { color: '#374151', fontSize: 14, fontWeight: '600' },
  warning: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  submit: { backgroundColor: '#b8860b', padding: 16, borderRadius: 10 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 16 },
});
