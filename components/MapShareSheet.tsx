/**
 * Haritada paylaşım kartı - Modal içinde, ayrı sayfaya gitmeden paylaşım yapılır.
 */

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
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Video, ResizeMode } from 'expo-av';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { uploadGuestFeedMedia, uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureLocalFeedUploadUri } from '@/lib/feedPostMediaPicker';
import { copyAndroidContentUriToCacheForPreview } from '@/lib/uploadMedia';
import { getOrCreateGuestForCaller, getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { Ionicons } from '@expo/vector-icons';
import { POST_TAGS, type PostTagValue } from '@/lib/feedPostTags';
import { notifyGuestsOfNewFeedPost, notifyStaffOfNewFeedPost } from '@/lib/notifyNewFeedPost';
import { log } from '@/lib/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  feedPostMediaPickerCameraOptions,
  feedPostMediaPickerGalleryOptions,
} from '@/lib/feedPostMediaPicker';

const BUCKET = 'feed-media';

type MapShareSheetProps = {
  visible: boolean;
  onClose: () => void;
  location: { lat: number; lng: number };
  onSuccess?: () => void;
};

export default function MapShareSheet({ visible, onClose, location, onSuccess }: MapShareSheetProps) {
  const { user, staff } = useAuthStore();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = Math.round(screenHeight * 0.9);
  const paddingBottom = Math.max(24, insets.bottom);
  const [guestId, setGuestId] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [title, setTitle] = useState('');
  const [postTag, setPostTag] = useState<PostTagValue>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingGuest, setLoadingGuest] = useState(true);

  useEffect(() => {
    if (!visible || (!user && !staff)) {
      setLoadingGuest(false);
      return;
    }
    if (staff) {
      setGuestId(null);
      setLoadingGuest(false);
      return;
    }
    let cancelled = false;
    setLoadingGuest(true);
    (async () => {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const row = await getOrCreateGuestForCaller(session?.user ?? null);
      const fallback = row ? null : await getOrCreateGuestForCurrentSession();
      if (!cancelled) setGuestId((row ?? fallback)?.guest_id ?? null);
      if (!cancelled) setLoadingGuest(false);
    })();
    return () => { cancelled = true; };
  }, [visible, user?.id, staff?.id]);

  const resetForm = () => {
    setImageUri(null);
    setTitle('');
    setPostTag(null);
    setMediaType('image');
  };

  /** Android content:// video: doğru uzantı + file yolu; yükleme ve önizleme güvenilir olur */
  const resolvePickedUri = async (asset: ImagePicker.ImagePickerAsset) => {
    const isVideo = asset.type === 'video';
    let uri = asset.uri ?? '';
    if (!uri) return { uri: '', type: isVideo ? ('video' as const) : ('image' as const) };
    if (Platform.OS === 'android' && uri.startsWith('content://') && isVideo) {
      try {
        uri = await copyAndroidContentUriToCacheForPreview(uri, 'video');
      } catch (e) {
        log.warn('MapShareSheet', 'android video cache', e);
      }
    }
    return { uri, type: isVideo ? ('video' as const) : ('image' as const) };
  };

  const pickImage = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Paylaşım için galeriden foto/video seçmek amacıyla izin istiyoruz.',
      settingsMessage: 'Galeri izni kapalı. Paylaşım için ayarlardan galeri iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync(feedPostMediaPickerGalleryOptions);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const resolved = await resolvePickedUri(asset);
    if (!resolved.uri) {
      Alert.alert('Hata', 'Görsel yüklenemedi. Tekrar deneyin.');
      return;
    }
    setImageUri(resolved.uri);
    setMediaType(resolved.type);
  };

  const takePhoto = async () => {
    const granted = await ensureCameraPermission({
      title: 'Kamera izni',
      message: 'Paylaşım için fotoğraf çekmek amacıyla kamera erişimi istiyoruz.',
      settingsMessage: 'Kamera izni kapalı. Paylaşım için ayarlardan kamera iznini açın.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchCameraAsync(feedPostMediaPickerCameraOptions);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const resolved = await resolvePickedUri(asset);
    if (!resolved.uri) {
      Alert.alert('Hata', 'Fotoğraf yüklenemedi. Tekrar deneyin.');
      return;
    }
    setImageUri(resolved.uri);
    setMediaType(resolved.type);
  };

  const uploadAndPublish = async () => {
    const hasText = (title ?? '').trim().length > 0;
    if (!hasText && !imageUri) {
      Alert.alert('Eksik', 'Lütfen metin yazın veya fotoğraf/video ekleyin.');
      return;
    }
    if (!staff && !guestId) {
      Alert.alert('Hata', 'Oturum bilginiz yüklenemedi. Lütfen tekrar deneyin.');
      return;
    }
    setUploading(true);
    const geoPromise = (async (): Promise<string | null> => {
      try {
        const Location = await import('expo-location');
        const [rev] = await Location.reverseGeocodeAsync({
          latitude: location.lat,
          longitude: location.lng,
        }).catch(() => []);
        if (rev) {
          const parts = [rev.street, rev.city, rev.region].filter(Boolean);
          if (parts.length) return parts.join(', ');
        }
      } catch {
        /* konum metni isteğe bağlı */
      }
      return null;
    })();

    try {
      let finalMediaType: 'image' | 'video' | 'text' = 'text';
      let mediaUrl: string | null = null;
      let thumbnailUrl: string | null = null;

      if (imageUri) {
        finalMediaType = mediaType;
        let uriToUse = imageUri;
        if (mediaType === 'image' && Platform.OS === 'android' && imageUri.startsWith('content://')) {
          try {
            const manipulated = await ImageManipulator.manipulateAsync(imageUri, [{ resize: { width: 1600 } }], {
              compress: 0.85,
              format: ImageManipulator.SaveFormat.JPEG,
            });
            if (manipulated?.uri) uriToUse = manipulated.uri;
          } catch (_) {
            /* orijinal uri ile devam et */
          }
        }
        try {
          const uploadUri =
            mediaType === 'video' ? await ensureLocalFeedUploadUri(uriToUse, 'video') : uriToUse;
          if (staff) {
            const { publicUrl } = await uploadUriToPublicBucket({
              bucketId: BUCKET,
              uri: uploadUri,
              kind: mediaType === 'video' ? 'video' : 'image',
              subfolder: 'map',
            });
            mediaUrl = publicUrl;
          } else if (guestId) {
            const { publicUrl } = await uploadGuestFeedMedia({
              uri: uploadUri,
              guestId,
              kind: mediaType === 'video' ? 'video' : 'image',
            });
            mediaUrl = publicUrl;
          }
          thumbnailUrl = mediaType === 'image' ? mediaUrl : null;
        } catch (e) {
          const msg = (e as Error)?.message ?? '';
          log.error('MapShareSheet', 'medya yükleme', e);
          setUploading(false);
          Alert.alert('Medya yüklenemedi', msg.includes('okunamadı') ? 'Görsel/video işlenemedi. Lütfen tekrar seçin.' : msg);
          return;
        }
      }

      const locationLabel = await geoPromise;
      const { data: postId, error: insertErr } = await supabase.rpc('insert_feed_post_from_map', {
        p_media_type: finalMediaType,
        p_media_url: mediaUrl,
        p_thumbnail_url: thumbnailUrl,
        p_title: (title ?? '').trim() || null,
        p_lat: location.lat,
        p_lng: location.lng,
        p_location_label: locationLabel,
        p_post_tag: postTag || null,
      });
      if (insertErr || !postId) {
        setUploading(false);
        Alert.alert('Hata', insertErr?.message ?? 'Paylaşım kaydedilemedi.');
        return;
      }
      const titleTrim = (title ?? '').trim();
      const titlePreview =
        titleTrim.slice(0, 120) + (titleTrim.length > 120 ? '…' : '') || null;
      if (staff) {
        void (async () => {
          try {
            await notifyStaffOfNewFeedPost({
              postId: String(postId),
              authorDisplayName: staff.full_name ?? 'Bir çalışan',
              titlePreview,
              excludeStaffId: staff.id,
              createdByStaffId: staff.id,
            });
            await notifyGuestsOfNewFeedPost(String(postId));
          } catch (e) {
            log.warn('MapShareSheet', 'bildirim (staff)', e);
          }
        })();
      } else if (guestId) {
        void (async () => {
          try {
            const { data: guestRow } = await supabase
              .from('guests')
              .select('full_name')
              .eq('id', guestId)
              .maybeSingle();
            const authorName = guestDisplayName((guestRow as { full_name?: string | null } | null)?.full_name, 'Misafir');
            await notifyStaffOfNewFeedPost({
              postId: String(postId),
              authorDisplayName: authorName,
              titlePreview,
            });
            await notifyGuestsOfNewFeedPost(String(postId));
          } catch (e) {
            log.warn('MapShareSheet', 'bildirim (misafir)', e);
          }
        })();
      }
      resetForm();
      onSuccess?.();
      onClose();
    } catch (e) {
      log.error('MapShareSheet', 'uploadAndPublish', e);
      setUploading(false);
      Alert.alert('Hata', (e as Error)?.message ?? 'Paylaşım kaydedilemedi.');
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (!uploading) {
      resetForm();
      onClose();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={[styles.sheet, { height: sheetHeight, paddingBottom }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Konumdan paylaş</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} disabled={uploading}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.locationBadge}>
            <Ionicons name="location" size={16} color={theme.colors.primary} />
            <Text style={styles.locationBadgeText}>📍 Konum ekleniyor</Text>
          </View>
          {loadingGuest ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : !guestId && !staff ? (
            <View style={styles.centered}>
              <Text style={styles.noGuestText}>Paylaşım için misafir kaydı gerekli.</Text>
            </View>
          ) : (
            <ScrollView style={styles.form} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>Etiket (isteğe bağlı)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagsRow} contentContainerStyle={styles.tagsRowContent}>
                {POST_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag.value}
                    style={[styles.tagChip, postTag === tag.value && styles.tagChipActive]}
                    onPress={() => setPostTag(postTag === tag.value ? null : tag.value)}
                    activeOpacity={0.7}
                    disabled={uploading}
                  >
                    <Text style={[styles.tagChipText, postTag === tag.value && styles.tagChipTextActive]}>{tag.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.label}>Metin (isteğe bağlı)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Ne paylaşmak istiyorsunuz?"
                placeholderTextColor="#9ca3af"
                value={title}
                onChangeText={setTitle}
                multiline
                numberOfLines={3}
                editable={!uploading}
              />
              <Text style={[styles.label, { marginTop: 16 }]}>Fotoğraf veya video</Text>
              <View style={styles.buttonsRow}>
                <TouchableOpacity style={[styles.mediaBtn, styles.mediaBtnPhoto]} onPress={takePhoto} disabled={uploading}>
                  <Text style={styles.mediaBtnText}>📷 Çek</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mediaBtn, styles.mediaBtnGallery]} onPress={pickImage} disabled={uploading}>
                  <Text style={styles.mediaBtnText}>📁 Galeri</Text>
                </TouchableOpacity>
              </View>
              {imageUri ? (
                <View style={styles.previewWrap}>
                  {mediaType === 'image' ? (
                    <CachedImage uri={imageUri} style={styles.preview} contentFit="cover" />
                  ) : (
                    <Video
                      source={{ uri: imageUri }}
                      style={styles.preview}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls
                      isLooping
                      shouldPlay={false}
                    />
                  )}
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
                onPress={uploadAndPublish}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>Paylaş</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.borderLight,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  closeBtn: { padding: 8 },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  locationBadgeText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  centered: { padding: 32, alignItems: 'center' },
  noGuestText: { fontSize: 15, color: theme.colors.textSecondary },
  form: { flex: 1 },
  formContent: { padding: 20, paddingBottom: 60 },
  tagsRow: { marginBottom: 12 },
  tagsRowContent: { gap: 8, paddingRight: 20 },
  tagChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  tagChipActive: { backgroundColor: theme.colors.primary + '20', borderColor: theme.colors.primary },
  tagChipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  tagChipTextActive: { color: theme.colors.primary },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  buttonsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  mediaBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  mediaBtnPhoto: { backgroundColor: '#0ea5e9' },
  mediaBtnGallery: { backgroundColor: '#8b5cf6' },
  mediaBtnText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  previewWrap: { marginBottom: 20 },
  preview: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: theme.colors.borderLight,
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
