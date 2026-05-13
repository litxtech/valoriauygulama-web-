import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';

type Product = { id: string; name: string; unit: string | null; current_stock: number | null };

export default function StockMovementScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ type?: string; productId?: string }>();
  const type = (params.type as 'in' | 'out') || 'in';
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';

  useEffect(() => {
    navigation.setOptions({ title: type === 'in' ? 'Stok Girişi' : 'Stok Çıkışı' });
  }, [type, navigation]);

  const [product, setProduct] = useState<Product | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [staffImage, setStaffImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    const orgId = canUseAllOrganizations ? selectedOrganizationId : staff?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    if (params.productId) {
      let q = supabase.from('stock_products').select('id, name, unit, current_stock').eq('id', params.productId);
      if (orgScoped) q = q.eq('organization_id', orgScoped);
      q.single().then(({ data }) => setProduct(data ?? null));
    } else {
      let q = supabase.from('stock_products').select('id, name, unit, current_stock').order('name');
      if (orgScoped) q = q.eq('organization_id', orgScoped);
      q.then(({ data }) => setProducts(data ?? []));
    }
  }, [params.productId, canUseAllOrganizations, selectedOrganizationId, staff?.organization_id]);

  const uploadPhotoFromUri = async (uri: string): Promise<string> => {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: 'stock-proofs',
      uri,
      subfolder: 'stock',
    });
    return publicUrl;
  };

  const takePhoto = async (kind: 'staff' | 'product') => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Stok hareketine fotoğraf eklemek için kamera erişimi gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Stok fotoğrafı için ayarlardan izin verin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadPhotoFromUri(result.assets[0].uri);
      if (kind === 'staff') setStaffImage(url);
      else setPhoto(url);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const pickPhoto = async (kind: 'staff' | 'product') => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Stok hareketine fotograf eklemek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Stok fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.6,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploading(true);
    try {
      const url = await uploadPhotoFromUri(result.assets[0].uri);
      if (kind === 'staff') setStaffImage(url);
      else setPhoto(url);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const saveMovement = async () => {
    if (!product || !quantity || !staff?.id) {
      Alert.alert('Eksik', 'Ürün, miktar ve giriş yapmış personel gerekli.');
      return;
    }
    const q = parseInt(quantity, 10);
    if (isNaN(q) || q <= 0) {
      Alert.alert('Hata', 'Geçerli miktar girin.');
      return;
    }
    if (type === 'out') {
      const cur = product.current_stock ?? 0;
      if (q > cur) {
        Alert.alert('Yetersiz stok', `Mevcut stok: ${cur} ${product.unit ?? 'adet'}. Çıkış miktarı bu değeri aşamaz.`);
        return;
      }
    }
    const { data: movement, error } = await supabase
      .from('stock_movements')
      .insert({
        product_id: product.id,
        movement_type: type,
        quantity: q,
        staff_id: staff.id,
        staff_image: staffImage,
        photo_proof: photo,
        notes: notes || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Admin onayından sonra stok güncellenecek.', () => router.back());
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.title}>{type === 'in' ? 'Stok Girişi' : 'Stok Çıkışı'}</Text>

      {(!params.productId) ? (
        <View style={styles.section}>
          <TouchableOpacity style={styles.barcodeBtn} onPress={() => router.push('/admin/stock/scan')}>
            <Text style={styles.barcodeBtnText}>📷 Barkod Okut</Text>
          </TouchableOpacity>
          <Text style={styles.label}>veya ürün ara</Text>
          <TextInput style={styles.input} placeholder="Ürün adı..." value={search} onChangeText={setSearch} />
          {search.length >= 2 && (
            <View style={styles.searchList}>
              {filteredProducts.slice(0, 10).map((p) => (
                <TouchableOpacity key={p.id} style={styles.searchItem} onPress={() => { setProduct(p); setSearch(''); }}>
                  <Text>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      ) : null}

      {product && (
        <View style={styles.section}>
          <Text style={styles.label}>Seçilen ürün</Text>
          <View style={styles.productBox}>
            <Text style={styles.productName}>{product.name}</Text>
            <Text style={styles.productStock}>Mevcut: {product.current_stock ?? 0} {product.unit ?? 'adet'}</Text>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Miktar ({product?.unit ?? 'adet'})</Text>
        <TextInput style={styles.input} placeholder="0" keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Teslim alan çalışan fotoğrafı</Text>
        {staffImage ? (
          <View style={styles.photoWrap}>
            <TouchableOpacity onPress={() => setPreviewUri(staffImage)} activeOpacity={0.8}>
              <CachedImage uri={staffImage} style={styles.photo} contentFit="cover" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.removePhoto} onPress={() => setStaffImage(null)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoButtonsRow}>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={() => takePhoto('staff')} disabled={uploading}>
              <Text style={styles.photoPlaceholderText}>📷 Çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={() => pickPhoto('staff')} disabled={uploading}>
              <Text style={styles.photoPlaceholderText}>📁 Galeri</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Ürün fotoğrafı (kanıt)</Text>
        {photo ? (
          <View style={styles.photoWrap}>
            <TouchableOpacity onPress={() => setPreviewUri(photo)} activeOpacity={0.8}>
              <CachedImage uri={photo} style={[styles.photo, styles.photoLarge]} contentFit="cover" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.removePhoto} onPress={() => setPhoto(null)}><Text style={styles.removePhotoText}>✕</Text></TouchableOpacity>
          </View>
        ) : (
          <View style={styles.photoButtonsRow}>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={() => takePhoto('product')} disabled={uploading}>
              <Text style={styles.photoPlaceholderText}>📷 Çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoPlaceholder} onPress={() => pickPhoto('product')} disabled={uploading}>
              <Text style={styles.photoPlaceholderText}>📁 Galeri</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Notlar</Text>
        <TextInput style={[styles.input, styles.textArea]} placeholder="Açıklama..." multiline numberOfLines={3} value={notes} onChangeText={setNotes} />
      </View>

      <TouchableOpacity
        style={[styles.submit, (!product || !quantity) && styles.submitDisabled]}
        onPress={saveMovement}
        disabled={!product || !quantity}
      >
        <Text style={styles.submitText}>{type === 'in' ? 'STOK GİRİŞİ YAP' : 'STOK ÇIKIŞI YAP'}</Text>
      </TouchableOpacity>
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  section: { marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 14 },
  textArea: { minHeight: 80 },
  searchList: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 8, maxHeight: 200 },
  searchItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  productBox: { backgroundColor: '#f9fafb', padding: 16, borderRadius: 10 },
  productName: { fontSize: 16, fontWeight: '700' },
  productStock: { fontSize: 14, color: '#666', marginTop: 4 },
  photoWrap: { position: 'relative' },
  photo: { width: 120, height: 120, borderRadius: 10 },
  photoLarge: { width: '100%', height: 180 },
  removePhoto: { position: 'absolute', top: 4, right: 4, width: 28, height: 28, borderRadius: 14, backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center' },
  removePhotoText: { color: '#fff', fontWeight: '700' },
  photoButtonsRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  photoPlaceholder: { flex: 1, borderWidth: 2, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 10, padding: 20, alignItems: 'center' },
  photoPlaceholderText: { color: '#6b7280', fontSize: 14 },
  submit: { backgroundColor: '#b8860b', padding: 16, borderRadius: 10 },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 16 },
  barcodeBtn: { backgroundColor: '#1a365d', padding: 16, borderRadius: 10, marginBottom: 16 },
  barcodeBtnText: { color: '#fff', fontWeight: '700', textAlign: 'center', fontSize: 16 },
});
