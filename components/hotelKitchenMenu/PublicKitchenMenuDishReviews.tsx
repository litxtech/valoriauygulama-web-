import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { CachedImage } from '@/components/CachedImage';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  listKitchenMenuItemReviews,
  submitKitchenMenuItemReview,
  uploadKitchenMenuReviewFile,
  type KitchenMenuReview,
  type KitchenMenuReviewMedia,
} from '@/lib/publicKitchenMenuReviews';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';

type Props = {
  orgSlug: string;
  itemId: string;
  initialCount?: number;
  initialAvg?: number;
  onStatsChange?: (stats: { review_count: number; rating_avg: number }) => void;
};

type PendingMedia = { uri: string; mime: string; name?: string; uploaded?: KitchenMenuReviewMedia };

function Stars({
  value,
  onChange,
  size = 22,
}: {
  value: number;
  onChange?: (n: number) => void;
  size?: number;
}) {
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          disabled={!onChange}
          onPress={() => onChange?.(n)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${n}`}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={size}
            color={n <= value ? '#E8A838' : menuUi.webMuted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function PublicKitchenMenuDishReviews({
  orgSlug,
  itemId,
  initialCount = 0,
  initialAvg = 0,
  onStatsChange,
}: Props) {
  const { t } = useTranslation();
  const [reviews, setReviews] = useState<KitchenMenuReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(5);
  const [media, setMedia] = useState<PendingMedia[]>([]);
  const [sending, setSending] = useState(false);
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listKitchenMenuItemReviews({ orgSlug, itemId });
      setReviews(rows);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, itemId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setAvg(initialAvg);
    setCount(initialCount);
  }, [initialAvg, initialCount, itemId]);

  const pickMedia = async (videos: boolean) => {
    if (media.length >= 4) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('kitchenMenuWriteReview'),
      message: t('kitchenMenuTagsHint'),
      settingsMessage: t('hotelKitchenMenuGalleryPermSettings', {
        defaultValue: 'Ayarlardan galeri izni verin.',
      }),
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: videos ? ['videos'] : ['images'],
      quality: 0.85,
      allowsMultipleSelection: !videos,
      selectionLimit: 4 - media.length,
    });
    if (result.canceled || !result.assets?.length) return;
    setMedia((prev) => [
      ...prev,
      ...result.assets.slice(0, 4 - prev.length).map((a) => ({
        uri: a.uri,
        mime: a.mimeType || (videos ? 'video/mp4' : 'image/jpeg'),
        name: a.fileName ?? undefined,
      })),
    ]);
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      Alert.alert(t('error'), t('kitchenMenuReviewName'));
      return;
    }
    if (!comment.trim() && media.length === 0) {
      Alert.alert(t('error'), t('kitchenMenuReviewComment'));
      return;
    }
    setSending(true);
    try {
      const uploaded: KitchenMenuReviewMedia[] = [];
      for (const m of media) {
        if (m.uploaded) {
          uploaded.push(m.uploaded);
          continue;
        }
        uploaded.push(
          await uploadKitchenMenuReviewFile({ uri: m.uri, mime: m.mime, name: m.name })
        );
      }
      const result = await submitKitchenMenuItemReview({
        orgSlug,
        itemId,
        rating,
        displayName: name.trim(),
        comment: comment.trim(),
        media: uploaded,
      });
      setReviews((prev) => [result.review, ...prev]);
      setAvg(result.rating_avg);
      setCount(result.review_count);
      onStatsChange?.({ review_count: result.review_count, rating_avg: result.rating_avg });
      setComposing(false);
      setName('');
      setComment('');
      setRating(5);
      setMedia([]);
      Alert.alert(t('success'), t('kitchenMenuReviewSuccess'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message || t('kitchenMenuReviewError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('kitchenMenuReviewsTitle')}</Text>
        {count > 0 ? (
          <View style={styles.avgRow}>
            <Ionicons name="star" size={14} color="#E8A838" />
            <Text style={styles.avgText}>
              {avg.toFixed(1)} · {t('kitchenMenuReviewCount', { count })}
            </Text>
          </View>
        ) : (
          <Text style={styles.avgText}>{t('kitchenMenuNoReviewsYet')}</Text>
        )}
      </View>

      {!composing ? (
        <TouchableOpacity style={styles.writeBtn} onPress={() => setComposing(true)}>
          <Ionicons name="create-outline" size={18} color={menuUi.navy} />
          <Text style={styles.writeBtnText}>{t('kitchenMenuWriteReview')}</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>{t('kitchenMenuReviewRating')}</Text>
          <Stars value={rating} onChange={setRating} />
          <Text style={styles.label}>{t('kitchenMenuReviewName')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('kitchenMenuReviewName')}
            placeholderTextColor={menuUi.webMuted}
          />
          <Text style={styles.label}>{t('kitchenMenuReviewComment')}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder={t('kitchenMenuReviewCommentPh')}
            placeholderTextColor={menuUi.webMuted}
          />
          <View style={styles.mediaBtns}>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia(false)}>
              <Ionicons name="image-outline" size={16} color={menuUi.navy} />
              <Text style={styles.mediaBtnText}>{t('kitchenMenuReviewAddPhoto')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.mediaBtn} onPress={() => void pickMedia(true)}>
              <Ionicons name="videocam-outline" size={16} color={menuUi.navy} />
              <Text style={styles.mediaBtnText}>{t('kitchenMenuReviewAddVideo')}</Text>
            </TouchableOpacity>
          </View>
          {media.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
              {media.map((m, idx) => (
                <View key={`${m.uri}-${idx}`} style={styles.mediaThumb}>
                  {m.mime.startsWith('video/') ? (
                    <View style={styles.videoPh}>
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>
                  ) : (
                    <CachedImage uri={m.uri} style={styles.mediaImg} contentFit="cover" />
                  )}
                  <TouchableOpacity
                    style={styles.mediaRemove}
                    onPress={() => setMedia((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close" size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          ) : null}
          <TouchableOpacity
            style={[styles.submitBtn, sending && styles.submitDisabled]}
            disabled={sending}
            onPress={() => void submit()}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{t('kitchenMenuReviewSubmit')}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setComposing(false)} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 12 }} color={menuUi.accent} />
      ) : reviews.length === 0 ? (
        <Text style={styles.empty}>{t('kitchenMenuReviewsEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {reviews.map((r) => (
            <View key={r.id} style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardName}>{r.display_name || '—'}</Text>
                <Stars value={r.rating} size={14} />
              </View>
              {r.comment ? <Text style={styles.cardComment}>{r.comment}</Text> : null}
              {r.media_urls.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mediaStrip}>
                  {r.media_urls.map((m, i) =>
                    m.type === 'video' ? (
                      <TouchableOpacity
                        key={`${r.id}-v-${i}`}
                        style={styles.mediaThumb}
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.open(m.url, '_blank');
                          }
                        }}
                      >
                        <View style={styles.videoPh}>
                          <Ionicons name="play" size={18} color="#fff" />
                        </View>
                      </TouchableOpacity>
                    ) : (
                      <CachedImage
                        key={`${r.id}-i-${i}`}
                        uri={m.url}
                        style={styles.mediaThumb}
                        contentFit="cover"
                      />
                    )
                  )}
                </ScrollView>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18, gap: 10 },
  head: { gap: 4 },
  title: { fontSize: 17, fontWeight: '800', color: menuUi.navy },
  avgRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avgText: { fontSize: 13, color: menuUi.webMuted, fontWeight: '600' },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${menuUi.navy}33`,
    backgroundColor: `${menuUi.accent}12`,
  },
  writeBtnText: { fontWeight: '700', color: menuUi.navy, fontSize: 14 },
  form: { gap: 8, padding: 12, borderRadius: 16, backgroundColor: '#F7F8FC', borderWidth: 1, borderColor: '#E6EAF2' },
  label: { fontSize: 12, fontWeight: '700', color: menuUi.navyMid },
  input: {
    borderWidth: 1,
    borderColor: '#D8DEE9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: menuUi.navy,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  starsRow: { flexDirection: 'row', gap: 4 },
  mediaBtns: { flexDirection: 'row', gap: 8 },
  mediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D8DEE9',
    backgroundColor: '#fff',
  },
  mediaBtnText: { fontSize: 13, fontWeight: '700', color: menuUi.navy },
  mediaStrip: { gap: 8, paddingVertical: 4 },
  mediaThumb: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1a2236' },
  mediaImg: { width: '100%', height: '100%' },
  videoPh: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a2236' },
  mediaRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    marginTop: 4,
    backgroundColor: menuUi.navy,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: menuUi.webMuted, fontWeight: '600' },
  empty: { fontSize: 13, color: menuUi.webMuted, lineHeight: 18 },
  list: { gap: 10 },
  card: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E8ECF3',
    gap: 6,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardName: { fontWeight: '800', color: menuUi.navy, fontSize: 14, flex: 1 },
  cardComment: { fontSize: 14, color: menuUi.navyMid, lineHeight: 20 },
});
