import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import {
  fetchPartnerSettings,
  listPartnerHotels,
  todayIstanbulDate,
  type BreakfastPartnerHotel,
} from '@/lib/breakfastPartner';
import {
  canManagePartnerLaundry,
  formatLaundryQty,
  fmtPartnerMoney,
  listPartnerLaundryLedger,
  PARTNER_LAUNDRY_MAX_PHOTOS,
  PARTNER_LAUNDRY_PHOTO_BUCKET,
  partnerLaundryPhotoSubfolder,
  resolvePartnerLaundryUnitPriceSync,
  upsertPartnerLaundryEntry,
  type PartnerLaundryLedgerRow,
} from '@/lib/breakfastPartnerLaundry';
import { PartnerLaundryLedgerRow as LaundryRow } from '@/components/breakfastPartner/PartnerLaundryLedgerRow';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { FEED_MEDIA_UPLOAD_TIMEOUT_MS, promiseWithTimeout, uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

const UNIT_PRESETS = ['Adet', 'Kg', 'Poşet', 'Çanta', 'Makine'] as const;
type UnitPreset = (typeof UNIT_PRESETS)[number];

export default function StaffPartnerLaundryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const canManage = canManagePartnerLaundry(staff);
  const { orgId } = useBreakfastPartnerProviderOrgId();

  const [hotels, setHotels] = useState<BreakfastPartnerHotel[]>([]);
  const [defaultLaundryPrice, setDefaultLaundryPrice] = useState(0);
  const [entries, setEntries] = useState<PartnerLaundryLedgerRow[]>([]);
  const [hotelId, setHotelId] = useState<string | null>(null);
  const [washDate, setWashDate] = useState(todayIstanbulDate());
  const [quantity, setQuantity] = useState('');
  const [unitPreset, setUnitPreset] = useState<UnitPreset | 'Diğer'>('Poşet');
  const [customUnit, setCustomUnit] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [guestName, setGuestName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [note, setNote] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const unitLabel = useMemo(() => {
    if (unitPreset === 'Diğer') {
      const trimmed = customUnit.trim();
      return trimmed || 'Diğer';
    }
    return unitPreset;
  }, [unitPreset, customUnit]);

  const selectedHotel = useMemo(
    () => hotels.find((h) => h.id === hotelId) ?? null,
    [hotels, hotelId]
  );

  const effectivePrice = useMemo(() => {
    if (!selectedHotel) return defaultLaundryPrice;
    const typed = parseFloat(unitPrice.replace(',', '.'));
    if (Number.isFinite(typed) && typed > 0) return typed;
    return resolvePartnerLaundryUnitPriceSync(selectedHotel, defaultLaundryPrice);
  }, [selectedHotel, unitPrice, defaultLaundryPrice]);

  const previewTotal = useMemo(() => {
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) return 0;
    return Math.round(qty * effectivePrice * 100) / 100;
  }, [quantity, effectivePrice]);

  const load = useCallback(async () => {
    if (!orgId || !canManage) {
      setLoading(false);
      return;
    }
    try {
      const [hotelRows, settings, ledger] = await Promise.all([
        listPartnerHotels(orgId),
        fetchPartnerSettings(orgId),
        listPartnerLaundryLedger(80, null),
      ]);
      const active = hotelRows.filter((h) => h.status === 'active');
      setHotels(active);
      setDefaultLaundryPrice(settings?.default_laundry_unit_price ?? 0);
      setEntries(ledger);
      setHotelId((prev) => prev ?? active[0]?.id ?? null);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orgId, canManage]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onSelectHotel = (id: string) => {
    setHotelId(id);
    const hotel = hotels.find((h) => h.id === id);
    if (!hotel) return;
    const price = resolvePartnerLaundryUnitPriceSync(hotel, defaultLaundryPrice);
    setUnitPrice(price > 0 ? String(price) : '');
  };

  const takePhoto = async () => {
    if (photoUris.length >= PARTNER_LAUNDRY_MAX_PHOTOS) {
      Alert.alert('Limit', `En fazla ${PARTNER_LAUNDRY_MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`);
      return;
    }
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Çamaşır kaydı için fotoğraf çekmek üzere kamera erişimi gerekiyor.',
      settingsMessage: 'Ayarlar üzerinden kamera iznini açın.',
    });
    if (!granted) return;
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (r.canceled || !r.assets[0]?.uri) return;
    setPhotoUris((prev) => [...prev, r.assets[0].uri].slice(0, PARTNER_LAUNDRY_MAX_PHOTOS));
  };

  const pickFromGallery = async () => {
    if (photoUris.length >= PARTNER_LAUNDRY_MAX_PHOTOS) {
      Alert.alert('Limit', `En fazla ${PARTNER_LAUNDRY_MAX_PHOTOS} fotoğraf ekleyebilirsiniz.`);
      return;
    }
    const remaining = PARTNER_LAUNDRY_MAX_PHOTOS - photoUris.length;
    const uris = await pickGalleryImages({
      quality: 0.8,
      selectionLimit: remaining,
      permission: {
        title: 'Galeri izni',
        message: 'Çamaşır kaydı için fotoğraf seçmek üzere galeri erişimi gerekiyor.',
        settingsMessage: 'Ayarlar üzerinden galeri iznini açın.',
      },
    });
    if (!uris.length) return;
    setPhotoUris((prev) => [...prev, ...uris].slice(0, PARTNER_LAUNDRY_MAX_PHOTOS));
  };

  const removePhotoAt = (idx: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!hotelId || !orgId) {
      Alert.alert('Hata', 'Partner otel seçin.');
      return;
    }
    const qty = parseFloat(quantity.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Hata', 'Geçerli miktar girin (örn. 1).');
      return;
    }
    if (unitPreset === 'Diğer' && !customUnit.trim()) {
      Alert.alert('Hata', 'Birim yazın (örn. Torba, Sepet).');
      return;
    }
    const price = parseFloat(unitPrice.replace(',', '.'));
    setSaving(true);
    try {
      const uploadedUrls: string[] = [];
      const subfolder = partnerLaundryPhotoSubfolder(orgId, hotelId);
      for (const uri of photoUris) {
        const { publicUrl } = await promiseWithTimeout(
          uploadUriToPublicBucket({
            bucketId: PARTNER_LAUNDRY_PHOTO_BUCKET,
            uri,
            kind: 'image',
            subfolder,
          }),
          FEED_MEDIA_UPLOAD_TIMEOUT_MS,
          'Fotoğraf yükleme zaman aşımı. Wi‑Fi deneyin veya daha küçük fotoğraf seçin.'
        );
        uploadedUrls.push(publicUrl);
      }

      const { error } = await upsertPartnerLaundryEntry({
        partnerHotelId: hotelId,
        washDate,
        quantity: qty,
        unitLabel: unitLabel.slice(0, 24),
        unitPrice: Number.isFinite(price) && price > 0 ? price : null,
        guestName: guestName.trim() || null,
        roomNumber: roomNumber.trim() || null,
        note: note.trim() || null,
        photoUrls: uploadedUrls,
      });
      if (error) throw new Error(error);
      Alert.alert('Kaydedildi', 'Çamaşır kaydı carisine işlendi. Partner otel bilgilendirildi.');
      setQuantity('');
      setGuestName('');
      setRoomNumber('');
      setNote('');
      setPhotoUris([]);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Kayıt başarısız');
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.denied}>Çamaşır kaydı yetkiniz yok.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
      }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={partnerTheme.accent}
        />
      }
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
        <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        <Text style={styles.backText}>Geri</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Partner çamaşır kaydı</Text>
      <Text style={styles.subtitle}>
        Miktar + birim, kişi/oda ve fotoğraf ile kayıt. Not ile tek makine vb. ekleyebilirsiniz.
      </Text>

      {loading ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Text style={styles.label}>Partner otel</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {hotels.map((h) => {
              const active = h.id === hotelId;
              return (
                <TouchableOpacity
                  key={h.id}
                  onPress={() => onSelectHotel(h.id)}
                  style={[styles.hotelChip, active && styles.hotelChipActive]}
                >
                  <Text style={[styles.hotelChipText, active && styles.hotelChipTextActive]}>{h.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <Text style={styles.label}>Yıkama tarihi (YYYY-MM-DD)</Text>
          <TextInput
            value={washDate}
            onChangeText={setWashDate}
            style={styles.input}
            placeholder={todayIstanbulDate()}
            placeholderTextColor={partnerTheme.muted}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Kişi adı</Text>
          <TextInput
            value={guestName}
            onChangeText={setGuestName}
            style={styles.input}
            placeholder="örn. Ahmed Yılmaz"
            placeholderTextColor={partnerTheme.muted}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Oda no</Text>
          <TextInput
            value={roomNumber}
            onChangeText={setRoomNumber}
            style={styles.input}
            placeholder="örn. 204"
            placeholderTextColor={partnerTheme.muted}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Miktar</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="örn. 1"
            placeholderTextColor={partnerTheme.muted}
          />

          <Text style={styles.label}>Birim (poşet, çanta, makine…)</Text>
          <View style={styles.unitRow}>
            {UNIT_PRESETS.map((u) => {
              const active = unitPreset === u;
              return (
                <TouchableOpacity
                  key={u}
                  onPress={() => setUnitPreset(u)}
                  style={[styles.unitChip, active && styles.unitChipActive]}
                >
                  <Text style={[styles.unitChipText, active && styles.unitChipTextActive]}>{u}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setUnitPreset('Diğer')}
              style={[styles.unitChip, unitPreset === 'Diğer' && styles.unitChipActive]}
            >
              <Text
                style={[styles.unitChipText, unitPreset === 'Diğer' && styles.unitChipTextActive]}
              >
                Diğer
              </Text>
            </TouchableOpacity>
          </View>
          {unitPreset === 'Diğer' ? (
            <TextInput
              value={customUnit}
              onChangeText={setCustomUnit}
              style={styles.input}
              placeholder="örn. Torba, Sepet, Çuval"
              placeholderTextColor={partnerTheme.muted}
              maxLength={24}
              autoCapitalize="sentences"
            />
          ) : null}

          <Text style={styles.label}>Birim fiyat (₺)</Text>
          <TextInput
            value={unitPrice}
            onChangeText={setUnitPrice}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder={
              effectivePrice > 0 ? String(effectivePrice) : 'Varsayılan fiyat tanımlayın'
            }
            placeholderTextColor={partnerTheme.muted}
          />

          <Text style={styles.label}>
            Fotoğraf ({photoUris.length}/{PARTNER_LAUNDRY_MAX_PHOTOS})
          </Text>
          <View style={styles.photoActions}>
            <TouchableOpacity style={[styles.photoBtn, styles.photoBtnCamera]} onPress={() => void takePhoto()}>
              <Ionicons name="camera-outline" size={18} color="#0f172a" />
              <Text style={styles.photoBtnText}>Çek</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.photoBtn, styles.photoBtnGallery]} onPress={() => void pickFromGallery()}>
              <Ionicons name="images-outline" size={18} color="#1d4ed8" />
              <Text style={[styles.photoBtnText, { color: '#1d4ed8' }]}>Galeri</Text>
            </TouchableOpacity>
          </View>
          {photoUris.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
              {photoUris.map((uri, idx) => (
                <View key={`${uri}-${idx}`} style={styles.photoWrap}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <TouchableOpacity style={styles.photoRemove} onPress={() => removePhotoAt(idx)}>
                    <Ionicons name="close" size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}

          <Text style={styles.label}>Not (isteğe bağlı)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[styles.input, { minHeight: 64 }]}
            multiline
            placeholder="örn. tek makine"
            placeholderTextColor={partnerTheme.muted}
          />

          <View style={styles.preview}>
            <Text style={styles.previewLbl}>Önizleme</Text>
            <Text style={styles.previewVal}>
              {quantity
                ? `${formatLaundryQty(parseFloat(quantity.replace(',', '.')) || 0, unitLabel)} × ${fmtPartnerMoney(effectivePrice)} = ${fmtPartnerMoney(previewTotal)}`
                : '—'}
            </Text>
            {(guestName.trim() || roomNumber.trim()) && (
              <Text style={styles.previewMeta}>
                {[roomNumber.trim() ? `Oda ${roomNumber.trim()}` : null, guestName.trim() || null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            )}
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text style={styles.saveText}>Kaydet ve carisine işle</Text>
            )}
          </TouchableOpacity>

          <Text style={[styles.title, { fontSize: 18, marginTop: 28 }]}>Son kayıtlar</Text>
          {entries.length === 0 ? (
            <Text style={styles.subtitle}>Henüz çamaşır kaydı yok.</Text>
          ) : (
            entries.map((e) => <LaundryRow key={e.id} entry={e} showHotel />)
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  denied: { color: partnerTheme.muted, marginBottom: 12 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backBtn: { padding: 10 },
  backText: { color: partnerTheme.text, fontWeight: '600' },
  title: { color: partnerTheme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: partnerTheme.muted, marginTop: 4, marginBottom: 16, lineHeight: 20 },
  label: { color: partnerTheme.muted, fontWeight: '700', fontSize: 12, marginBottom: 6, marginTop: 4 },
  input: {
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    borderRadius: partnerRadii.md,
    color: partnerTheme.text,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
  },
  hotelChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    marginRight: 8,
    backgroundColor: partnerTheme.card,
  },
  hotelChipActive: { backgroundColor: '#dbeafe', borderColor: '#3b82f6' },
  hotelChipText: { color: partnerTheme.text, fontWeight: '600', fontSize: 13 },
  hotelChipTextActive: { color: '#1d4ed8' },
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  unitChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: partnerRadii.sm,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    backgroundColor: partnerTheme.card,
  },
  unitChipActive: { backgroundColor: partnerTheme.accent, borderColor: partnerTheme.accent },
  unitChipText: { color: partnerTheme.text, fontWeight: '700' },
  unitChipTextActive: { color: '#0f172a' },
  photoActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: partnerRadii.sm,
    borderWidth: 1,
  },
  photoBtnCamera: { backgroundColor: partnerTheme.accent, borderColor: partnerTheme.accent },
  photoBtnGallery: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  photoBtnText: { color: '#0f172a', fontWeight: '800', fontSize: 13 },
  photoStrip: { marginBottom: 10 },
  photoWrap: { marginRight: 10, position: 'relative' },
  photoThumb: { width: 88, height: 88, borderRadius: partnerRadii.sm, backgroundColor: '#e2e8f0' },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  preview: {
    backgroundColor: '#eff6ff',
    borderRadius: partnerRadii.md,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  previewLbl: { color: '#64748b', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  previewVal: { color: partnerTheme.text, fontWeight: '800', marginTop: 4, fontSize: 15 },
  previewMeta: { color: '#64748b', marginTop: 4, fontWeight: '600', fontSize: 13 },
  saveBtn: {
    backgroundColor: partnerTheme.accent,
    borderRadius: partnerRadii.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#0f172a', fontWeight: '800', fontSize: 15 },
});
