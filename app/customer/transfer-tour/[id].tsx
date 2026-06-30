import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Switch,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import {
  type TransferServiceRow,
  serviceRowFromDb,
  pickLocalizedString,
  parseRoutes,
  type I18nJson,
  type FeatureKey,
} from '@/lib/transferTour';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { useAuthStore } from '@/stores/authStore';
import { notifyTransferTourStaffAndAdmins } from '@/lib/transferTourNotify';

const FEATURE_TO_KEY: { k: FeatureKey; labelKey: string }[] = [
  { k: 'air_conditioning', labelKey: 'transferTourFeatureAc' },
  { k: 'wifi', labelKey: 'transferTourFeatureWifi' },
  { k: 'child_seat', labelKey: 'transferTourFeatureChildSeat' },
  { k: 'driver_included', labelKey: 'transferTourFeatureDriver' },
  { k: 'non_smoking', labelKey: 'transferTourFeatureNonSmoking' },
  { k: 'vip', labelKey: 'transferTourFeatureVip' },
  { k: 'luggage', labelKey: 'transferTourFeatureLuggage' },
];

export default function CustomerTransferTourDetail() {
  const { id, request } = useLocalSearchParams<{ id: string; request?: string }>();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { user } = useAuthStore();

  const [svc, setSvc] = useState<TransferServiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [timeStr, setTimeStr] = useState('10:00');
  const [passengerCount, setPassengerCount] = useState('2');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [childSeat, setChildSeat] = useState(false);
  const [luggageCount, setLuggageCount] = useState('0');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  /** Android: Modal içinde pencere küçülmediği için klavye yüksekliği kadar alt boşluk — form yukarı kaydırılabilsin. */
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);
  const requestFormScrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('transfer_services').select('*').eq('id', id).eq('is_active', true).maybeSingle();
    if (error || !data) {
      setSvc(null);
      setLoading(false);
      return;
    }
    const o = data as Record<string, unknown>;
    const routes = parseRoutes(o.routes);
    setSvc(serviceRowFromDb({ ...o, routes }));
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (request === '1' || request === 'true') setFormOpen(true);
  }, [request]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !formOpen) {
      setAndroidKeyboardInset(0);
      return;
    }
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardInset(0);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [formOpen]);

  useEffect(() => {
    (async () => {
      if (!user?.email) return;
      const g = await getOrCreateGuestForCurrentSession();
      if (g) {
        const { data: row } = await supabase
          .from('guests')
          .select('phone, room_id, full_name')
          .eq('id', g.guest_id)
          .maybeSingle();
        if (row?.phone) setPhone(row.phone);
        if (row?.room_id) {
          const { data: room } = await supabase.from('rooms').select('room_number').eq('id', row.room_id).maybeSingle();
          if (room?.room_number) setRoomNumber(String(room.room_number));
        }
        const full = (row as { full_name?: string | null })?.full_name?.trim();
        if (full) {
          const i = full.indexOf(' ');
          if (i > 0) {
            setFirstName(full.slice(0, i).trim());
            setLastName(full.slice(i + 1).trim());
          } else {
            setFirstName(full);
            setLastName('');
          }
        }
      }
    })();
  }, [user?.email]);

  const title = useMemo(() => pickLocalizedString(svc?.title as I18nJson, lang, t('transferTourNavTitle')), [svc, lang, t]);
  const desc = useMemo(() => pickLocalizedString(svc?.description as I18nJson, lang, ''), [svc, lang]);
  const images = useMemo(() => {
    if (!svc) return [] as string[];
    const im = (svc.images ?? []).filter(Boolean);
    if (svc.cover_image && im.includes(svc.cover_image)) return [svc.cover_image, ...im.filter((u) => u !== svc.cover_image)];
    if (svc.cover_image) return [svc.cover_image, ...im].slice(0, 10);
    return im.slice(0, 10);
  }, [svc]);

  const onSubmit = async () => {
    if (!svc) return;
    const fn = firstName.trim();
    const ln = lastName.trim();
    if (!fn || !ln) {
      Alert.alert(t('error'), t('transferTourNameBothRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const g = await getOrCreateGuestForCurrentSession();
      if (!g?.guest_id) {
        Alert.alert(t('error'), t('transferTourRequestError'));
        return;
      }
      const { data: gRow } = await supabase.from('guests').select('full_name, phone, organization_id').eq('id', g.guest_id).single();
      const orgId = (gRow as { organization_id?: string | null })?.organization_id;
      const { data: oRow } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', 'valoria')
        .maybeSingle();
      const org = orgId ?? oRow?.id;
      if (!org) {
        Alert.alert(t('error'), t('transferTourRequestError'));
        return;
      }
      const guestNameForRequest = `${fn} ${ln}`.trim();
      const ins = await supabase.from('transfer_service_requests').insert({
        organization_id: org,
        service_id: svc.id,
        guest_id: g.guest_id,
        guest_name: guestNameForRequest,
        room_number: roomNumber.trim() || null,
        request_date: dateStr,
        request_time: timeStr,
        passenger_count: Math.max(1, parseInt(passengerCount, 10) || 1),
        pickup_location: t('transferTourGuestRequestPickupDefault'),
        dropoff_location: t('transferTourGuestRequestDropoffDefault'),
        phone: phone.trim() || (gRow as { phone?: string })?.phone || null,
        note: note.trim() || null,
        child_seat_requested: childSeat,
        luggage_count: Math.max(0, parseInt(luggageCount, 10) || 0),
        status: 'pending',
        offer_currency: svc.currency,
      });
      if (ins.error) {
        Alert.alert(t('error'), ins.error.message);
        return;
      }
      setFormOpen(false);
      Alert.alert(t('success'), t('transferTourRequestSent'));
      const staffTitle = t('transferTourNotifyNewRequest');
      await notifyTransferTourStaffAndAdmins({
        organizationId: org,
        title: staffTitle,
        body: title,
        data: { serviceId: svc.id, kind: 'transfer_tour_new' },
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !svc) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.muted}>{t('loading')}</Text>
      </View>
    );
  }

  const route0 = svc.routes[0];
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.backgroundSecondary }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 12 }}>
        <ScrollView horizontal pagingEnabled style={{ maxHeight: 300 }} showsHorizontalScrollIndicator={false}>
          {images.length ? (
            images.map((uri, index) => (
              <TouchableOpacity
                key={`${index}-${uri}`}
                activeOpacity={0.92}
                onPress={() => {
                  setGalleryIndex(index);
                  setGalleryOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('transferTourGallery')}
              >
                <CachedImage uri={uri} style={{ width, height: 280 }} contentFit="cover" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={[styles.ph, { width }]}> 
              <Ionicons name="image-outline" size={48} color={theme.colors.textMuted} />
            </View>
          )}
        </ScrollView>

        <View style={styles.body}>
          {svc.tour_operator_name || svc.tour_operator_logo ? (
            <View style={styles.operatorBlock}>
              {svc.tour_operator_logo ? (
                <CachedImage uri={svc.tour_operator_logo} style={styles.operatorLogo} contentFit="cover" />
              ) : (
                <View style={[styles.operatorLogo, styles.operatorLogoPh]}>
                  <Ionicons name="business-outline" size={28} color={theme.colors.textMuted} />
                </View>
              )}
              <View style={styles.operatorTextCol}>
                <Text style={styles.operatorLabel}>{t('transferTourDetailOperator')}</Text>
                <Text style={styles.operatorName}>
                  {svc.tour_operator_name?.trim() || title}
                </Text>
                {svc.map_address ? (
                  <Text style={styles.operatorAddr} numberOfLines={2}>
                    {svc.map_address}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {svc.brand || svc.model ? (
            <Text style={styles.sub}>
              {[svc.brand, svc.model, svc.year].filter((x) => x != null && x !== '').join(' · ')}
            </Text>
          ) : null}
          {desc ? <Text style={styles.desc}>{desc}</Text> : null}

          <View style={styles.grid}>
            <View style={styles.cell}>
              <Text style={styles.cellL}>{t('transferTourPassengers', { n: svc.capacity })}</Text>
            </View>
            <View style={styles.cell}>
              <Text style={styles.cellL}>{t('transferTourLuggage', { n: svc.luggage_capacity })}</Text>
            </View>
          </View>

          <View style={styles.block}>
            <Text style={styles.h3}>{t('transferTourDeliveryInfoTitle')}</Text>
            {route0?.distance_km != null ? (
              <Text style={styles.muted2}>
                {t('transferTourEstDistance')}: {t('transferTourEstKm', { n: route0.distance_km })}
              </Text>
            ) : null}
            {route0?.duration_min != null ? (
              <Text style={styles.muted2}>
                {t('transferTourEstDuration')}: {t('transferTourEstMin', { n: route0.duration_min })}
              </Text>
            ) : null}
          </View>

          <Text style={styles.h3}>{t('transferTourFeatures')}</Text>
          <View style={styles.featRow}>
            {FEATURE_TO_KEY.filter((f) => (svc.features ?? []).includes(f.k)).map((f) => (
              <View key={f.k} style={styles.featChip}>
                <Text style={styles.featChipT}>{t(f.labelKey)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.fab, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.fabBtn} onPress={() => setFormOpen(true)} activeOpacity={0.9}>
          <Text style={styles.fabT}>{t('transferTourRequest')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={formOpen} animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalKavRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <View style={styles.modalOverlayFill}>
            <View style={[styles.modalSheet, { marginTop: insets.top + 4 }]}>
              <View style={styles.modalHead}>
                <Text style={styles.modalTitle}>{t('transferTourRequestTitle')}</Text>
                <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={12} accessibilityLabel={t('close')}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                ref={requestFormScrollRef}
                style={styles.modalBodyScroll}
                contentContainerStyle={[
                  styles.modalScrollContent,
                  {
                    flexGrow: 1,
                    paddingBottom:
                      Math.max(insets.bottom, 20) + 8 + (Platform.OS === 'android' ? androidKeyboardInset : 0),
                  },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="none"
                showsVerticalScrollIndicator
              >
                <Labeled value={firstName} onChangeText={setFirstName} label={t('transferTourFieldFirstName')} autoCapitalize="words" />
                <Labeled value={lastName} onChangeText={setLastName} label={t('transferTourFieldLastName')} autoCapitalize="words" />
                <Labeled value={dateStr} onChangeText={setDateStr} label={t('transferTourFieldDate')} />
                <Labeled value={timeStr} onChangeText={setTimeStr} label={t('transferTourFieldTime')} />
                <Labeled
                  value={passengerCount}
                  onChangeText={setPassengerCount}
                  label={t('transferTourFieldPassengers')}
                  keyboard="numeric"
                />
                <Labeled value={roomNumber} onChangeText={setRoomNumber} label={t('transferTourFieldRoom')} />
                <Labeled value={phone} onChangeText={setPhone} label={t('transferTourFieldPhone')} keyboard="phone-pad" />
                <Labeled value={luggageCount} onChangeText={setLuggageCount} label={t('transferTourFieldLuggageCount')} keyboard="numeric" />
                <View style={styles.swRow}>
                  <Text style={styles.swL}>{t('transferTourFieldChildSeat')}</Text>
                  <Switch value={childSeat} onValueChange={setChildSeat} />
                </View>
                <NoteField
                  label={t('transferTourFieldNote')}
                  value={note}
                  onChangeText={setNote}
                  onFocus={() => {
                    if (Platform.OS !== 'android') return;
                    setTimeout(() => {
                      requestFormScrollRef.current?.scrollToEnd({ animated: true });
                    }, 200);
                  }}
                />
                <TouchableOpacity
                  style={[styles.fabBtn, { marginTop: 8, marginBottom: 4 }]}
                  onPress={onSubmit}
                  disabled={submitting}
                >
                  {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.fabT}>{t('submit')}</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <BreakfastPhotoLightbox
        visible={galleryOpen}
        urls={images}
        initialIndex={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        accentColor="#fff"
      />
    </View>
  );
}

function Labeled({
  label,
  value,
  onChangeText,
  multiline,
  keyboard,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  multiline?: boolean;
  keyboard?: 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  return (
    <View>
      <Text style={styles.l}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.in, multiline && { minHeight: 120, textAlignVertical: 'top' }]}
        multiline={multiline}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        autoCorrect={!!multiline}
      />
    </View>
  );
}

/** Ayrı bileşen: çok satırlı not; Android’de klavye açılınca üst ScrollView scrollToEnd ile görünür kalsın */
function NoteField({
  label,
  value,
  onChangeText,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  onFocus?: () => void;
}) {
  return (
    <View>
      <Text style={styles.l}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholderTextColor={theme.colors.textMuted}
        style={[styles.in, { minHeight: 120, textAlignVertical: 'top' }]}
        multiline
        blurOnSubmit={false}
        autoCorrect
        autoCapitalize="sentences"
        importantForAutofill="no"
        scrollEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { marginTop: 8, color: theme.colors.textMuted },
  ph: { height: 280, backgroundColor: theme.colors.backgroundSecondary, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 20 },
  operatorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
    padding: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  operatorLogo: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.backgroundSecondary },
  operatorLogoPh: { alignItems: 'center', justifyContent: 'center' },
  operatorTextCol: { flex: 1, minWidth: 0 },
  operatorLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, textTransform: 'uppercase' },
  operatorName: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginTop: 2 },
  operatorAddr: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  title: { fontSize: 24, fontWeight: '800', color: theme.colors.text },
  sub: { marginTop: 4, color: theme.colors.textSecondary, fontSize: 15 },
  desc: { marginTop: 12, lineHeight: 22, color: theme.colors.text, fontSize: 15 },
  grid: { flexDirection: 'row', gap: 12, marginTop: 16 },
  cell: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.colors.borderLight },
  cellL: { fontSize: 14, fontWeight: '600' },
  block: { marginTop: 20 },
  h3: { fontSize: 13, fontWeight: '700', color: theme.colors.textMuted, marginTop: 8, textTransform: 'uppercase' },
  p: { fontSize: 16, color: theme.colors.text, marginTop: 2 },
  muted2: { color: theme.colors.textSecondary, marginTop: 6, fontSize: 14 },
  featRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  featChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight },
  featChipT: { fontSize: 13, fontWeight: '600' },
  fab: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, backgroundColor: 'rgba(255,255,255,0.95)' },
  fabBtn: { backgroundColor: theme.colors.primary, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  fabT: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalKavRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  /** Klavye açılınca da listenin tamamı kaydırılabilsin: tek sütun, flex zinciri, sabit maxHeight yok */
  modalOverlayFill: { flex: 1 },
  modalSheet: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  modalBodyScroll: { flex: 1 },
  modalScrollContent: { gap: 10 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  l: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 4 },
  in: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, padding: 12, fontSize: 16, color: theme.colors.text, backgroundColor: theme.colors.backgroundSecondary },
  swRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  swL: { fontSize: 16, fontWeight: '600' },
  modalHint: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 4 },
});
