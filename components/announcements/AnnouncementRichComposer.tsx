import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { STAFF_NOTIFICATION_DESTINATIONS } from '@/lib/staffNotificationActions';
import {
  MAX_ANNOUNCEMENT_IMAGES,
  pickAndUploadAnnouncementImages,
  pickAndUploadAnnouncementVideo,
  isValidWebsiteUrl,
  type AnnouncementMediaDraft,
} from '@/lib/announcementMedia';
import { isStaffIntroUploadedVideo } from '@/lib/staffIntroNotificationVideo';
import { isDirectVideoUrl } from '@/lib/staffNotificationActions';

type Props = {
  draft: AnnouncementMediaDraft;
  onChange: (patch: Partial<AnnouncementMediaDraft>) => void;
  organizationId: string | null;
  disabled?: boolean;
  sections?: Array<'images' | 'video' | 'website' | 'module'>;
};

const ALL_SECTIONS = ['images', 'video', 'website', 'module'] as const;

export function AnnouncementRichComposer({
  draft,
  onChange,
  organizationId,
  disabled,
  sections = [...ALL_SECTIONS],
}: Props) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageStep, setImageStep] = useState('');
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoStep, setVideoStep] = useState('');

  const handlePickImages = async () => {
    if (!organizationId) {
      Alert.alert('Otel seçin', 'Görsel yüklemek için üstten tek bir işletme seçin.');
      return;
    }
    setImageUploading(true);
    const result = await pickAndUploadAnnouncementImages({
      organizationId,
      currentCount: draft.imageUrls.length,
      onProgress: setImageStep,
    });
    setImageUploading(false);
    setImageStep('');
    if (result.cancelled) return;
    if (result.error) {
      Alert.alert('Yüklenemedi', result.error);
      return;
    }
    if (result.urls.length) {
      onChange({ imageUrls: [...draft.imageUrls, ...result.urls].slice(0, MAX_ANNOUNCEMENT_IMAGES) });
    }
  };

  const handlePickVideo = async () => {
    if (!organizationId) {
      Alert.alert('Otel seçin', 'Video yüklemek için üstten tek bir işletme seçin.');
      return;
    }
    setVideoUploading(true);
    const result = await pickAndUploadAnnouncementVideo({
      organizationId,
      onProgress: setVideoStep,
    });
    setVideoUploading(false);
    setVideoStep('');
    if (result.cancelled) return;
    if (result.error) {
      Alert.alert('Yüklenemedi', result.error);
      return;
    }
    if (result.publicUrl) {
      onChange({
        videoUrl: result.publicUrl,
        videoTitle: draft.videoTitle.trim() || 'Tanıtım videosu',
      });
    }
  };

  const removeImage = (url: string) => {
    onChange({ imageUrls: draft.imageUrls.filter((u) => u !== url) });
  };

  const videoStatus = draft.videoUrl.trim()
    ? isStaffIntroUploadedVideo(draft.videoUrl)
      ? 'Video yüklendi'
      : isDirectVideoUrl(draft.videoUrl)
        ? 'Video bağlantısı'
        : 'Harici video bağlantısı'
    : '';

  const show = (key: (typeof ALL_SECTIONS)[number]) => sections.includes(key);

  return (
    <View style={styles.wrap}>
      {show('images') ? (
        <>
      <Text style={styles.sectionTitle}>Görseller (opsiyonel)</Text>
      <Text style={styles.hint}>Galeriden en fazla {MAX_ANNOUNCEMENT_IMAGES} görsel ekleyebilirsiniz.</Text>

      {draft.imageUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
          {draft.imageUrls.map((url) => (
            <View key={url} style={styles.imageTile}>
              <CachedImage uri={url} style={styles.imagePreview} contentFit="cover" />
              <TouchableOpacity
                style={styles.imageRemove}
                onPress={() => removeImage(url)}
                disabled={disabled || imageUploading}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <TouchableOpacity
        style={[styles.uploadBtn, (disabled || imageUploading) && styles.uploadBtnDisabled]}
        onPress={() => void handlePickImages()}
        disabled={disabled || imageUploading || draft.imageUrls.length >= MAX_ANNOUNCEMENT_IMAGES}
        activeOpacity={0.88}
      >
        {imageUploading ? (
          <>
            <ActivityIndicator color="#1d4ed8" />
            <Text style={styles.uploadBtnText}>{imageStep || 'Yükleniyor…'}</Text>
          </>
        ) : (
          <>
            <Ionicons name="images-outline" size={20} color="#1d4ed8" />
            <Text style={styles.uploadBtnText}>Galeriden görsel ekle</Text>
          </>
        )}
      </TouchableOpacity>
        </>
      ) : null}

      {show('video') ? (
        <>
      <Text style={styles.sectionTitle}>Video (opsiyonel)</Text>
      <TouchableOpacity
        style={[styles.uploadBtn, styles.uploadBtnWarm, (disabled || videoUploading) && styles.uploadBtnDisabled]}
        onPress={() => void handlePickVideo()}
        disabled={disabled || videoUploading}
        activeOpacity={0.88}
      >
        {videoUploading ? (
          <>
            <ActivityIndicator color="#92400e" />
            <Text style={[styles.uploadBtnText, styles.uploadBtnTextWarm]}>{videoStep || 'Yükleniyor…'}</Text>
          </>
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={20} color="#92400e" />
            <Text style={[styles.uploadBtnText, styles.uploadBtnTextWarm]}>Galeriden video yükle</Text>
          </>
        )}
      </TouchableOpacity>

      {videoStatus ? (
        <View style={styles.statusRow}>
          <View style={styles.statusChip}>
            <Ionicons name="videocam-outline" size={16} color="#15803d" />
            <Text style={styles.statusText}>{videoStatus}</Text>
          </View>
          <TouchableOpacity onPress={() => onChange({ videoUrl: '', videoTitle: '' })} disabled={disabled}>
            <Text style={styles.clearText}>Kaldır</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.subLabel}>veya video bağlantısı (YouTube, Vimeo, .mp4)</Text>
      <TextInput
        style={styles.input}
        placeholder="https://..."
        value={draft.videoUrl}
        onChangeText={(videoUrl) => onChange({ videoUrl })}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled && !videoUploading}
      />
      <TextInput
        style={styles.input}
        placeholder="Video başlığı (opsiyonel)"
        value={draft.videoTitle}
        onChangeText={(videoTitle) => onChange({ videoTitle })}
        editable={!disabled}
      />
        </>
      ) : null}

      {show('website') ? (
        <>
      <Text style={styles.sectionTitle}>Web sitesi (opsiyonel)</Text>
      <TextInput
        style={styles.input}
        placeholder="https://oteliniz.com/duyuru"
        value={draft.websiteUrl}
        onChangeText={(websiteUrl) => onChange({ websiteUrl })}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
      />
      <TextInput
        style={styles.input}
        placeholder="Buton metni (örn: Web sitesini aç)"
        value={draft.websiteLabel}
        onChangeText={(websiteLabel) => onChange({ websiteLabel })}
        editable={!disabled}
      />
      {draft.websiteUrl.trim() && !isValidWebsiteUrl(draft.websiteUrl) ? (
        <Text style={styles.errorText}>Geçerli bir web adresi girin.</Text>
      ) : null}
        </>
      ) : null}

      {show('module') ? (
        <>
      <Text style={styles.sectionTitle}>Uygulama modülü (opsiyonel)</Text>
      <Text style={styles.hint}>Personel duyurudan doğrudan bir ekrana gidebilir.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.destRow}>
        <TouchableOpacity
          style={[styles.destChip, !draft.destinationId && styles.destChipActive]}
          onPress={() => onChange({ destinationId: null })}
        >
          <Text style={[styles.destChipText, !draft.destinationId && styles.destChipTextActive]}>Yok</Text>
        </TouchableOpacity>
        {STAFF_NOTIFICATION_DESTINATIONS.map((dest) => (
          <TouchableOpacity
            key={dest.id}
            style={[styles.destChip, draft.destinationId === dest.id && styles.destChipActive]}
            onPress={() => onChange({ destinationId: dest.id })}
          >
            <Text
              style={[styles.destChipText, draft.destinationId === dest.id && styles.destChipTextActive]}
              numberOfLines={1}
            >
              {dest.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {draft.destinationId ? (
        <TextInput
          style={styles.input}
          placeholder="Modül buton metni (opsiyonel)"
          value={draft.actionLabel}
          onChangeText={(actionLabel) => onChange({ actionLabel })}
          editable={!disabled}
        />
      ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#334155', marginTop: 8 },
  hint: { fontSize: 12, color: '#64748b', lineHeight: 17 },
  subLabel: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  imageRow: { gap: 10, paddingVertical: 4 },
  imageTile: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  imagePreview: { width: '100%', height: '100%' },
  imageRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  uploadBtnWarm: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  uploadBtnDisabled: { opacity: 0.65 },
  uploadBtnText: { fontSize: 14, fontWeight: '700', color: '#1d4ed8' },
  uploadBtnTextWarm: { color: '#92400e' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0fdf4',
  },
  statusText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  clearText: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  destRow: { gap: 8, paddingVertical: 4 },
  destChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    maxWidth: 200,
  },
  destChipActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  destChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  destChipTextActive: { color: '#1d4ed8' },
  errorText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});
