import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
import { CachedImage } from '@/components/CachedImage';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

const BUCKET = 'feed-media';
const AVATAR = 44;

export default function NewFeedPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string }>();
  const { staff } = useAuthStore();
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
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

  const displayName = (staff?.full_name ?? '').trim();
  const avatarUri = (staff?.profile_image ?? '').trim() || null;
  const letter = (displayName.charAt(0) || '?').toUpperCase();
  const firstName = displayName.split(/\s+/)[0] || '';
  const canPublish = (title ?? '').trim().length > 0 || mediaItems.length > 0 || !!imageUri;

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
    const result = await ImagePicker.launchImageLibraryAsync({
      ...feedPostMediaPickerGalleryOptions,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets?.length) return;
    const assets = result.assets.filter((a) => !!a.uri?.trim());
    if (!assets.length) {
      Alert.alert(t('error'), t('feedImagePickFailed'));
      return;
    }
    const next = assets.map((a) => ({
      uri: a.uri!.trim(),
      type: a.type === 'video' ? ('video' as const) : ('image' as const),
    }));
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

      const itemsForUpload =
        mediaItems.length > 0 ? mediaItems : imageUri ? [{ uri: imageUri, type: mediaType }] : [];
      let uploadedItems: {
        media_type: 'image' | 'video';
        media_url: string;
        thumbnail_url: string | null;
        sort_order: number;
      }[] = [];
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
        await supabase.from('feed_post_media_items').insert(
          rows as {
            post_id: string;
            media_type: 'image' | 'video';
            media_url: string;
            thumbnail_url: string | null;
            sort_order: number;
          }[]
        );
      }
      const authorLabel = staff.full_name ?? feedSharedText('staffOneEmployee');
      const titleTrim = (title ?? '').trim();
      const titlePreview = titleTrim.slice(0, 120) + (titleTrim.length > 120 ? '…' : '') || null;

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

  const progressPct =
    uploadTotal > 0 ? Math.min(100, Math.round((uploadCompleted / uploadTotal) * 100)) : 22;

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
        <View style={styles.footer}>
          <Pressable
            onPress={uploadAndPublish}
            disabled={uploading || !canPublish}
            style={({ pressed }) => [
              styles.submitWrap,
              (uploading || !canPublish) && styles.submitDisabled,
              pressed && canPublish && !uploading && { opacity: 0.92, transform: [{ scale: 0.985 }] },
            ]}
          >
            <LinearGradient
              colors={palette.gradientCta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.submitBtn}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>{t('staffFeedPostShare')}</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
        </View>
      }
    >
      <View style={styles.authorRow}>
        <View style={[styles.avatarRing, { borderColor: palette.accent }]}>
          <View style={[styles.avatarWrap, { backgroundColor: isNight ? palette.borderLight : '#fff' }]}>
            {avatarUri ? (
              <CachedImage
                uri={avatarUri}
                style={styles.avatarImg}
                contentFit="cover"
                transition={0}
                recyclingKey={avatarUri}
              />
            ) : (
              <LinearGradient colors={[palette.accent, '#14B8A6']} style={styles.avatarPh}>
                <Text style={styles.avatarLetter}>{letter}</Text>
              </LinearGradient>
            )}
          </View>
        </View>
        <View style={styles.authorMeta}>
          <Text style={[styles.authorName, { color: palette.text }]} numberOfLines={1}>
            {displayName || feedSharedText('staffOneEmployee')}
          </Text>
          <Text style={[styles.authorHint, { color: palette.muted }]} numberOfLines={1}>
            {firstName ? `${firstName}, ne paylaşmak istersin?` : t('feedTextPlaceholder')}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.composerCard,
          {
            backgroundColor: isNight ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.92)',
            borderColor: palette.borderLight,
          },
        ]}
      >
        <TextInput
          style={[styles.input, { color: palette.text }]}
          placeholder={t('feedTextPlaceholder')}
          placeholderTextColor={palette.muted}
          value={title}
          onChangeText={setTitle}
          multiline
          numberOfLines={6}
          editable={!uploading}
          textAlignVertical="top"
        />
        <Text style={[styles.charHint, { color: palette.muted }]}>
          {title.trim().length > 0 ? `${title.trim().length} karakter` : 'Metin isteğe bağlı'}
        </Text>
      </View>

      <FeedVisibilityPicker
        audience="staff"
        value={visibility}
        onChange={setVisibility}
        disabled={uploading}
        accentColor={palette.accent}
      />

      {uploading ? (
        <View
          style={[
            styles.progressCard,
            {
              backgroundColor: isNight ? 'rgba(255,255,255,0.05)' : '#fff',
              borderColor: palette.borderLight,
            },
          ]}
        >
          <View style={styles.progressHead}>
            <ActivityIndicator size="small" color={palette.accent} />
            <Text style={[styles.progressTitle, { color: palette.text }]}>
              {uploadStepLabel || t('loadingSub')}
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: palette.accentSoft }]}>
            <LinearGradient
              colors={palette.gradientCta}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={[styles.progressFill, { width: `${progressPct}%` }]}
            />
          </View>
          <Text style={[styles.progressMeta, { color: palette.muted }]}>
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
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatarRing: {
    width: AVATAR + 4,
    height: AVATAR + 4,
    borderRadius: (AVATAR + 4) / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1.5,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 16, fontWeight: '800', color: '#fff' },
  authorMeta: { flex: 1, minWidth: 0, gap: 2 },
  authorName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.1 },
  authorHint: { fontSize: 13, fontWeight: '600' },
  composerCard: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    marginBottom: 18,
    minHeight: 140,
  },
  input: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '500',
    minHeight: 110,
    textAlignVertical: 'top',
    padding: 0,
  },
  charHint: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    paddingTop: 8,
  },
  submitWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0B3D36',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.22,
        shadowRadius: 16,
      },
      android: { elevation: 5 },
    }),
  },
  submitDisabled: { opacity: 0.45 },
  submitBtn: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  progressCard: {
    marginTop: 14,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressTitle: { flex: 1, fontSize: 13, fontWeight: '700' },
  progressTrack: {
    height: 8,
    marginTop: 10,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  progressMeta: { marginTop: 8, fontSize: 12, fontWeight: '600' },
});
