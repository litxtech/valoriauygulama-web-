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
  Modal,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  deleteKitchenMenuGuestComment,
  getGuestCommentDeleteToken,
  listKitchenMenuGuestComments,
  listOwnedGuestCommentIds,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);

  const refreshOwned = useCallback(() => {
    setOwnedIds(listOwnedGuestCommentIds());
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listKitchenMenuGuestComments({ orgSlug });
      setComments(res.comments);
      onRatingChange?.(res.rating_avg, res.count);
      refreshOwned();
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [orgSlug, onRatingChange, refreshOwned]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeCompose = () => {
    setComposing(false);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    }
  };

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
      const { comment: row } = await submitKitchenMenuGuestComment({
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
      refreshOwned();
      closeCompose();
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

  const remove = (c: KitchenMenuGuestComment) => {
    const token = getGuestCommentDeleteToken(c.id);
    if (!token) return;
    const run = async () => {
      setDeletingId(c.id);
      try {
        await deleteKitchenMenuGuestComment({ orgSlug, commentId: c.id, deleteToken: token });
        const next = comments.filter((x) => x.id !== c.id);
        setComments(next);
        const avg =
          next.length > 0
            ? Math.round((next.reduce((s, row) => s + row.rating, 0) / next.length) * 10) / 10
            : 0;
        onRatingChange?.(avg, next.length);
        refreshOwned();
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message || t('guestBookDeleteError'));
      } finally {
        setDeletingId(null);
      }
    };

    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        window.confirm(t('guestBookDeleteConfirm', { defaultValue: 'Yorumunuzu silmek istiyor musunuz?' }));
      if (ok) void run();
      return;
    }
    Alert.alert(t('guestBookDelete'), t('guestBookDeleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('guestBookDelete'), style: 'destructive', onPress: () => void run() },
    ]);
  };

  const preview = comments.slice(0, 8);
  const inputFont = Platform.OS === 'web' ? 16 : 14;

  return (
    <View style={[styles.wrap, { backgroundColor: tokens.bgElevated, borderColor: tokens.border }]}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.kicker, { color: accentColor }]}>{t('guestBookKicker')}</Text>
          <Text style={[styles.title, { color: tokens.text }]}>{t('guestBookTitle')}</Text>
          <Text style={[styles.sub, { color: tokens.textMuted }]}>{t('guestBookSub')}</Text>
        </View>
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: accentColor }]}
          onPress={() => setComposing(true)}
          activeOpacity={0.88}
        >
          <Ionicons name="heart-outline" size={15} color="#fff" />
          <Text style={styles.ctaText}>{t('guestBookWrite')}</Text>
        </TouchableOpacity>
      </View>

      {thanks ? (
        <View style={[styles.thanks, { backgroundColor: `${accentColor}18` }]}>
          <Ionicons name="checkmark-circle" size={18} color={accentColor} />
          <Text style={[styles.thanksText, { color: tokens.text }]}>{t('guestBookSuccess')}</Text>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 10 }} color={accentColor} />
      ) : preview.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>{t('guestBookEmpty')}</Text>
      ) : (
        <View style={styles.list}>
          {preview.map((c) => {
            const canDelete = ownedIds.includes(c.id) && !!getGuestCommentDeleteToken(c.id);
            return (
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
                {canDelete ? (
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => remove(c)}
                    disabled={deletingId === c.id}
                    hitSlop={8}
                    accessibilityLabel={t('guestBookDelete')}
                  >
                    {deletingId === c.id ? (
                      <ActivityIndicator size="small" color={tokens.textMuted} />
                    ) : (
                      <Ionicons name="trash-outline" size={16} color={tokens.textMuted} />
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={composing}
        transparent
        animationType="fade"
        onRequestClose={closeCompose}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeCompose} />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: tokens.bgElevated, borderColor: tokens.border },
            ]}
          >
            <View style={styles.modalGrab} />
            <View style={styles.modalHead}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>{t('guestBookWrite')}</Text>
              <TouchableOpacity onPress={closeCompose} hitSlop={10} accessibilityLabel={t('cancel')}>
                <Ionicons name="close" size={22} color={tokens.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalBody}
              {...(Platform.OS === 'web'
                ? ({ style: { maxHeight: '70vh', overflowY: 'auto' } } as object)
                : null)}
            >
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
                    {
                      color: tokens.text,
                      borderColor: tokens.border,
                      backgroundColor: tokens.bg,
                      fontSize: inputFont,
                    },
                  ]}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder={t('guestBookFirstName')}
                  placeholderTextColor={tokens.textMuted}
                  autoCapitalize="words"
                  autoFocus={Platform.OS !== 'web'}
                />
                <TextInput
                  style={[
                    styles.input,
                    styles.nameInput,
                    {
                      color: tokens.text,
                      borderColor: tokens.border,
                      backgroundColor: tokens.bg,
                      fontSize: inputFont,
                    },
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
                  {
                    color: tokens.text,
                    borderColor: tokens.border,
                    backgroundColor: tokens.bg,
                    fontSize: inputFont,
                  },
                ]}
                value={comment}
                onChangeText={setComment}
                multiline
                placeholder={t('guestBookCommentPh')}
                placeholderTextColor={tokens.textMuted}
              />
              <View style={styles.formActions}>
                <TouchableOpacity onPress={closeCompose} style={styles.cancelBtn}>
                  <Text style={[styles.cancelText, { color: tokens.textMuted }]}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    { backgroundColor: accentColor },
                    sending && styles.submitDisabled,
                  ]}
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
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    zIndex: 1,
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
  starsRow: { flexDirection: 'row', gap: 4 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameInput: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 9,
    fontWeight: '600',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
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
    alignItems: 'flex-start',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
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
  prompt: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web'
      ? ({
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
        } as object)
      : {}),
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,15,26,0.45)',
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: Platform.OS === 'web' ? 24 : 18,
    maxHeight: Platform.OS === 'web' ? ('85vh' as unknown as number) : '88%',
    zIndex: 2,
  },
  modalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(100,116,139,0.35)',
    marginTop: 10,
    marginBottom: 6,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalBody: { paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
});
