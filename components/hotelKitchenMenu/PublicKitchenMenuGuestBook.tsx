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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  visible: boolean;
  onClose: () => void;
  onRatingChange?: (avg: number, count: number) => void;
  /** Prefetch when sheet closed so header rating stays fresh */
  prefetch?: boolean;
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
  visible,
  onClose,
  onRatingChange,
  prefetch = true,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const [comments, setComments] = useState<KitchenMenuGuestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [comment, setComment] = useState('');
  const [rating, setRating] = useState(5);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [ownedIds, setOwnedIds] = useState<string[]>([]);

  const compact = winW < 400;
  const sheetMaxH = Math.min(winH * 0.92, winH - Math.max(insets.top, 8));

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
    if (prefetch || visible) void load();
  }, [load, prefetch, visible]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const close = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    }
    onClose();
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
      setFirstName('');
      setLastName('');
      setComment('');
      setRating(5);
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

  const inputFont = Platform.OS === 'web' ? 16 : 14;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={close} />
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: tokens.bgElevated,
              borderColor: tokens.border,
              maxHeight: sheetMaxH,
              paddingBottom: Math.max(insets.bottom, 14),
            },
          ]}
        >
          <View style={styles.modalGrab} />
          <View style={styles.modalHead}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, { color: accentColor }]}>{t('guestBookKicker')}</Text>
              <Text style={[styles.modalTitle, { color: tokens.text }]} numberOfLines={1}>
                {t('guestBookTitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={close} hitSlop={12} accessibilityLabel={t('cancel')}>
              <Ionicons name="close" size={24} color={tokens.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            contentContainerStyle={[styles.scrollBody, compact && styles.scrollBodyCompact]}
            bounces
            {...(Platform.OS === 'web'
              ? ({ style: { WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' } } as object)
              : null)}
          >
            <View style={[styles.form, { borderColor: tokens.border, backgroundColor: tokens.bg }]}>
              <Text style={[styles.prompt, { color: tokens.textSecondary }]}>{t('guestBookPrompt')}</Text>
              <MoodStars value={rating} onChange={setRating} color="#E8A838" muted={tokens.textMuted} />
              <View style={[styles.nameRow, compact && styles.nameRowStack]}>
                <TextInput
                  style={[
                    styles.input,
                    styles.nameInput,
                    compact && styles.nameInputFull,
                    {
                      color: tokens.text,
                      borderColor: tokens.border,
                      backgroundColor: tokens.bgElevated,
                      fontSize: inputFont,
                    },
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
                    compact && styles.nameInputFull,
                    {
                      color: tokens.text,
                      borderColor: tokens.border,
                      backgroundColor: tokens.bgElevated,
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
                    backgroundColor: tokens.bgElevated,
                    fontSize: inputFont,
                  },
                ]}
                value={comment}
                onChangeText={setComment}
                multiline
                placeholder={t('guestBookCommentPh')}
                placeholderTextColor={tokens.textMuted}
              />
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

            <Text style={[styles.listTitle, { color: tokens.text }]}>
              {t('guestBookListTitle', { defaultValue: 'Yorumlar' })}
              {comments.length > 0 ? ` · ${comments.length}` : ''}
            </Text>

            {loading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} color={accentColor} />
            ) : comments.length === 0 ? (
              <Text style={[styles.empty, { color: tokens.textMuted }]}>{t('guestBookEmpty')}</Text>
            ) : (
              <View style={styles.list}>
                {comments.map((c) => {
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
                        <Text style={[styles.cardComment, { color: tokens.textSecondary }]}>
                          {c.comment}
                        </Text>
                      </View>
                      {canDelete ? (
                        <TouchableOpacity
                          style={styles.deleteBtn}
                          onPress={() => remove(c)}
                          disabled={deletingId === c.id}
                          hitSlop={8}
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
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    ...(Platform.OS === 'web'
      ? ({ position: 'fixed', inset: 0, zIndex: 9999 } as object)
      : {}),
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,15,26,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    zIndex: 2,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  modalGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(100,116,139,0.35)',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  modalTitle: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  scrollBody: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },
  scrollBodyCompact: { paddingHorizontal: 12 },
  form: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  prompt: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  starsRow: { flexDirection: 'row', gap: 4 },
  nameRow: { flexDirection: 'row', gap: 8 },
  nameRowStack: { flexDirection: 'column' },
  nameInput: { flex: 1 },
  nameInputFull: { width: '100%' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 12 : 10,
    fontWeight: '600',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  submitBtn: {
    marginTop: 2,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  listTitle: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  empty: { fontSize: 13, fontWeight: '500', paddingVertical: 10 },
  list: { gap: 8, paddingBottom: 8 },
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
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '800' },
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
