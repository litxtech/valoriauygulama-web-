import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import {
  uploadUriToPublicBucket,
  promiseWithTimeout,
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
} from '@/lib/storagePublicUpload';
import { extractAndUploadFeedVideoThumbnail } from '@/lib/feedVideoThumbnail';
import { FeedNewPostMediaSection } from '@/components/FeedNewPostMediaSection';
import { FeedComposeLayout } from '@/components/feed/FeedComposeLayout';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import {
  feedPostMediaPickerCameraOptions,
  feedPostMediaPickerGalleryOptions,
  resolveFeedPickedMediaUri,
  ensureLocalFeedUploadUri,
} from '@/lib/feedPostMediaPicker';
import { useTranslation } from 'react-i18next';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { FeedVisibilityPicker } from '@/components/FeedVisibilityPicker';
import type { FeedPostVisibility } from '@/lib/feedVisibility';
import { shouldNotifyGuestsForStaffPost } from '@/lib/feedVisibility';

const BUCKET = 'feed-media';

export default function NewFeedPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string }>();
  const { staff } = useAuthStore();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaItems, setMediaItems] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState<FeedPostVisibility>('all_staff');
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadCompleted, setUploadCompleted] = useState(0);
  const [uploadStepLabel, setUploadStepLabel] = useState('');
  const autoIntentHandledRef = useRef(false);

  const resolveUploadTimeoutMs = (type: 'image' | 'video', total: number) => {
    const base = FEED_MEDIA_UPLOAD_TIMEOUT_MS;
    const multiExtra = Math.max(0, total - 1) * 2 * 60 * 1000;
    const videoExtra = type === 'video' ? 18 * 60 * 1000 : 0;
    return base + multiExtra + videoExtra;
  };

  const pickImage = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: t('feedGalleryPermTitle'),
      message: t('feedGalleryPermMessage'),
      settingsMessage: t('feedGalleryPermSettings'),
    });
    if (!granted) {
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ ...feedPostMediaPickerGalleryOptions, allowsMultipleSelection: true, selectionLimit: 10 });
    if (result.canceled || !result.assets?.length) return;
    const assets = result.assets.filter((a) => !!a.uri?.trim());
    if (!assets.length) {
      Alert.alert(t('error'), t('feedImagePickFailed'));
      return;
    }
    const next = assets.map((a) => ({ uri: a.uri!.trim(), type: a.type === 'video' ? 'video' as const : 'image' as const }));
    setMediaItems(next);
    setImageUri(next[0]?.uri ?? null);
    setMediaType(next[0]?.type ?? 'image');
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: t('feedCameraPermTitle'),
      message: t('feedCameraPermMessage'),
      settingsMessage: t('feedCameraPermSettings'),
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync(feedPostMediaPickerCameraOptions);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const resolved = await resolveFeedPickedMediaUri(asset);
    if (!resolved.uri) {
      Alert.alert(t('error'), t('feedPhotoPickFailed'));
      return;
    }
    setImageUri(resolved.uri);
    setMediaType(resolved.type);
    setMediaItems([{ uri: resolved.uri, type: resolved.type }]);
  };

  const clearMedia = () => {
    setImageUri(null);
    setMediaType('image');
    setMediaItems([]);
  };

  useEffect(() => {
    if (autoIntentHandledRef.current) return;
    const intent = String(params.intent ?? '').toLowerCase();
    if (intent === 'camera') {
      autoIntentHandledRef.current = true;
      void takePhoto();
      return;
    }
    if (intent === 'gallery') {
      autoIntentHandledRef.current = true;
      void pickImage();
    }
  }, [params.intent]);

  const uploadAndPublish = async () => {
    if (!staff) return;
    const hasText = (title ?? '').trim().length > 0;
    if (!hasText && mediaItems.length === 0 && !imageUri) {
      Alert.alert(t('feedMissingContentTitle'), t('feedMissingContentMessage'));
      return;
    }
    setUploading(true);
    setUploadCompleted(0);
    setUploadTotal(0);
    setUploadStepLabel(t('feedUploadPreparing'));
    try {
      let finalMediaType: 'image' | 'video' | 'text' = 'text';
      let mediaUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      const itemsForUpload = mediaItems.length > 0 ? mediaItems : (imageUri ? [{ uri: imageUri, type: mediaType }] : []);
      let uploadedItems: { media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }[] = [];
      if (itemsForUpload.length > 0) {
        finalMediaType = itemsForUpload[0].type;
        setUploadTotal(itemsForUpload.length);
        setUploadStepLabel(t('feedUploadMediaProgress', { current: 0, total: itemsForUpload.length }));
        try {
          uploadedItems = await Promise.all(
            itemsForUpload.map(async (item, i) => {
              if (item.type === 'video') setUploadStepLabel(t('feedVideoCompressing'));
              const uriReady = await ensureLocalFeedUploadUri(item.uri, item.type);
              const uploadVideo = promiseWithTimeout(
                uploadUriToPublicBucket({
                  bucketId: BUCKET,
                  uri: uriReady,
                  kind: item.type === 'video' ? 'video' : 'image',
                  subfolder: 'posts',
                }),
                resolveUploadTimeoutMs(item.type, itemsForUpload.length),
                t('feedUploadTimeout')
              );
              const thumbPromise =
                item.type === 'video' ? extractAndUploadFeedVideoThumbnail(uriReady) : Promise.resolve(null);
              const [{ publicUrl }, thumbnail_url] = await Promise.all([uploadVideo, thumbPromise]);
              setUploadCompleted((prev) => {
                const next = prev + 1;
                setUploadStepLabel(t('feedUploadMediaProgress', { current: next, total: itemsForUpload.length }));
                return next;
              });
              return {
                media_type: item.type,
                media_url: publicUrl,
                thumbnail_url: item.type === 'image' ? publicUrl : thumbnail_url,
                sort_order: i,
              };
            })
          );
          mediaUrl = uploadedItems[0]?.media_url ?? null;
          thumbnailUrl = uploadedItems[0]?.thumbnail_url ?? null;
        } catch (e) {
          const msg = (e as Error)?.message ?? '';
          const l = msg.toLowerCase();
          setUploading(false);
          Alert.alert(
            t('feedMediaUploadFailed'),
            l.includes('base64') || l.includes('okunamadı') || l.includes('could not') || l.includes('read')
              ? t('feedMediaProcessFailed')
              : msg
          );
          return;
        }
      }

      setUploadStepLabel(t('feedSavingPost'));
      const { data: insertedPost, error: insertErr } = await supabase
        .from('feed_posts')
        .insert({
          staff_id: staff.id,
          media_type: finalMediaType,
          media_url: mediaUrl,
          thumbnail_url: thumbnailUrl,
          title: (title ?? '').trim() || null,
          visibility,
        })
        .select('id')
        .single();
      if (insertErr || !insertedPost?.id) {
        setUploading(false);
        Alert.alert(t('error'), insertErr?.message ?? t('feedPostSaveFailed'));
        return;
      }
      const newPostId = insertedPost.id;
      if (uploadedItems.length > 1) {
        setUploadStepLabel(t('feedSavingGalleryMeta'));
        const rows = uploadedItems.map((m) => ({
          post_id: newPostId,
          media_type: m.media_type,
          media_url: m.media_url,
          thumbnail_url: m.thumbnail_url,
          sort_order: m.sort_order,
        }));
        await supabase.from('feed_post_media_items').insert(rows as { post_id: string; media_type: 'image' | 'video'; media_url: string; thumbnail_url: string | null; sort_order: number }[]);
      }
      const authorLabel = staff.full_name ?? feedSharedText('staffOneEmployee');
      const titleTrim = (title ?? '').trim();
      const titlePreview =
        titleTrim.slice(0, 120) + (titleTrim.length > 120 ? '…' : '') || null;

      setUploading(false);
      setUploadStepLabel('');
      setUploadCompleted(0);
      setUploadTotal(0);
      router.back();

      void (async () => {
        try {
          await notifyStaffOfNewFeedPost({
            postId: newPostId,
            authorDisplayName: authorLabel,
            titlePreview,
            excludeStaffId: staff.id,
            createdByStaffId: staff.id,
          });
          if (shouldNotifyGuestsForStaffPost(visibility)) {
            await notifyGuestsOfNewFeedPost(newPostId);
          }
        } catch (e) {
          log.warn('staff/feed/new', 'bildirim veya push', e);
        }
      })();
    } catch (e) {
      setUploading(false);
      setUploadStepLabel('');
      setUploadCompleted(0);
      setUploadTotal(0);
      Alert.alert(t('error'), (e as Error)?.message ?? t('feedPostSaveFailed'));
    }
  };

  if (!staff) return null;

  return (
    <FeedComposeLayout
      hasMedia={mediaItems.length > 0 || !!imageUri}
      mediaSlot={
        <FeedNewPostMediaSection
          imageUri={imageUri}
          mediaType={mediaType}
          mediaItems={mediaItems}
          uploading={uploading}
          onCamera={takePhoto}
          onGallery={pickImage}
          onRemoveMedia={clearMedia}
        />
      }
      footer={
        <TouchableOpacity
          style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
          onPress={uploadAndPublish}
          disabled={uploading}
          activeOpacity={0.88}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>{t('staffFeedPostShare')}</Text>
          )}
        </TouchableOpacity>
      }
    >
      <Text style={styles.label}>{t('feedTextLabel')}</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        placeholder={t('feedTextPlaceholder')}
        placeholderTextColor="#9ca3af"
        value={title}
        onChangeText={setTitle}
        multiline
        numberOfLines={6}
        editable={!uploading}
        textAlignVertical="top"
      />

      <FeedVisibilityPicker
        audience="staff"
        value={visibility}
        onChange={setVisibility}
        disabled={uploading}
      />

      {uploading ? (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{uploadStepLabel || t('loadingSub')}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${uploadTotal > 0 ? Math.min(100, Math.round((uploadCompleted / uploadTotal) * 100)) : 20}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.progressMeta}>
            {uploadTotal > 0
              ? t('feedUploadProgressMeta', { done: uploadCompleted, total: uploadTotal })
              : t('feedUploadStarted')}
          </Text>
        </View>
      ) : null}
    </FeedComposeLayout>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 8 },
  labelSpaced: { marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1d21',
    marginBottom: 18,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  radioRowActive: { borderColor: '#b8860b' },
  radioLabel: { fontSize: 15, color: '#374151' },
  radioCheck: { color: '#b8860b', fontWeight: '700', fontSize: 18 },
  submitBtn: {
    backgroundColor: '#b8860b',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  progressCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  progressTrack: {
    height: 8,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#b8860b',
    borderRadius: 999,
  },
  progressMeta: { marginTop: 6, fontSize: 12, color: '#4b5563', fontWeight: '600' },
});
