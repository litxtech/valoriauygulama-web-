import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { buildEarlyVideoPreview } from '@/lib/chatVideoThumbnail';
import {
  MAX_SECURITY_CAMERA_RECORDING_MEDIA,
  securityCameraRecordingCameraOptions,
  securityCameraRecordingGalleryOptions,
  uploadSecurityCameraRecordingMedia,
} from '@/lib/securityCameraRecordingsMedia';
import {
  createSecurityCameraRecording,
  notifySecurityCameraRecordingCreated,
} from '@/lib/securityCameraRecordings';

type PendingMedia = { uri: string; type: 'image' | 'video'; posterUri?: string | null };

export default function SecurityRecordingNew() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id;
  const staffId = staff?.id;

  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [cameraLabel, setCameraLabel] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [pickingMedia, setPickingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadStep, setUploadStep] = useState<string | null>(null);

  const pickMedia = useCallback(
    async (fromCamera: boolean) => {
      if (pickingMedia) return;
      if (media.length >= MAX_SECURITY_CAMERA_RECORDING_MEDIA) {
        Alert.alert('Limit', `En fazla ${MAX_SECURITY_CAMERA_RECORDING_MEDIA} medya ekleyebilirsiniz.`);
        return;
      }
      setPickingMedia(true);
      try {
        const granted = fromCamera
          ? await ensureCameraPermission({
              title: 'Kamera izni',
              message: 'Kayıt çekmek için kamera izni gerekli.',
              settingsMessage: 'Kamera iznini ayarlardan açın.',
            })
          : await ensureMediaLibraryPermission({
              title: 'Galeri izni',
              message: 'Kamera kaydı seçmek için galeri izni gerekli.',
              settingsMessage: 'Galeri iznini ayarlardan açın.',
            });
        if (!granted) return;

        const result = fromCamera
          ? await ImagePicker.launchCameraAsync(securityCameraRecordingCameraOptions as never)
          : await ImagePicker.launchImageLibraryAsync({
              ...(securityCameraRecordingGalleryOptions as object),
              selectionLimit: MAX_SECURITY_CAMERA_RECORDING_MEDIA - media.length,
            } as never);
        if (result.canceled || !result.assets?.length) return;

        const added: PendingMedia[] = [];
        for (const asset of result.assets) {
          if (media.length + added.length >= MAX_SECURITY_CAMERA_RECORDING_MEDIA) break;
          const resolved = await resolveFeedPickedMediaUri(asset);
          if (!resolved.uri) continue;
          // Önizlemeyi sonra üret — seçimi hemen ekle (yavaş hissetmeyi keser).
          added.push({ uri: resolved.uri, type: resolved.type, posterUri: null });
        }
        if (added.length) {
          setMedia((prev) => [...prev, ...added]);
          // Poster'ları arka planda doldur
          for (const item of added) {
            if (item.type !== 'video') continue;
            void buildEarlyVideoPreview(item.uri).then((preview) => {
              if (!preview.posterUri) return;
              setMedia((prev) =>
                prev.map((m) =>
                  m.uri === item.uri && !m.posterUri ? { ...m, posterUri: preview.posterUri } : m
                )
              );
            });
          }
        }
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Medya seçilemedi');
      } finally {
        setPickingMedia(false);
      }
    },
    [media.length, pickingMedia]
  );

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!orgId || !staffId) return;
    if (!title.trim()) {
      Alert.alert('Hata', 'Lütfen kısa bir başlık yazın (ör. “Lobı kavga 14:30”).');
      return;
    }
    if (media.length === 0) {
      Alert.alert('Hata', 'En az bir video veya fotoğraf ekleyin.');
      return;
    }

    setSaving(true);
    try {
      const uploaded: Array<{
        publicUrl: string;
        storagePath: string;
        mediaType: 'image' | 'video';
        thumbnailUrl: string | null;
        sortOrder: number;
      }> = [];

      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        setUploadStep(`Medya yükleniyor ${i + 1}/${media.length}…`);
        const res = await uploadSecurityCameraRecordingMedia({
          uri: m.uri,
          kind: m.type,
          organizationId: orgId,
          posterUri: m.posterUri,
          onProgress: (step) => setUploadStep(`${i + 1}/${media.length}: ${step}`),
        });
        uploaded.push({
          publicUrl: res.publicUrl,
          storagePath: res.path,
          mediaType: res.mediaType,
          thumbnailUrl: res.thumbnailUrl,
          sortOrder: i,
        });
      }

      setUploadStep('Kayıt oluşturuluyor…');
      const { data, error } = await createSecurityCameraRecording(orgId, staffId, {
        title,
        note,
        cameraLabel,
        locationLabel,
        recordedAt: new Date().toISOString(),
        media: uploaded,
      });
      if (error || !data) throw new Error(error?.message ?? 'Kayıt oluşturulamadı');

      void notifySecurityCameraRecordingCreated({
        organizationId: orgId,
        createdByStaffId: staffId,
        recording: {
          id: data.id,
          record_no: data.record_no,
          title,
          camera_label: cameraLabel,
        },
      }).catch(() => {});

      Alert.alert('Kaydedildi', `Kamera kaydı yüklendi${data.record_no ? ` (${data.record_no})` : ''}.`, [
        {
          text: 'Tamam',
          onPress: () => router.replace(`/staff/security-recordings/${data.id}` as never),
        },
      ]);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message ?? 'Kayıt oluşturulamadı');
    } finally {
      setSaving(false);
      setUploadStep(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Telefondan video çekin veya galeriden (Tapo/kamera kaydı) seçip yükleyin. Güvenlik ekibine bildirim gider.
        </Text>

        <Text style={styles.label}>Başlık *</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Örn. Lobi olay 12 Mart"
          placeholderTextColor="#94a3b8"
          maxLength={120}
        />

        <Text style={styles.label}>Kamera adı</Text>
        <TextInput
          style={styles.input}
          value={cameraLabel}
          onChangeText={setCameraLabel}
          placeholder="Örn. Giriş kapısı kamerası"
          placeholderTextColor="#94a3b8"
          maxLength={80}
        />

        <Text style={styles.label}>Konum</Text>
        <TextInput
          style={styles.input}
          value={locationLabel}
          onChangeText={setLocationLabel}
          placeholder="Örn. Resepsiyon / Oda 204 koridor"
          placeholderTextColor="#94a3b8"
          maxLength={80}
        />

        <Text style={styles.label}>Not</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          placeholder="Ne oldu, neden önemli…"
          placeholderTextColor="#94a3b8"
          multiline
        />

        <Text style={styles.label}>Video / fotoğraf *</Text>
        <View style={styles.mediaActions}>
          <TouchableOpacity
            style={[styles.mediaBtn, styles.mediaBtnPrimary]}
            onPress={() => void pickMedia(true)}
            disabled={pickingMedia || saving}
          >
            <Ionicons name="videocam-outline" size={18} color="#fff" />
            <Text style={styles.mediaBtnPrimaryText}>Kameradan çek</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mediaBtn}
            onPress={() => void pickMedia(false)}
            disabled={pickingMedia || saving}
          >
            <Ionicons name="images-outline" size={18} color="#0f766e" />
            <Text style={styles.mediaBtnText}>Galeriden seç</Text>
          </TouchableOpacity>
        </View>

        {media.length > 0 ? (
          <View style={styles.mediaGrid}>
            {media.map((m, index) => (
              <View key={`${m.uri}-${index}`} style={styles.mediaItem}>
                <Image source={{ uri: m.posterUri || m.uri }} style={styles.mediaThumb} />
                {m.type === 'video' ? (
                  <View style={styles.playOverlay}>
                    <Ionicons name="play" size={16} color="#fff" />
                  </View>
                ) : null}
                <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(index)}>
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitDisabled]}
          onPress={() => void submit()}
          disabled={saving}
        >
          {saving ? (
            <View style={styles.savingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.submitText}>{uploadStep ?? 'Yükleniyor…'}</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>Yükle ve kaydet</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 16 },
  label: { fontWeight: '700', color: '#334155', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  noteInput: { minHeight: 90, textAlignVertical: 'top' },
  mediaActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  mediaBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  mediaBtnPrimary: { backgroundColor: '#0f766e', borderColor: '#0f766e' },
  mediaBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  mediaBtnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  mediaItem: { width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  mediaThumb: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  removeBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    marginTop: 28,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  savingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
