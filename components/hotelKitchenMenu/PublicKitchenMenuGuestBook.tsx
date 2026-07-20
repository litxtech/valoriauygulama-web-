import { useCallback, useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  listKitchenMenuGuestComments,
  submitKitchenMenuGuestComment,
  type KitchenMenuGuestComment,
} from '@/lib/publicKitchenMenuGuestComments';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  orgSlug: string;
  tokens: RestaurantTokens;
  accentColor: string;
  onRatingChange?: (avg: number, count: number) => void;
};

function MoodStars({
  value,
  onChange,
  color,
  muted,
  size = 22,
}: {
  value: number;
  onChange?: (n: number) => void;
  color: string;
  muted: string;
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
            color={n <= value ? color : muted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function InitialsAvatar({
  initials,
  accent,
  tokens,
}: {
  initials: string;
  accent: string;
  tokens: RestaurantTokens;
}) {
  return (
    <View style={[styles.avatar, { backgroundColor: `${accent}22`, borderColor: tokens.border }]}>
      <Text style={[styles.avatarText, { color: accent }]}>{initials}</Text>
    </View>
  );
}

export function PublicKitchenMenuGuestBook({
  orgSlug,
  tokens,
  accentColor,
  onRatingChange,
}: Props) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<KitchenMenuGuestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(5);
  const [sending, setSending] = useState(false);
  const [thanks, setThanks] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listKitchenMenuGuestComments({ orgSlug });
      setComments(res.comments);
      onRatingChange?.(res.rating_avg, res.count);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, onRatingChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (firstName.trim().length < 1) {
      Alert.alert(t('error'), t('guestBookFirstName'));
      return;
    }
    if (lastName.trim().length < 1) {
      Alert.alert(t('error'), t('guestBookLastName'));
      return;
    }
    if (comment.trim().length < 2) {
      Alert.alert(t('error'), t('guestBookComment'));
      return;
    }
    setSending(true);
    try {
      const row = await submitKitchenMenuGuestComment({
        orgSlug,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        comment: comment.trim(),
        rating,
      });
      setComments((prev) => [row, ...prev]);
      const next = [row, ...comments];
      const avg =
        next.length > 0
          ? Math.round((next.reduce((s, c) => s + c.rating, 0) / next.length) * 10) / 10
          : 0;
      onRatingChange?.(avg, next.length);
      setComposing(false);
      setFirstName('');
      setLastName('');
      setComment('');
      setRating(5);
      setThanks(true);
      setTimeout(() => setThanks(false), 2800);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message || t('guestBookError'));
    } finally {
      setSending(false);
    }
  };

  const preview = comments.slice(0, 6);

  return (
    <View style={[styles.wrap, { backgroundColor: tokens.bgElevated, borderColor: tokens.border }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: accentColor }]}>{t('guestBookKicker')}</Text>
          <Text style={[styles.title, { color: tokens.text }]}>{t('guestBookTitle')}</Text>
          <Text style={[styles.sub, { color: tokens.textMuted }]}>{t('guestBookSub')}</Text>
        </View>
        {!composing ? (
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: accentColor }]}
            onPress={() => setComposing(true)}
            activeOpacity={0.88}
          >
            <Ionicons name="heart-outline" size={15} color="#fff" />
            <Text style={styles.ctaText}>{t('guestBookWrite')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {thanks ? (
        <View style={[styles.thanks, { backgroundColor: `${accentColor}18` }]}>
          <Ionicons name="checkmark-circle" size={18} color={accentColor} />
          <Text style={[styles.thanksText, { color: tokens.text }]}>{t('guestBookSuccess')}</Text>
        </View>
      ) : null}

      {composing ? (
        <View style={[styles.form, { borderColor: tokens.border, backgroundColor: tokens.bg }]}>
          <Text style={[styles.prompt, { color: tokens.textSecondary }]}>{t('guestBookPrompt')}</Text>
          <MoodStars
            value={rating}
            onChange={setRating}
            color="#E8A838"
            muted={tokens.textMuted}
          />
          <View style={styles.nameRow}>
            <TextInput
              style={[
                styles.input,
                styles.nameInput,
                { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.bgElevated },
              ]}
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t('guestBookFirstName')}
              placeholderTextColor={tokens.textMuted}
              autoCapitalize="words"
            />
            <TextInput
              style={[
                styles.input,
                styles.nameInput,
                { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.bgElevated },
              ]}
              value={lastName}
              onChangeText={setLastName}
              placeholder={t('guestBookLastName')}
              placeholderTextColor={tokens.textMuted}
              autoCapitalize="words"
            />
          </View>
          <TextInput
            style={[
              styles.input,
              styles.multiline,
              { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.bgElevated },
            ]}
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder={t('guestBookCommentPh')}
            placeholderTextColor={tokens.textMuted}
          />
          <View style={styles.formActions}>
            <TouchableOpacity onPress={() => setComposing(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: tokens.textMuted }]}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: accentColor }, sending && styles.submitDisabled]}
              disabled={sending}
              onPress={() => void submit()}
            >
              {sending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitText}>{t('guestBookSubmit')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 10 }} color={accentColor} />
      ) : preview.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>{t('guestBookEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {preview.map((c) => (
            <View
              key={c.id}
              style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.bg }]}
            >
              <InitialsAvatar initials={c.initials} accent={accentColor} tokens={tokens} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardName, { color: tokens.text }]} numberOfLines={1}>
                    {c.display_name}
                  </Text>
                  <MoodStars value={c.rating} color="#E8A838" muted={tokens.textMuted} size={12} />
                </View>
                <Text style={[styles.cardComment, { color: tokens.textSecondary }]} numberOfLines={3}>
                  {c.comment}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, marginTop: 2 },
  sub: { fontSize: 13, lineHeight: 18, fontWeight: '500', marginTop: 4 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  ctaText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  thanks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  thanksText: { fontSize: 13, fontWeight: '700', flex: 1 },
  form: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  prompt: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  starsRow: { flexDirection: 'row', gap: 4 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 9,
    fontSize: 14,
    fontWeight: '600',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 6 },
  cancelText: { fontSize: 13, fontWeight: '600' },
  submitBtn: {
    minWidth: 100,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  empty: { fontSize: 13, fontWeight: '500', paddingVertical: 6 },
  list: { gap: 8 },
  card: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  cardName: { fontSize: 13, fontWeight: '800', flex: 1 },
  cardComment: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
});
