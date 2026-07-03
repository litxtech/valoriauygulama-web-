import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, usePathname, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { LostFoundAccessGate } from '@/components/staff/LostFoundAccessGate';
import { CachedImage } from '@/components/CachedImage';
import {
  daysUntilRetention,
  getLostFoundItem,
  markLostFoundDisposed,
  markLostFoundReturned,
  reopenLostFoundItem,
  updateLostFoundStorage,
  type LostFoundItemRow,
} from '@/lib/lostFound';
import {
  lostFoundCategoryLabel,
  lostFoundLocationLabel,
  lostFoundStatusLabel,
  lostFoundValueTierLabel,
  LOST_FOUND_STATUS_COLOR,
} from '@/lib/lostFoundCatalog';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

const { width: SCREEN_W } = Dimensions.get('window');

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function LostFoundDetailScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/lost-found' : '/staff/lost-found';
  const { id } = useLocalSearchParams<{ id: string }>();
  const locale = (i18n.language || 'tr').split('-')[0];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ),
    });
  }, [navigation, isAdminRoute, base, t]);

  const [item, setItem] = useState<LostFoundItemRow | null>(null);
  const [storageEdit, setStorageEdit] = useState('');
  const [savingStorage, setSavingStorage] = useState(false);
  const [returnModal, setReturnModal] = useState(false);
  const [returnName, setReturnName] = useState('');
  const [returnPhone, setReturnPhone] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [disposeModal, setDisposeModal] = useState(false);
  const [disposeNote, setDisposeNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return null;
    const res = await getLostFoundItem(id);
    return res.data;
  }, [id]);

  const {
    data: cachedItem,
    loading,
    reload,
    showContent,
  } = useCachedFocusLoad({
    cacheKey: id ? `lost-found-detail:${id}` : 'lost-found-detail:none',
    enabled: !!id,
    fetchData,
  });

  useEffect(() => {
    setItem(cachedItem);
    if (cachedItem) setStorageEdit(cachedItem.storage_location ?? '');
  }, [cachedItem]);

  const load = reload;

  const saveStorage = async () => {
    if (!id) return;
    setSavingStorage(true);
    const { error } = await updateLostFoundStorage(id, storageEdit);
    setSavingStorage(false);
    if (error) Alert.alert(t('error'), error);
    else {
      Alert.alert(t('lfUpdated'), t('lfStorageSaved'));
      load();
    }
  };

  const confirmReturn = async () => {
    if (!id || !returnName.trim()) {
      Alert.alert(t('error'), t('lfErrReturnName'));
      return;
    }
    setActionLoading(true);
    const { error } = await markLostFoundReturned(id, {
      returnedToName: returnName,
      returnedToPhone: returnPhone,
      returnNote,
    });
    setActionLoading(false);
    if (error) Alert.alert(t('error'), error);
    else {
      setReturnModal(false);
      load();
    }
  };

  const confirmDispose = async () => {
    if (!id) return;
    setActionLoading(true);
    const { error } = await markLostFoundDisposed(id, disposeNote);
    setActionLoading(false);
    if (error) Alert.alert(t('error'), error);
    else {
      setDisposeModal(false);
      load();
    }
  };

  const confirmReopen = () => {
    if (!id) return;
    Alert.alert(t('lfReopenTitle'), t('lfReopenBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('lfReopenConfirm'),
        onPress: async () => {
          setActionLoading(true);
          const { error } = await reopenLostFoundItem(id);
          setActionLoading(false);
          if (error) Alert.alert(t('error'), error);
          else load();
        },
      },
    ]);
  };

  if (!showContent && !item) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: theme.colors.textMuted }}>{t('error')}</Text>
      </View>
    );
  }

  const photos = item.photos ?? [];
  const daysLeft = item.status === 'stored' ? daysUntilRetention(item.retention_until) : null;
  const statusColor = LOST_FOUND_STATUS_COLOR[item.status];

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.ref}>{item.reference_code}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{lostFoundStatusLabel(t, item.status)}</Text>
          </View>
        </View>

        <Text style={styles.title}>{item.title}</Text>
        {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

        {photos.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gallery}>
            {photos.map((p) => (
              <TouchableOpacity key={p.id} onPress={() => setPreviewUrl(p.public_url)}>
                <CachedImage uri={p.public_url} style={styles.galleryImg} contentFit="cover" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.metaCard}>
          <MetaRow label={t('lfFieldCategory')} value={lostFoundCategoryLabel(t, item.category)} />
          <MetaRow label={t('lfFieldValue')} value={lostFoundValueTierLabel(t, item.value_tier)} />
          <MetaRow label={t('lfFieldFoundWhere')} value={lostFoundLocationLabel(t, item.found_location_type)} />
          {item.room?.room_number ? <MetaRow label={t('lfFieldRoom')} value={item.room.room_number} /> : null}
          {item.found_location_detail ? (
            <MetaRow label={t('lfFieldLocationDetail')} value={item.found_location_detail} />
          ) : null}
          <MetaRow label={t('lfFoundAt')} value={formatDateTime(item.found_at, locale)} />
          <MetaRow label={t('lfRegisteredBy')} value={item.registrar?.full_name ?? '—'} />
          {item.status === 'stored' ? (
            <MetaRow
              label={t('lfRetentionUntil')}
              value={`${item.retention_until}${daysLeft !== null ? ` (${daysLeft <= 0 ? t('lfRetentionExpired') : t('lfRetentionDays', { days: daysLeft })})` : ''}`}
              highlight={daysLeft !== null && daysLeft <= 7}
            />
          ) : null}
        </View>

        {item.status === 'returned' ? (
          <View style={styles.metaCard}>
            <Text style={styles.cardHeading}>{t('lfReturnSection')}</Text>
            <MetaRow label={t('lfReturnedTo')} value={item.returned_to_name ?? '—'} />
            {item.returned_to_phone ? <MetaRow label={t('lfPhone')} value={item.returned_to_phone} /> : null}
            <MetaRow label={t('lfReturnedAt')} value={formatDateTime(item.returned_at, locale)} />
            {item.return_note ? <MetaRow label={t('lfNote')} value={item.return_note} /> : null}
          </View>
        ) : null}

        {item.status === 'disposed' ? (
          <View style={styles.metaCard}>
            <Text style={styles.cardHeading}>{t('lfDisposeSection')}</Text>
            <MetaRow label={t('lfDisposedAt')} value={formatDateTime(item.disposed_at, locale)} />
            {item.dispose_note ? <MetaRow label={t('lfNote')} value={item.dispose_note} /> : null}
          </View>
        ) : null}

        {item.status === 'stored' ? (
          <>
            <Text style={styles.sectionLabel}>{t('lfFieldStorage')}</Text>
            <TextInput
              style={styles.input}
              value={storageEdit}
              onChangeText={setStorageEdit}
              placeholder={t('lfFieldStoragePh')}
              placeholderTextColor={theme.colors.textMuted}
            />
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={saveStorage}
              disabled={savingStorage}
            >
              {savingStorage ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <Text style={styles.secondaryBtnText}>{t('lfSaveStorage')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.primaryBtn} onPress={() => setReturnModal(true)}>
              <Ionicons name="hand-left-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('lfMarkReturned')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.warnBtn} onPress={() => setDisposeModal(true)}>
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text style={styles.warnBtnText}>{t('lfMarkDisposed')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={styles.secondaryBtn} onPress={confirmReopen} disabled={actionLoading}>
            <Text style={styles.secondaryBtnText}>{t('lfReopenStored')}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={!!previewUrl} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <Pressable style={styles.previewBackdrop} onPress={() => setPreviewUrl(null)}>
          {previewUrl ? (
            <CachedImage uri={previewUrl} style={styles.previewImg} contentFit="contain" />
          ) : null}
        </Pressable>
      </Modal>

      <Modal visible={returnModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('lfMarkReturned')}</Text>
            <TextInput
              style={styles.input}
              value={returnName}
              onChangeText={setReturnName}
              placeholder={t('lfReturnedToPh')}
              placeholderTextColor={theme.colors.textMuted}
            />
            <TextInput
              style={[styles.input, { marginTop: 10 }]}
              value={returnPhone}
              onChangeText={setReturnPhone}
              placeholder={t('lfPhonePh')}
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
            />
            <TextInput
              style={[styles.input, styles.textArea, { marginTop: 10 }]}
              value={returnNote}
              onChangeText={setReturnNote}
              placeholder={t('lfNotePh')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setReturnModal(false)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalOk} onPress={confirmReturn} disabled={actionLoading}>
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalOkText}>{t('lfConfirmReturn')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={disposeModal} transparent animationType="slide">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>{t('lfMarkDisposed')}</Text>
            <Text style={styles.modalHint}>{t('lfDisposeHint')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={disposeNote}
              onChangeText={setDisposeNote}
              placeholder={t('lfDisposeNotePh')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setDisposeModal(false)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalOk, styles.modalOkDanger]} onPress={confirmDispose} disabled={actionLoading}>
                {actionLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalOkText}>{t('lfConfirmDispose')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MetaRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, highlight && styles.metaHighlight]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 40 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ref: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text, marginTop: 12 },
  desc: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 8, lineHeight: 22 },
  gallery: { marginTop: 16, maxHeight: 120 },
  galleryImg: { width: 110, height: 110, borderRadius: 12, marginRight: 10 },
  metaCard: {
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardHeading: { fontSize: 15, fontWeight: '600', color: theme.colors.text, marginBottom: 10 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, gap: 12 },
  metaLabel: { fontSize: 13, color: theme.colors.textMuted, flex: 1 },
  metaValue: { fontSize: 14, color: theme.colors.text, fontWeight: '500', flex: 1.2, textAlign: 'right' },
  metaHighlight: { color: theme.colors.error, fontWeight: '600' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 20, marginBottom: 8 },
  input: {
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 20,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  warnBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    marginTop: 10,
    borderWidth: 1,
    borderColor: theme.colors.error,
  },
  warnBtnText: { color: theme.colors.error, fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.card,
  },
  secondaryBtnText: { color: theme.colors.primary, fontWeight: '600', fontSize: 15 },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImg: { width: SCREEN_W - 32, height: SCREEN_W - 32 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: theme.colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 12 },
  modalHint: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 12, lineHeight: 20 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.background,
  },
  modalCancelText: { color: theme.colors.textSecondary, fontWeight: '600' },
  modalOk: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  modalOkDanger: { backgroundColor: theme.colors.error },
  modalOkText: { color: '#fff', fontWeight: '600' },
});

export default function LostFoundDetailRoute() {
  return (
    <LostFoundAccessGate>
      <LostFoundDetailScreen />
    </LostFoundAccessGate>
  );
}
