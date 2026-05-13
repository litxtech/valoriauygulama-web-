import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  uploadUriToPublicBucket,
  promiseWithTimeout,
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
} from '@/lib/storagePublicUpload';
import { FeedNewPostMediaSection } from '@/components/FeedNewPostMediaSection';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  feedPostMediaPickerCameraOptions,
  feedPostMediaPickerGalleryOptions,
  resolveFeedPickedMediaUri,
  applyFeedGallerySelection,
  ensureLocalFeedUploadUri,
} from '@/lib/feedPostMediaPicker';
import { notifyGuestsOfNewStory, notifyStaffOfNewStory } from '@/lib/notifyNewFeedPost';

const BUCKET = 'feed-media';

export default function NewStoryScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);

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
    try {
      const readyUri = await ensureLocalFeedUploadUri(imageUri, mediaType);
      const uploadTimeoutMs =
        mediaType === 'video' ? FEED_MEDIA_UPLOAD_TIMEOUT_MS + 18 * 60 * 1000 : FEED_MEDIA_UPLOAD_TIMEOUT_MS;
      const { publicUrl } = await promiseWithTimeout(
        uploadUriToPublicBucket({
          bucketId: BUCKET,
          uri: readyUri,
          kind: mediaType,
          subfolder: 'stories',
        }),
        uploadTimeoutMs,
        'Yukleme cok uzun surdu. Tekrar deneyin.'
      );

      const { data: inserted, error } = await supabase.from('feed_stories').insert({
        staff_id: staff.id,
        media_type: mediaType,
        media_url: publicUrl,
        thumbnail_url: mediaType === 'image' ? publicUrl : null,
        caption: caption.trim() || null,
        duration_seconds: mediaType === 'video' ? 28 : 9,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }).select('id').single();

      if (error) {
        Alert.alert('Hata', error.message || 'Story kaydedilemedi.');
        setUploading(false);
        return;
      }
      setUploading(false);
      router.back();
      const storyId = inserted?.id as string | undefined;
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
      setUploading(false);
      Alert.alert('Hata', (e as Error).message || 'Story paylasilamadi.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 16}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={styles.headerCard}>
        <Text style={styles.title}>Yeni Story</Text>
        <Text style={styles.subtitle}>Dikey, hızlı ve dikkat çekici paylaş.</Text>
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

      <Text style={styles.label}>Kısa not (isteğe bağlı)</Text>
      <TextInput
        style={styles.input}
        value={caption}
        onChangeText={setCaption}
        placeholder="Story notu..."
        placeholderTextColor="#9ca3af"
        maxLength={120}
        editable={!uploading}
      />

      <TouchableOpacity
        style={[styles.submitBtn, (uploading || !imageUri) && styles.submitBtnDisabled]}
        onPress={publishStory}
        disabled={uploading || !imageUri}
        activeOpacity={0.85}
      >
        {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Story Paylas</Text>}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 120 },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 14,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#111827' },
  subtitle: { marginTop: 4, fontSize: 13, color: '#6b7280' },
  label: { marginTop: 12, marginBottom: 8, fontSize: 14, fontWeight: '600', color: '#111827' },
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
  submitBtn: {
    marginTop: 22,
    backgroundColor: '#b8860b',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
