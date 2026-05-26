import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { uploadUriToPublicBucket, promiseWithTimeout, FEED_MEDIA_UPLOAD_TIMEOUT_MS } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  fetchBreakfastSettings,
  canBreakfastSubmitUi,
  appPermissionTruthy,
  type BreakfastConfirmationSettings,
  type BreakfastConfirmationRow,
} from '@/lib/breakfastConfirm';

const BUCKET = 'breakfast-confirm';

function todayIstanbulDateString(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function nowIstanbulClock(): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date());
}

export default function StaffBreakfastConfirmScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [settings, setSettings] = useState<BreakfastConfirmationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<BreakfastConfirmationRow | null>(null);
  const [note, setNote] = useState('');
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [existingUrls, setExistingUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!staff?.organization_id || !staff.id) {
      setLoading(false);
      return;
    }
    const today = todayIstanbulDateString();
    const [cfgRes, rowRes] = await Promise.all([
      fetchBreakfastSettings(staff.organization_id),
      supabase
        .from('breakfast_confirmations')
        .select('*')
        .eq('organization_id', staff.organization_id)
        .eq('staff_id', staff.id)
        .eq('record_date', today)
        .maybeSingle(),
    ]);
    setSettings(cfgRes);
    const row = rowRes.data as BreakfastConfirmationRow | null;
    if (rowRes.error && rowRes.error.code !== 'PGRST116') {
      Alert.alert('Hata', rowRes.error.message);
    }
    setExisting(row);
    if (row) {
      setNote(row.note ?? '');
      setExistingUrls(Array.isArray(row.photo_urls) ? row.photo_urls : []);
      setPhotoUris([]);
    } else {
      setNote('');
      setExistingUrls([]);
      setPhotoUris([]);
    }
    setLoading(false);
  }, [staff?.organization_id, staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const canSubmit = staff && settings && canBreakfastSubmitUi(staff, settings);

  const maxPhotos = settings?.max_photos ?? 3;
  const minPhotos = settings?.min_photos ?? 1;

  const totalPhotoCount = existingUrls.length + photoUris.length;

  const pickFromLibrary = async () => {
    if (totalPhotoCount >= maxPhotos) {
      Alert.alert('Limit', `En fazla ${maxPhotos} fotoğraf yükleyebilirsiniz.`);
      return;
    }
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Kahvaltı teyidi için fotoğraf seçmek üzere galeri erişimi gerekiyor.',
      settingsMessage: 'Ayarlar üzerinden galeri iznini açın.',
    });
    if (!granted) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (r.canceled || !r.assets[0]?.uri) return;
    setPhotoUris((prev) => [...prev, r.assets[0].uri]);
  };

  const takePhoto = async () => {
    if (totalPhotoCount >= maxPhotos) {
      Alert.alert('Limit', `En fazla ${maxPhotos} fotoğraf yükleyebilirsiniz.`);
      return;
    }
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Kahvaltı teyidi için fotoğraf çekmek üzere kamera erişimi gerekiyor.',
      settingsMessage: 'Ayarlar üzerinden kamera iznini açın.',
    });
    if (!granted) return;
    const r = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (r.canceled || !r.assets[0]?.uri) return;
    setPhotoUris((prev) => [...prev, r.assets[0].uri]);
  };

  const removeNewAt = (idx: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeExistingAt = (idx: number) => {
    setExistingUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!staff?.organization_id || !canSubmit) {
      Alert.alert('Yetki yok', 'Kahvaltı teyidi için uygun değilsiniz veya özellik kapalı.');
      return;
    }
    const urls = [...existingUrls];
    if (urls.length + photoUris.length < minPhotos) {
      Alert.alert('Eksik', `En az ${minPhotos} fotoğraf gerekli.`);
      return;
    }
    if (settings?.note_required && !note.trim()) {
      Alert.alert('Eksik', 'Not zorunludur.');
      return;
    }

    setSaving(true);
    try {
      const subfolder = `org/${staff.organization_id}/breakfast/${staff.id}`;
      for (const uri of photoUris) {
        const { publicUrl } = await promiseWithTimeout(
          uploadUriToPublicBucket({ bucketId: BUCKET, uri, kind: 'image', subfolder }),
          FEED_MEDIA_UPLOAD_TIMEOUT_MS,
          'Yükleme zaman aşımı. Wi‑Fi deneyin veya daha küçük fotoğraf seçin.'
        );
        urls.push(publicUrl);
      }

      const today = todayIstanbulDateString();
      const payload = {
        organization_id: staff.organization_id,
        staff_id: staff.id,
        record_date: today,
        // Personel ekranı sade: kişi sayısı alanı gizli, sabit 1 gönderilir.
        guest_count: 1,
        note: note.trim() ? note.trim() : null,
        photo_urls: urls,
        submitted_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error } = await supabase.from('breakfast_confirmations').update(payload).eq('id', existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('breakfast_confirmations').insert(payload);
        if (error) {
          if (error.code === '23505') {
            throw new Error('Bugün için zaten bir kayıt var. Listeyi yenileyin.');
          }
          throw new Error(error.message);
        }
      }
      Alert.alert('Kaydedildi', 'Kahvaltı teyidi kaydedildi.', [{ text: 'Tamam', onPress: () => load() }]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!settings?.feature_enabled) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cafe-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.blockTitle}>Kahvaltı teyidi kapalı</Text>
        <Text style={styles.blockSub}>Bu özellik işletmeniz için devre dışı bırakılmış.</Text>
      </View>
    );
  }

  const perms = staff?.app_permissions as Record<string, unknown> | undefined;
  const canListOnly =
    !!staff &&
    !canSubmit &&
    (appPermissionTruthy(perms, 'kahvalti_teyit_departman') ||
      appPermissionTruthy(perms, 'kahvalti_teyit_onayla') ||
      appPermissionTruthy(perms, 'kahvalti_rapor'));

  if (!canSubmit && canListOnly) {
    return (
      <View style={styles.centered}>
        <Ionicons name="list-outline" size={48} color={theme.colors.primary} />
        <Text style={styles.blockTitle}>Kayıt oluşturma yetkisi yok</Text>
        <Text style={styles.blockSub}>Bu hesap için sadece görüntüleme / onay yetkileri tanımlı. Kayıt listesine gidebilirsiniz.</Text>
        <TouchableOpacity style={styles.primaryBtnWide} onPress={() => router.push('/staff/breakfast-confirm/list')} activeOpacity={0.85}>
          <Text style={styles.primaryBtnTextLight}>Kayıt listesi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!canSubmit) {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockTitle}>Erişim yok</Text>
        <Text style={styles.blockSub}>
          Bu ekran yalnızca mutfak / restoran departmanı ve yöneticinizin atadığı kahvaltı teyidi yetkisi olan personel içindir.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Bugünkü Kahvaltı Fotoğraf Teyidi</Text>
      <Text style={styles.meta}>
        {staff?.full_name ?? 'Personel'} · {staff?.department === 'kitchen' ? 'Mutfak' : staff?.department === 'restaurant' ? 'Restoran' : staff?.department ?? '—'}
      </Text>
      <Text style={styles.meta}>Tarih (İstanbul): {todayIstanbulDateString()}</Text>
      <Text style={styles.meta}>Yükleme saati: {nowIstanbulClock()}</Text>
      <Text style={styles.meta}>İşletme: {staff?.organization?.name ?? '—'}</Text>

      <Text style={styles.label}>Fotoğraflar ({totalPhotoCount} / {maxPhotos}, en az {minPhotos})</Text>
      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={takePhoto} disabled={saving}>
          <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.secondaryBtnText}>Çek</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={pickFromLibrary} disabled={saving}>
          <Ionicons name="images-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.secondaryBtnText}>Galeri</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.thumbRow}>
        {existingUrls.map((u, i) => (
          <View key={`e-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: u }} style={styles.thumb} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removeExistingAt(i)}>
              <Ionicons name="close-circle" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        {photoUris.map((u, i) => (
          <View key={`n-${i}`} style={styles.thumbWrap}>
            <Image source={{ uri: u }} style={styles.thumb} />
            <TouchableOpacity style={styles.thumbRemove} onPress={() => removeNewAt(i)}>
              <Ionicons name="close-circle" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <Text style={styles.label}>Not {settings.note_required ? '(zorunlu)' : '(isteğe bağlı)'}</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={note}
        onChangeText={setNote}
        placeholder="Kısa not..."
        placeholderTextColor={theme.colors.textMuted}
        multiline
      />

      <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 20, paddingBottom: 48, backgroundColor: theme.colors.backgroundSecondary },
  title: { fontSize: 22, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  meta: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 4 },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  photoActions: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 140, height: 140, borderRadius: 14, backgroundColor: theme.colors.borderLight },
  thumbRemove: { position: 'absolute', top: 4, right: 4 },
  primaryBtn: {
    marginTop: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  primaryBtnWide: {
    marginTop: 20,
    alignSelf: 'stretch',
    marginHorizontal: 24,
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryBtnTextLight: { color: '#fff', fontSize: 17, fontWeight: '700' },
  blockTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginTop: 12, textAlign: 'center' },
  blockSub: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 22 },
});
