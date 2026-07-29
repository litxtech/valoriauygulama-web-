import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  addDaysIso,
  listBookableRooms,
  nightsBetween,
  roomPublicTitle,
  todayIso,
  trackBookingEvent,
  type BookableRoom,
} from '@/lib/onlineBooking';
import { supabase } from '@/lib/supabase';

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

export default function BookingHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  const [rooms, setRooms] = useState<BookableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(todayIso);
  const [checkOut, setCheckOut] = useState(() => addDaysIso(todayIso(), 1));
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const datesOk = nights >= 1;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRooms(await listBookableRooms());
    } catch (e) {
      setError((e as Error)?.message || t('bookingLoadError'));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    void trackBookingEvent('page_view');
    const channel = supabase
      .channel('booking-rooms-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        void load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_images' }, () => {
        void load();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const openRoom = (room: BookableRoom) => {
    if (!datesOk) return;
    void trackBookingEvent('room_view', { roomId: room.id, capacityLabel: room.capacity_label });
    router.push({
      pathname: '/booking/[id]',
      params: {
        id: room.id,
        checkIn,
        checkOut,
        adults: String(adults),
        children: String(children),
      },
    });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40, maxWidth: wide ? 920 : undefined }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            activeOpacity={0.85}
          >
            <Ionicons name="chevron-back" size={22} color={C.ink} />
          </TouchableOpacity>
          <Text style={styles.brand}>Valoria</Text>
          <View style={{ width: 40 }} />
        </View>

        <Text style={styles.stepChip}>{t('bookingStep1')}</Text>
        <Text style={styles.title}>{t('bookingTitle')}</Text>
        <Text style={styles.subtitle}>{t('bookingSubtitleClear')}</Text>

        <View style={styles.searchCard}>
          <Text style={styles.cardTitle}>{t('bookingWhenWho')}</Text>
          <View style={styles.fieldRow}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('bookingCheckIn')}</Text>
              <TextInput style={styles.input} value={checkIn} onChangeText={setCheckIn} placeholder="YYYY-MM-DD" placeholderTextColor="#98a2b3" autoCapitalize="none" />
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('bookingCheckOut')}</Text>
              <TextInput style={styles.input} value={checkOut} onChangeText={setCheckOut} placeholder="YYYY-MM-DD" placeholderTextColor="#98a2b3" autoCapitalize="none" />
            </View>
          </View>
          <View style={styles.fieldRow}>
            <Stepper label={t('bookingAdults')} value={adults} min={1} max={12} onChange={setAdults} />
            <Stepper label={t('bookingChildren')} value={children} min={0} max={12} onChange={setChildren} />
          </View>
          <View style={[styles.statusPill, datesOk ? styles.statusOk : styles.statusBad]}>
            <Ionicons name={datesOk ? 'checkmark-circle' : 'alert-circle'} size={16} color={datesOk ? C.accent : '#b42318'} />
            <Text style={[styles.statusText, !datesOk && { color: '#b42318' }]}>
              {datesOk ? t('bookingNights', { count: nights }) : t('bookingDatesInvalid')}
            </Text>
          </View>
        </View>

        <Text style={styles.stepChip}>{t('bookingStep2')}</Text>
        <Text style={styles.sectionTitle}>{t('bookingPickRoom')}</Text>

        {loading ? (
          <View style={styles.centered}><ActivityIndicator color={C.accent} /></View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void load()} activeOpacity={0.85}>
              <Text style={styles.retryText}>{t('retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : rooms.length === 0 ? (
          <Text style={styles.empty}>{t('bookingRoomsEmpty')}</Text>
        ) : (
          <View style={[styles.grid, wide && styles.gridWide]}>
            {rooms.map((room) => {
              const total = room.price_per_night != null && datesOk ? room.price_per_night * nights : null;
              return (
                <TouchableOpacity
                  key={room.id}
                  style={[styles.roomCard, wide && styles.roomCardWide, !datesOk && styles.roomDisabled]}
                  onPress={() => openRoom(room)}
                  activeOpacity={0.92}
                  disabled={!datesOk}
                >
                  {room.cover_image_url ? (
                    <Image source={{ uri: room.cover_image_url }} style={styles.cover} />
                  ) : (
                    <View style={styles.coverFallback}>
                      <Ionicons name="bed-outline" size={36} color="rgba(255,255,255,0.7)" />
                    </View>
                  )}
                  <View style={styles.roomBody}>
                    <Text style={styles.roomTitle}>{roomPublicTitle(room)}</Text>
                    <Text style={styles.roomMeta} numberOfLines={2}>
                      {[
                        room.max_guests != null ? t('bookingMaxGuests', { n: room.max_guests }) : null,
                        room.bed_type,
                        room.view_type,
                        room.area_sqm != null ? t('bookingSqm', { n: room.area_sqm }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || t('bookingRoomReady')}
                    </Text>
                    <View style={styles.priceRow}>
                      <View>
                        <Text style={styles.price}>{money(room.price_per_night)}</Text>
                        <Text style={styles.priceHint}>{t('bookingPerNight')}</Text>
                      </View>
                      <View style={styles.ctaChip}>
                        <Text style={styles.ctaText}>{t('bookingContinue')}</Text>
                        <Ionicons name="arrow-forward" size={14} color="#fff" />
                      </View>
                    </View>
                    {total != null ? (
                      <Text style={styles.total}>{t('bookingStayTotal', { total: money(total) })}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={styles.stepperField}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - 1))} activeOpacity={0.85}>
          <Ionicons name="remove" size={18} color={C.ink} />
        </TouchableOpacity>
        <Text style={styles.stepValue}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + 1))} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={C.ink} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 22, alignSelf: 'center', width: '100%' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 22 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line,
  },
  brand: { fontSize: 18, fontWeight: '800', color: C.ink, letterSpacing: 0.4 },
  stepChip: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.accent, backgroundColor: C.soft,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 10,
  },
  title: {
    fontSize: 32, fontWeight: '900', color: C.ink, letterSpacing: Platform.OS === 'android' ? 0 : -0.7,
    lineHeight: 38, marginBottom: 8,
  },
  subtitle: { fontSize: 16, fontWeight: '500', color: C.muted, lineHeight: 24, marginBottom: 22, maxWidth: 440 },
  searchCard: {
    backgroundColor: C.card, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: C.line,
    marginBottom: 28, gap: 14,
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: C.ink },
  fieldRow: { flexDirection: 'row', gap: 12 },
  field: { flex: 1, gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 15, fontWeight: '600',
    color: C.ink, backgroundColor: '#fafaf8',
  },
  stepperField: { flex: 1, gap: 6 },
  stepper: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fafaf8',
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: C.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  stepValue: { fontSize: 16, fontWeight: '800', color: C.ink, minWidth: 24, textAlign: 'center' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
  },
  statusOk: { backgroundColor: C.soft },
  statusBad: { backgroundColor: '#fef3f2' },
  statusText: { fontSize: 13, fontWeight: '700', color: C.accent },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: C.ink, marginBottom: 14 },
  grid: { gap: 14 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  roomCard: {
    backgroundColor: C.card, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: C.line,
  },
  roomCardWide: { width: '48.5%' },
  roomDisabled: { opacity: 0.55 },
  cover: { width: '100%', height: 168, backgroundColor: '#0f172a' },
  coverFallback: {
    width: '100%', height: 168, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center',
  },
  roomBody: { padding: 16, gap: 8 },
  roomTitle: { fontSize: 18, fontWeight: '800', color: C.ink },
  roomMeta: { fontSize: 13, fontWeight: '600', color: C.muted, lineHeight: 18 },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  price: { fontSize: 22, fontWeight: '900', color: C.ink },
  priceHint: { fontSize: 12, fontWeight: '600', color: C.muted },
  ctaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.ink,
    paddingHorizontal: 12, paddingVertical: 9, borderRadius: 999,
  },
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  total: { fontSize: 13, fontWeight: '700', color: C.accent },
  centered: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  errorText: { color: '#b42318', fontWeight: '600', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: C.ink },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: C.muted, fontWeight: '600', paddingVertical: 24 },
});
