import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Switch,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  createOnlineBooking,
  getBookableRoom,
  nightsBetween,
  roomPublicTitle,
  trackBookingEvent,
  type BookableRoom,
  type OnlineBookingExtras,
} from '@/lib/onlineBooking';
import { finalizeBookingWithAutoLogin } from '@/lib/finalizeBookingWithAutoLogin';

const C = {
  bg: '#f4f2ee',
  ink: '#0b1220',
  muted: '#667085',
  line: 'rgba(11,18,32,0.08)',
  card: '#ffffff',
  accent: '#0f766e',
  soft: '#ecfdf5',
};

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

function paramOne(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0] ?? '';
  return '';
}

export default function BookingRoomScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    id?: string | string[];
    checkIn?: string | string[];
    checkOut?: string | string[];
    adults?: string | string[];
    children?: string | string[];
  }>();

  const roomId = paramOne(params.id);
  const checkIn = paramOne(params.checkIn);
  const checkOut = paramOne(params.checkOut);
  const adults = Math.max(1, Number(paramOne(params.adults) || 1) || 1);
  const childrenCount = Math.max(0, Number(paramOne(params.children) || 0) || 0);
  const nights = nightsBetween(checkIn, checkOut);

  const [room, setRoom] = useState<BookableRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [extras, setExtras] = useState<OnlineBookingExtras>({
    transfer: false,
    breakfast: false,
    parking: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const row = await getBookableRoom(roomId);
        if (!cancelled) {
          setRoom(row);
          if (row) {
            void trackBookingEvent('form_start', { roomId: row.id, capacityLabel: row.capacity_label });
          }
        }
      } catch {
        if (!cancelled) setRoom(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const total = useMemo(() => {
    if (!room?.price_per_night || nights < 1) return null;
    return room.price_per_night * nights;
  }, [room, nights]);

  const images = room?.image_urls?.length
    ? room.image_urls
    : room?.cover_image_url
      ? [room.cover_image_url]
      : [];

  const submit = async () => {
    if (!room || nights < 1) return;
    if (name.trim().length < 2) {
      Alert.alert(t('bookingInvalid'), t('bookingNameRequired'));
      return;
    }
    if (phone.trim().length < 7) {
      Alert.alert(t('bookingInvalid'), t('bookingPhoneRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const source = Platform.OS === 'web' ? 'web' : 'lobby';
      const id = await createOnlineBooking({
        roomId: room.id,
        checkIn,
        checkOut,
        adults,
        children: childrenCount,
        guestFullName: name,
        guestPhone: phone,
        guestEmail: email,
        guestNote: note,
        extras,
        source,
      });
      void trackBookingEvent('form_submit', {
        roomId: room.id,
        bookingId: id,
        capacityLabel: room.capacity_label,
        source,
      });

      const result = await finalizeBookingWithAutoLogin({
        bookingId: id,
        capacityLabel: room.capacity_label,
        displayTitle: room.display_title,
        checkIn,
        checkOut,
        nights,
        adults,
        children: childrenCount,
        guestFullName: name,
        guestPhone: phone,
        guestEmail: email,
        extras,
        quotedTotal: total,
        quotedPerNight: room.price_per_night,
        router,
      });

      if (!result.ok) {
        router.replace({ pathname: '/booking/success', params: { id } });
      }
    } catch (e) {
      Alert.alert(t('bookingInvalid'), (e as Error)?.message || t('bookingSubmitError'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>{t('bookingRoomMissing')}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.replace('/booking')} activeOpacity={0.88}>
          <Text style={styles.primaryBtnText}>{t('bookingBackToRooms')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {images[0] ? (
          <Image source={{ uri: images[0] }} style={styles.heroImage} />
        ) : (
          <View style={styles.heroFallback}>
            <Ionicons name="bed-outline" size={42} color="rgba(255,255,255,0.75)" />
          </View>
        )}

        <View style={styles.body}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={20} color={C.ink} />
            <Text style={styles.backText}>{t('bookingBack')}</Text>
          </TouchableOpacity>

          <Text style={styles.stepChip}>{t('bookingStep3')}</Text>
          <Text style={styles.title}>{roomPublicTitle(room)}</Text>
          <Text style={styles.subtitle}>
            {checkIn} → {checkOut} · {t('bookingNights', { count: nights })} · {adults} {t('bookingAdults').toLowerCase()}
            {childrenCount > 0 ? ` · ${childrenCount} ${t('bookingChildren').toLowerCase()}` : ''}
          </Text>

          <Text style={styles.autoLoginHint}>{t('bookingAutoLoginHint')}</Text>

          {room.description ? <Text style={styles.description}>{room.description}</Text> : null}

          {images.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
              {images.slice(1).map((uri) => (
                <Image key={uri} source={{ uri }} style={styles.thumb} />
              ))}
            </ScrollView>
          ) : null}

          <View style={styles.summaryCard}>
            <Text style={styles.summaryPrice}>{money(room.price_per_night)}</Text>
            <Text style={styles.summaryHint}>{t('bookingPerNight')}</Text>
            {total != null ? (
              <Text style={styles.summaryTotal}>{t('bookingStayTotal', { total: money(total) })}</Text>
            ) : null}
          </View>

          <Text style={styles.section}>{t('bookingExtras')}</Text>
          {(
            [
              ['transfer', t('bookingExtraTransfer')],
              ['breakfast', t('bookingExtraBreakfast')],
              ['parking', t('bookingExtraParking')],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.extraRow}>
              <Text style={styles.extraLabel}>{label}</Text>
              <Switch
                value={!!extras[key]}
                onValueChange={(v) => setExtras((prev) => ({ ...prev, [key]: v }))}
                trackColor={{ false: '#e5e7eb', true: '#99f6e4' }}
                thumbColor={extras[key] ? C.accent : '#f9fafb'}
              />
            </View>
          ))}

          <Text style={styles.section}>{t('bookingGuestDetails')}</Text>
          <Text style={styles.fieldLabel}>{t('bookingFullName')}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholderTextColor="#98a2b3" />
          <Text style={styles.fieldLabel}>{t('bookingPhone')}</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholderTextColor="#98a2b3" />
          <Text style={styles.fieldLabel}>{t('bookingEmail')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#98a2b3" />
          <Text style={styles.fieldLabel}>{t('bookingNote')}</Text>
          <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote} multiline placeholderTextColor="#98a2b3" />

          <TouchableOpacity
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            onPress={() => void submit()}
            disabled={submitting || nights < 1}
            activeOpacity={0.88}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{t('bookingConfirm')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  heroImage: { width: '100%', height: 240, backgroundColor: '#0f172a' },
  heroFallback: { width: '100%', height: 200, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 22, marginTop: -18 },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: C.line, marginBottom: 16,
  },
  backText: { fontSize: 14, fontWeight: '700', color: C.ink },
  stepChip: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.accent, backgroundColor: C.soft,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 10,
  },
  title: { fontSize: 28, fontWeight: '900', color: C.ink, marginBottom: 8 },
  subtitle: { fontSize: 14, fontWeight: '600', color: C.muted, marginBottom: 12, lineHeight: 20 },
  autoLoginHint: {
    fontSize: 13,
    fontWeight: '600',
    color: C.accent,
    backgroundColor: C.soft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  description: { fontSize: 15, fontWeight: '500', color: C.ink, lineHeight: 22, marginBottom: 14 },
  thumbs: { gap: 10, paddingBottom: 8 },
  thumb: { width: 110, height: 78, borderRadius: 14, backgroundColor: '#e5e7eb' },
  summaryCard: { backgroundColor: '#0f172a', borderRadius: 22, padding: 20, marginBottom: 24, marginTop: 8 },
  summaryPrice: { fontSize: 28, fontWeight: '800', color: '#5eead4' },
  summaryHint: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  summaryTotal: { marginTop: 12, fontSize: 15, fontWeight: '700', color: '#fff' },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 12, marginTop: 4 },
  extraRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.line, marginBottom: 10,
  },
  extraLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, fontWeight: '600',
    color: C.ink, backgroundColor: C.card, marginBottom: 4,
  },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: {
    marginTop: 22, backgroundColor: C.ink, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  errorText: { color: '#b42318', fontWeight: '700', textAlign: 'center' },
});
