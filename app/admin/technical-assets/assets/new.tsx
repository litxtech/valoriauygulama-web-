import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { canAccessTechnicalAssetsAdminRoutes } from '@/lib/staffPermissions';
import { TECH_CATEGORY_GROUPS } from '@/lib/technicalAssets';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

const CRIT = [
  { value: 'low', label: 'Düşük' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksek' },
  { value: 'critical', label: 'Kritik' },
] as const;

export default function AdminTechnicalAssetNewScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const ok = canAccessTechnicalAssetsAdminRoutes(staff);

  const [saving, setSaving] = useState(false);

  const [assetCode, setAssetCode] = useState('');
  const [name, setName] = useState('');
  const [catGroup, setCatGroup] = useState(TECH_CATEGORY_GROUPS[0].value);
  const [catLabel, setCatLabel] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [criticality, setCriticality] = useState<string>('medium');
  const [functionText, setFunctionText] = useState('');
  const [ifClosed, setIfClosed] = useState('');
  const [affected, setAffected] = useState('');
  const [emergency, setEmergency] = useState('');
  const [warnings, setWarnings] = useState('');
  const [description, setDescription] = useState('');
  const [usageGuideText, setUsageGuideText] = useState('');
  const [usageVideoUri, setUsageVideoUri] = useState('');
  const whoCloseDefault = 'Teknik personel / Yönetici';
  const whoOpenDefault = 'Teknik personel';
  const [tagline, setTagline] = useState('');
  const [photosRaw, setPhotosRaw] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  useEffect(() => {
    if (!ok) {
      router.replace('/admin');
    }
  }, [ok, router]);

  const MAX_GALLERY_PICK = 10;

  const resolveBuildingId = async (): Promise<{ id: string | null; error?: string }> => {
    if (!orgId) return { id: null, error: 'Organizasyon eksik.' };
    const bName = buildingName.trim();
    if (!bName) return { id: null };

    const { data: exact } = await supabase
      .from('tech_buildings')
      .select('id')
      .eq('organization_id', orgId)
      .eq('name', bName)
      .maybeSingle();
    if (exact?.id) return { id: exact.id };

    const { data: rows } = await supabase
      .from('tech_buildings')
      .select('id, name')
      .eq('organization_id', orgId)
      .ilike('name', bName)
      .limit(10);
    const list = (rows ?? []) as { id: string; name: string }[];
    const ci = list.find((r) => r.name.trim().toLowerCase() === bName.toLowerCase());
    if (ci?.id) return { id: ci.id };

    const { data: inserted, error } = await supabase
      .from('tech_buildings')
      .insert({
        organization_id: orgId,
        name: bName,
        sort_order: 999,
      })
      .select('id')
      .maybeSingle();

    if (!error && inserted?.id) return { id: inserted.id };

    if (error?.code === '23505') {
      const { data: again } = await supabase
        .from('tech_buildings')
        .select('id')
        .eq('organization_id', orgId)
        .eq('name', bName)
        .maybeSingle();
      if (again?.id) return { id: again.id };
    }

    return { id: null, error: error?.message ?? 'Bina oluşturulamadı.' };
  };

  const resolveLocationId = async (buildingId: string): Promise<{ id: string | null; error?: string }> => {
    if (!orgId || !buildingId) return { id: null, error: 'Organizasyon veya bina eksik.' };
    const locName = locationName.trim();
    if (!locName) return { id: null };

    const { data: exact } = await supabase
      .from('tech_locations')
      .select('id')
      .eq('organization_id', orgId)
      .eq('building_id', buildingId)
      .eq('name', locName)
      .maybeSingle();
    if (exact?.id) return { id: exact.id };

    const { data: rows } = await supabase
      .from('tech_locations')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('building_id', buildingId)
      .ilike('name', locName)
      .limit(10);
    const list = (rows ?? []) as { id: string; name: string }[];
    const ci = list.find((r) => r.name.trim().toLowerCase() === locName.toLowerCase());
    if (ci?.id) return { id: ci.id };

    const { data: inserted, error } = await supabase
      .from('tech_locations')
      .insert({
        organization_id: orgId,
        building_id: buildingId,
        name: locName,
        sort_order: 999,
      })
      .select('id')
      .maybeSingle();

    if (!error && inserted?.id) return { id: inserted.id };

    if (error?.code === '23505') {
      const { data: again } = await supabase
        .from('tech_locations')
        .select('id')
        .eq('organization_id', orgId)
        .eq('building_id', buildingId)
        .eq('name', locName)
        .maybeSingle();
      if (again?.id) return { id: again.id };
    }

    return { id: null, error: error?.message ?? 'Lokasyon oluşturulamadı.' };
  };

  const pickFromGallery = async () => {
    const picked = await pickGalleryImages({
      quality: 0.72,
      selectionLimit: MAX_GALLERY_PICK,
      permission: {
        title: 'Galeri izni',
        message: 'Varlık fotoğrafı seçmek için galeri erişimi gerekiyor.',
        settingsMessage: 'Galeri izni kapalı. Ayarlardan galeri iznini açın.',
      },
    });
    if (!picked.length) return;
    setPhotoUris((prev) => [...prev, ...picked].slice(0, 24));
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Varlık fotoğrafı çekmek için kamera erişimi gerekiyor.',
      settingsMessage: 'Kamera izni kapalı. Ayarlardan kamera iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.72,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setPhotoUris((prev) => [...prev, result.assets[0].uri].slice(0, 24));
  };

  const removePhotoAt = (index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  };

  const pickUsageVideo = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Kullanım videosu seçmek için galeri erişimi gerekiyor.',
      settingsMessage: 'Galeri izni kapalı. Ayarlardan galeri iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.85,
      videoMaxDuration: 600,
    });
    if (!result.canceled && result.assets[0]?.uri) setUsageVideoUri(result.assets[0].uri);
  };

  const save = async () => {
    if (!orgId || !staff?.id) return;
    if (!name.trim()) {
      Alert.alert('Eksik', 'Görünen ad zorunlu.');
      return;
    }
    if (!buildingName.trim()) {
      Alert.alert('Eksik', 'Bina adı yazın (yeni veya mevcut isimle eşleşir).');
      return;
    }
    if (!locationName.trim()) {
      Alert.alert('Eksik', 'Lokasyon alanına bir metin yazın (listeden bağımsız; gerekirse yeni lokasyon oluşturulur).');
      return;
    }
    const { id: resolvedBuildingId, error: buildingErr } = await resolveBuildingId();
    if (!resolvedBuildingId) {
      Alert.alert('Hata', buildingErr ?? 'Bina kaydedilemedi.');
      return;
    }
    const { id: locationId, error: locationErr } = await resolveLocationId(resolvedBuildingId);
    if (!locationId) {
      Alert.alert('Hata', locationErr ?? 'Lokasyon kaydedilemedi.');
      return;
    }
    const assetCodeForDb =
      assetCode.trim().length > 0 ? assetCode : `AUTO-${Date.now()}`;
    const categoryLabelResolved = catLabel.trim() || name.trim();
    const manualUrls = photosRaw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (photoUris.length > 0) {
        uploadedUrls = await Promise.all(
          photoUris.map(async (uri) => {
            const { publicUrl } = await uploadUriToPublicBucket({
              bucketId: 'tech-assets',
              uri,
              subfolder: 'assets',
            });
            return publicUrl;
          })
        );
      }
      const urls = [...uploadedUrls, ...manualUrls];
      let usageGuideVideoUrl: string | null = null;
      if (usageVideoUri) {
        const uploaded = await uploadUriToPublicBucket({
          bucketId: 'tech-assets',
          uri: usageVideoUri,
          kind: 'video',
          subfolder: `usage-guides/${orgId}/new`,
        });
        usageGuideVideoUrl = uploaded.publicUrl;
      }
      const { data, error } = await supabase
        .from('tech_assets')
        .insert({
          organization_id: orgId,
          asset_code: assetCodeForDb,
          name: name.trim(),
          category_group: catGroup,
          category_label: categoryLabelResolved,
          building_id: resolvedBuildingId,
          location_id: locationId,
          function_text: functionText.trim() || null,
          if_closed_effects: ifClosed.trim() || null,
          affected_areas: affected.trim() || null,
          emergency_action: emergency.trim() || null,
          warning_text: warnings.trim() || null,
          description: description.trim() || null,
          usage_guide_text: usageGuideText.trim() || null,
          usage_guide_video_url: usageGuideVideoUrl,
          who_can_close: whoCloseDefault,
          who_can_open: whoOpenDefault,
          criticality,
          status: 'active',
          photo_urls: urls,
          qr_payload: '',
          is_public: true,
          label_tagline: tagline.trim() || null,
          created_by_staff_id: staff.id,
        })
        .select('id')
        .maybeSingle();
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      if (data?.id) router.replace(`/admin/technical-assets/assets/${data.id}`);
      else Alert.alert('Hata', 'Kayıt oluşturulamadı.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Fotoğraflar yüklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (!ok || !orgId) return null;

  return (
    <>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Varlık kodu (isteğe bağlı; boş bırakılırsa otomatik atanır)</Text>
      <Text style={styles.hint}>İstediğiniz metin kaydedilir (harf, rakam, boşluk, tire vb.).</Text>
      <TextInput style={styles.input} value={assetCode} onChangeText={setAssetCode} placeholderTextColor="#a0aec0" placeholder="Boş bırakılabilir" />

      <Text style={styles.label}>Görünen ad</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Ana kategori</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
        {TECH_CATEGORY_GROUPS.map((c) => (
          <TouchableOpacity key={c.value} style={[styles.chip, catGroup === c.value && styles.chipOn]} onPress={() => setCatGroup(c.value)}>
            <Text style={[styles.chipText, catGroup === c.value && styles.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Alt kategori (isteğe bağlı; boşsa görünen ad kullanılır)</Text>
      <TextInput style={styles.input} value={catLabel} onChangeText={setCatLabel} placeholderTextColor="#a0aec0" placeholder="Örn: Ana sigorta" />

      <Text style={styles.label}>Kritiklik</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
        {CRIT.map((c) => (
          <TouchableOpacity key={c.value} style={[styles.chip, criticality === c.value && styles.chipOn]} onPress={() => setCriticality(c.value)}>
            <Text style={[styles.chipText, criticality === c.value && styles.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>Bina</Text>
      <Text style={styles.hint}>Yazdığınız ad kullanılır; organizasyonda aynı isimde bina varsa bağlanır, yoksa oluşturulur.</Text>
      <TextInput
        style={styles.input}
        value={buildingName}
        onChangeText={setBuildingName}
        placeholder="Örn: Ana bina, Bungalov 2"
        placeholderTextColor="#a0aec0"
      />

      <Text style={styles.label}>Lokasyon</Text>
      <Text style={styles.hint}>Yazdığınız metin kullanılır; bu bina için aynı isimde kayıt varsa bağlanır, yoksa otomatik oluşturulur.</Text>
      <TextInput
        style={styles.input}
        value={locationName}
        onChangeText={setLocationName}
        placeholder="Örn: Bodrum elektrik odası, çatı NVR"
        placeholderTextColor="#a0aec0"
      />

      <Text style={styles.label}>Ne işe yarar?</Text>
      <TextInput style={[styles.input, styles.tall]} value={functionText} onChangeText={setFunctionText} multiline placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Kapatılırsa ne olur?</Text>
      <TextInput style={[styles.input, styles.tall]} value={ifClosed} onChangeText={setIfClosed} multiline placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Etkilediği alanlar (satır satır)</Text>
      <TextInput style={[styles.input, styles.tall]} value={affected} onChangeText={setAffected} multiline placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Acil durumda yapılacaklar</Text>
      <TextInput style={[styles.input, styles.tall]} value={emergency} onChangeText={setEmergency} multiline placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Uyarılar (isteğe bağlı)</Text>
      <TextInput style={[styles.input, styles.tall]} value={warnings} onChangeText={setWarnings} multiline placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Hakkında / açıklama</Text>
      <TextInput
        style={[styles.input, styles.tall]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholder="QR sayfasında gösterilecek ürün veya ekipman açıklaması"
        placeholderTextColor="#a0aec0"
      />

      <Text style={styles.label}>Kullanım talimatı</Text>
      <TextInput
        style={[styles.input, styles.tall]}
        value={usageGuideText}
        onChangeText={setUsageGuideText}
        multiline
        placeholder="Kullanım adımları, dikkat edilecek noktalar…"
        placeholderTextColor="#a0aec0"
      />

      <Text style={styles.label}>Kullanım videosu (en fazla 10 dakika)</Text>
      <TouchableOpacity style={styles.videoBtn} onPress={pickUsageVideo} disabled={saving}>
        <Text style={styles.videoBtnText}>{usageVideoUri ? 'Video seçildi — değiştirmek için dokun' : 'Galeriden video seç'}</Text>
      </TouchableOpacity>
      {usageVideoUri ? (
        <TouchableOpacity style={styles.videoRemove} onPress={() => setUsageVideoUri('')} disabled={saving}>
          <Text style={styles.videoRemoveText}>Videoyu kaldır</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.label}>Etiket kısa satır — fiziksel etiket (isteğe bağlı)</Text>
      <TextInput style={styles.input} value={tagline} onChangeText={setTagline} placeholderTextColor="#a0aec0" />

      <Text style={styles.label}>Fotoğraflar</Text>
      <Text style={styles.hint}>Kameradan çekin veya galeriden seçin; kayıtta Supabase’e yüklenir (en fazla 24).</Text>
      <View style={styles.photoActions}>
        <TouchableOpacity style={[styles.photoBtn, styles.photoBtnCamera]} onPress={takePhoto} disabled={saving}>
          <Text style={styles.photoBtnText}>Kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.photoBtn, styles.photoBtnGallery]} onPress={pickFromGallery} disabled={saving}>
          <Text style={styles.photoBtnText}>Galeri</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.photosWrap}>
        {photoUris.map((uri, idx) => (
          <View key={`${uri}-${idx}`} style={styles.photoTile}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setPreviewUri(uri)} disabled={saving}>
              <CachedImage uri={uri} style={styles.photoThumb} contentFit="cover" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoRemove} onPress={() => removePhotoAt(idx)} disabled={saving} hitSlop={8}>
              <Text style={styles.photoRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.label}>Ek fotoğraf URL’leri (isteğe bağlı, virgül veya satır)</Text>
      <TextInput style={[styles.input, styles.tall]} value={photosRaw} onChangeText={setPhotosRaw} multiline placeholderTextColor="#a0aec0" />

      <TouchableOpacity style={[styles.save, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Kaydet ve QR’e git</Text>}
      </TouchableOpacity>
    </ScrollView>
    <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', color: '#4a5568', marginTop: 14, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: '#1a202c',
  },
  tall: { minHeight: 88, textAlignVertical: 'top' },
  rowScroll: { marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 8,
  },
  chipOn: { backgroundColor: '#1a365d', borderColor: '#1a365d' },
  chipText: { fontSize: 13, fontWeight: '700', color: '#4a5568' },
  chipTextOn: { color: '#fff' },
  hint: { fontSize: 12, color: '#718096', marginBottom: 10, lineHeight: 18 },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  photoBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  photoBtnCamera: { backgroundColor: '#0284c7' },
  photoBtnGallery: { backgroundColor: '#1a365d' },
  photoBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  videoBtn: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  videoBtnText: { color: '#1a365d', fontWeight: '800', fontSize: 14 },
  videoRemove: { alignSelf: 'center', paddingVertical: 10 },
  videoRemoveText: { color: '#dc2626', fontWeight: '700', fontSize: 13 },
  photosWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  photoTile: { position: 'relative' },
  photoThumb: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#e2e8f0' },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1a202c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
  save: { marginTop: 24, backgroundColor: '#b8860b', padding: 16, borderRadius: 12, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
