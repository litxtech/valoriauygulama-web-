import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  uploadUriToPublicBucket,
  promiseWithTimeout,
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
} from '@/lib/storagePublicUpload';
import { FeedNewPostMediaSection } from '@/components/FeedNewPostMediaSection';
import { FeedComposeLayout } from '@/components/feed/FeedComposeLayout';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  feedPostMediaPickerCameraOptions,
  feedPostMediaPickerGalleryOptions,
  resolveFeedPickedMediaUri,
  applyFeedGallerySelection,
  ensureLocalFeedUploadUri,
} from '@/lib/feedPostMediaPicker';
import { ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';
import { notifyGuestsOfNewStory, notifyStaffOfNewStory } from '@/lib/notifyNewFeedPost';
import {
  buildStoryVideoThumbnail,
  STORY_MUX_PENDING_PLACEHOLDER,
  uploadStoryVideoForStaff,
} from '@/lib/muxStoryUpload';
import { storyUploadLabelKeys, uploadPercentLabel } from '@/lib/mediaUploadLabels';
import { storyVideoShareErrorMessage } from '@/lib/storyUploadErrors';

const BUCKET = 'feed-media';

export default function NewStoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { staff } = useAuthStore();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);

  const pickMedia = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Story eklemek icin galeriden foto/video secmek amaciyla izin istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Story eklemek icin ayarlardan galeri iznini acin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync(feedPostMediaPickerGalleryOptions);
    if (result.canceled || !result.assets[0]) return;
    applyFeedGallerySelection(result.assets[0], setImageUri, setMediaType);
  };

  const takeMedia = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Story icin foto/video cekmek amaciyla kamera erisimi istiyoruz.',
      settingsMessage: 'Kamera izni kapali. Story icin ayarlardan kamera iznini acin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync(feedPostMediaPickerCameraOptions);
    if (result.canceled || !result.assets[0]) return;
    const resolved = await resolveFeedPickedMediaUri(result.assets[0]);
    if (!resolved.uri) {
      Alert.alert('Hata', 'Medya alinamadi. Tekrar deneyin.');
      return;
    }
    setImageUri(resolved.uri);
    setMediaType(resolved.type);
  };

  const publishStory = async () => {
    if (!staff?.id) return;
    if (!imageUri) {
      Alert.alert('Eksik', 'Story icin foto veya video secin.');
      return;
    }
    setUploading(true);
    setUploadLabel(null);
    let storyId: string | undefined;
    try {
      if (mediaType === 'image') {
        setUploadLabel('Fotoğraf yükleniyor…');
        const readyUri = await ensureLocalFeedUploadUri(imageUri, 'image');
        const { publicUrl } = await promiseWithTimeout(
          uploadUriToPublicBucket({
            bucketId: BUCKET,
            uri: readyUri,
            kind: 'image',
            subfolder: 'stories',
          }),
          FEED_MEDIA_UPLOAD_TIMEOUT_MS,
          'Yukleme cok uzun surdu. Tekrar deneyin.'
        );

        const { data: inserted, error } = await supabase
          .from('feed_stories')
          .insert({
            staff_id: staff.id,
            media_type: 'image',
            media_url: publicUrl,
            thumbnail_url: publicUrl,
            caption: caption.trim() || null,
            duration_seconds: 9,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('id')
          .single();

        if (error) {
          Alert.alert('Hata', error.message || 'Story kaydedilemedi.');
          return;
        }
        storyId = inserted?.id as string | undefined;
      } else {
        setUploadLabel(t(storyUploadLabelKeys.videoPreparing));
        const readyUri = await ensureChatVideoLocalUri(imageUri);

        const { data: inserted, error } = await supabase
          .from('feed_stories')
          .insert({
            staff_id: staff.id,
            media_type: 'video',
            media_url: STORY_MUX_PENDING_PLACEHOLDER,
            thumbnail_url: null,
            caption: caption.trim() || null,
            duration_seconds: 28,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          })
          .select('id')
          .single();

        if (error || !inserted?.id) {
          Alert.alert('Hata', error?.message || 'Story kaydedilemedi.');
          return;
        }
        storyId = inserted.id as string;

        void (async () => {
          const thumbLocal = await buildStoryVideoThumbnail(readyUri);
          if (!thumbLocal || !storyId) return;
          try {
            const { publicUrl } = await promiseWithTimeout(
              uploadUriToPublicBucket({
                bucketId: BUCKET,
                uri: thumbLocal,
                kind: 'image',
                subfolder: 'stories/thumbs',
              }),
              FEED_MEDIA_UPLOAD_TIMEOUT_MS,
              'Önizleme yüklenemedi'
            );
            await supabase.from('feed_stories').update({ thumbnail_url: publicUrl }).eq('id', storyId);
          } catch {
            /* poster opsiyonel */
          }
        })();

        await uploadStoryVideoForStaff({
          storyId,
          videoUri: readyUri,
          preparedLocalUri: readyUri,
          onCompressing: () => setUploadLabel(t(storyUploadLabelKeys.compressing)),
          onCompressProgress: (r) => {
            setUploadLabel(uploadPercentLabel(t, storyUploadLabelKeys.compressing, r * 0.42));
          },
          onUploadProgress: (r) => {
            const overall = 0.42 + r * 0.58;
            setUploadLabel(
              overall >= 1
                ? t('storyUploadFinishing')
                : uploadPercentLabel(t, storyUploadLabelKeys.uploading, overall)
            );
          },
        });
      }

      router.back();
      if (storyId) {
        void notifyStaffOfNewStory({
          storyId,
          authorDisplayName: staff.full_name ?? 'Bir personel',
          excludeStaffId: staff.id,
          createdByStaffId: staff.id,
        });
        void notifyGuestsOfNewStory(storyId, staff.full_name ?? 'Bir personel');
      }
    } catch (e) {
      if (storyId) {
        await supabase.from('feed_stories').delete().eq('id', storyId);
      }
      Alert.alert(t('error'), storyVideoShareErrorMessage(t, e));
    } finally {
      setUploading(false);
      setUploadLabel(null);
    }
  };

  return (
    <FeedComposeLayout
      hasMedia={!!imageUri}
      mediaSlot={
        <>
          <View style={styles.headerCard}>
            <Text style={styles.title}>Yeni Story</Text>
            <Text style={styles.subtitle}>{t('storyNewSubtitle')}</Text>
          </View>
          <FeedNewPostMediaSection
            imageUri={imageUri}
            mediaType={mediaType}
            uploading={uploading}
            onCamera={takeMedia}
            onGallery={pickMedia}
            onRemoveMedia={() => {
              setImageUri(null);
              setMediaType('image');
            }}
          />
        </>
      }
      footer={
        <TouchableOpacity
          style={[styles.submitBtn, (uploading || !imageUri) && styles.submitBtnDisabled]}
          onPress={publishStory}
          disabled={uploading || !imageUri}
          activeOpacity={0.85}
        >
          {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Story Paylas</Text>}
        </TouchableOpacity>
      }
    >
      <Text style={styles.label}>Kısa not (isteğe bağlı)</Text>
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        placeholder="Story notu..."
        placeholderTextColor="#9ca3af"
        maxLength={120}
        editable={!uploading}
        returnKeyType="done"
        blurOnSubmit
      />

      {uploadLabel ? <Text style={styles.uploadLabel}>{uploadLabel}</Text> : null}
    </FeedComposeLayout>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  label: { marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#111827' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  uploadLabel: {
    marginTop: 12,
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  submitBtn: {
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 24 : 16,
    backgroundColor: '#b8860b',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
