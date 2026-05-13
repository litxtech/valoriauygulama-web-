import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import {
  uploadGuestFeedMedia,
  promiseWithTimeout,
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
} from '@/lib/storagePublicUpload';
import { getOrCreateGuestForCaller, getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { FeedNewPostMediaSection } from '@/components/FeedNewPostMediaSection';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import { log } from '@/lib/logger';
import {
  feedPostMediaPickerCameraOptions,
  feedPostMediaPickerGalleryOptions,
  resolveFeedPickedMediaUri,
  ensureLocalFeedUploadUri,
} from '@/lib/feedPostMediaPicker';

export default function CustomerNewFeedPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const { user } = useAuthStore();
  const locationFromMap =
    params.lat != null && params.lng != null && !Number.isNaN(Number(params.lat)) && !Number.isNaN(Number(params.lng))
      ? { lat: Number(params.lat), lng: Number(params.lng) }
      : null;
  const [guestId, setGuestId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaItems, setMediaItems] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadCompleted, setUploadCompleted] = useState(0);
  const [uploadStepLabel, setUploadStepLabel] = useState('');
  const [loadingGuest, setLoadingGuest] = useState(true);
  const [goingBack, setGoingBack] = useState(false);

  const resolveUploadTimeoutMs = (type: 'image' | 'video', total: number) => {
    const base = FEED_MEDIA_UPLOAD_TIMEOUT_MS;
    const multiExtra = Math.max(0, total - 1) * 2 * 60 * 1000;
    const videoExtra = type === 'video' ? 18 * 60 * 1000 : 0;
    return base + multiExtra + videoExtra;
  };

  const fetchGuest = async () => {
    setLoadingGuest(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const row = await getOrCreateGuestForCaller(session?.user ?? null);
      const fallback = row ? null : await getOrCreateGuestForCurrentSession();
      if (row ?? fallback) setGuestId((row ?? fallback)!.guest_id);
    } finally {
      setLoadingGuest(false);
    }
  };

  const goBack = () => {
    if (goingBack) return;
    setGoingBack(true);
    router.back();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingGuest(true);
      try {
        await supabase.auth.refreshSession();
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session?.user) {
          return;
        }
        let row = await getOrCreateGuestForCaller(session.user);
        if (!row) row = await getOrCreateGuestForCurrentSession();
        if (!cancelled && row) setGuestId(row.guest_id);
      } finally {
        if (!cancelled) setLoadingGuest(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  const uploadAndPublish = async () => {
    const hasText = (title ?? '').trim().length > 0;
    if (!hasText && mediaItems.length === 0 && !imageUri) {
      Alert.alert(t('feedMissingContentTitle'), t('feedMissingContentMessage'));
      return;
    }
    if (!guestId) {
      Alert.alert(t('error'), t('feedGuestNotFound'));
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
        setUploadStepLabel(
          t('feedUploadMediaProgress', { current: 0, total: itemsForUpload.length })
        );
        try {
          uploadedItems = await Promise.all(
            itemsForUpload.map(async (item, i) => {
              if (item.type === 'video') setUploadStepLabel(t('feedVideoCompressing'));
              const uriReady = await ensureLocalFeedUploadUri(item.uri, item.type);
              const { publicUrl } = await promiseWithTimeout(
                uploadGuestFeedMedia({
                  uri: uriReady,
                  guestId,
                  kind: item.type === 'video' ? 'video' : 'image',
                }),
                resolveUploadTimeoutMs(item.type, itemsForUpload.length),
                t('feedUploadTimeout')
              );
              setUploadCompleted((prev) => {
                const next = prev + 1;
                setUploadStepLabel(
                  t('feedUploadMediaProgress', { current: next, total: itemsForUpload.length })
                );
                return next;
              });
              return {
                media_type: item.type,
                media_url: publicUrl,
                thumbnail_url: item.type === 'image' ? publicUrl : null,
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
      const insertPayload: Record<string, unknown> = {
        staff_id: null,
        guest_id: guestId,
        media_type: finalMediaType,
        media_url: mediaUrl,
        thumbnail_url: thumbnailUrl,
        title: (title ?? '').trim() || null,
        visibility: 'customers',
      };
      if (locationFromMap) {
        insertPayload.lat = locationFromMap.lat;
        insertPayload.lng = locationFromMap.lng;
        try {
          const Location = await import('expo-location');
          const [rev] = await Location.reverseGeocodeAsync({
            latitude: locationFromMap.lat,
            longitude: locationFromMap.lng,
          }).catch(() => []);
          if (rev) {
            const parts = [rev.street, rev.city, rev.region].filter(Boolean);
            if (parts.length) insertPayload.location_label = parts.join(', ');
          }
        } catch {
          /* reverse geocode optional */
        }
      }
      const { data: insertedPost, error: insertErr } = await supabase
        .from('feed_posts')
        .insert(insertPayload)
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
        await supabase.from('feed_post_media_items').insert(
          uploadedItems.map((m) => ({
            post_id: newPostId,
            media_type: m.media_type,
            media_url: m.media_url,
            thumbnail_url: m.thumbnail_url,
            sort_order: m.sort_order,
          }))
        );
      }
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
          const { data: guestRow } = await supabase
            .from('guests')
            .select('full_name')
            .eq('id', guestId)
            .maybeSingle();
          const authorName = guestDisplayName(
            (guestRow as { full_name?: string | null } | null)?.full_name,
            t('guestDefaultName')
          );
          await notifyStaffOfNewFeedPost({
            postId: newPostId,
            authorDisplayName: authorName,
            titlePreview,
          });
          await notifyGuestsOfNewFeedPost(newPostId);
        } catch (e) {
          log.warn('customer/feed/new', 'notifyStaffOfNewFeedPost', e);
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

  if (loadingGuest) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!guestId && !loadingGuest) {
    return (
      <>
        <Stack.Screen
          options={{
            title: t('screenNewPost'),
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
            headerLeft: () => (
              <TouchableOpacity onPress={goBack} disabled={goingBack} style={{ padding: 8 }}>
                <Text style={{ color: theme.colors.primary, fontWeight: '600' }}>{t('back')}</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <View style={[styles.centered, styles.container]}>
          <Text style={styles.noGuestText}>
            {t('feedLoginToShare', { retry: t('feedRetryButton') })}
          </Text>
          <TouchableOpacity style={[styles.retryBtn, loadingGuest && styles.retryBtnDisabled]} onPress={fetchGuest} disabled={loadingGuest}>
            <Text style={styles.retryBtnText}>
              {loadingGuest ? t('loadingSub') : t('feedRetryButton')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={goBack} disabled={goingBack}>
            <Text style={styles.backBtnText}>{goingBack ? '...' : t('back')}</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t('screenNewPost'),
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {locationFromMap && (
        <View style={styles.locationBadge}>
          <Text style={styles.locationBadgeText}>{t('feedShareFromMapBadge')}</Text>
        </View>
      )}

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

      <FeedNewPostMediaSection
        imageUri={imageUri}
        mediaType={mediaType}
        mediaItems={mediaItems}
        uploading={uploading}
        onCamera={takePhoto}
        onGallery={pickImage}
        onRemoveMedia={clearMedia}
      />

      <TouchableOpacity
        style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
        onPress={uploadAndPublish}
        disabled={uploading}
        activeOpacity={0.88}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={styles.submitBtnInner}>
            <Text style={styles.submitBtnIcon}>↑</Text>
            <Text style={styles.submitBtnText}>{t('feedPublishButton')}</Text>
          </View>
        )}
      </TouchableOpacity>
      {uploading ? (
        <View style={styles.progressCard}>
          <Text style={styles.progressTitle}>{uploadStepLabel || t('loadingSub')}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${uploadTotal > 0 ? Math.min(100, Math.round((uploadCompleted / uploadTotal) * 100)) : 20}%` },
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
    </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 20, paddingBottom: 40 },
  locationBadge: {
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(13, 148, 136, 0.12)',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  locationBadgeText: {
    fontSize: 13,
    color: theme.colors.text,
    fontWeight: '600',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  noGuestText: { fontSize: 16, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 16, paddingHorizontal: 24 },
  retryBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12, marginBottom: 12 },
  retryBtnDisabled: { opacity: 0.7 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  backBtn: { paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12 },
  backBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  label: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 18,
  },
  inputMultiline: { minHeight: 120, textAlignVertical: 'top' },
  submitBtn: {
    backgroundColor: '#0f766e',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#0b4f4a',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  submitBtnIcon: { color: '#fff', fontWeight: '800', fontSize: 16, marginTop: -1 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  progressCard: {
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
  },
  progressTitle: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  progressTrack: {
    height: 8,
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 999,
  },
  progressMeta: { marginTop: 6, fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
});
