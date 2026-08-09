import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  addDaysIso,
  fetchStayOccupancy,
  listBookableRooms,
  listGuestBreakfastForStay,
  nightsBetween,
  todayIso,
  trackBookingEvent,
  type BookableRoom,
  type GuestBreakfastDay,
  type StayOccupancy,
} from '@/lib/onlineBooking';
import { filterAndSortBookableRooms, popularRoomIds } from '@/lib/bookingRoomFilters';
import { formatKbsTrDate, parseKbsDateInputToIso } from '@/lib/kbsDisplayFormat';
import { supabase } from '@/lib/supabase';
import { BookingBreakfastStrip } from '@/components/booking/BookingBreakfastStrip';
import { BookingOccupancyStrip } from '@/components/booking/BookingOccupancyStrip';
import { BookingRoomCard } from '@/components/booking/BookingRoomCard';
import {
  BookingRoomFilters,
  DEFAULT_ROOM_FILTERS,
  type RoomFiltersState,
} from '@/components/booking/BookingRoomFilters';
import { BookingStayDatePicker } from '@/components/booking/BookingStayDatePicker';
import {
  BookingGuestModePicker,
  type BookingGuestMode,
} from '@/components/booking/BookingGuestModePicker';

const C = {
  bg: '#f3f7f5',
  ink: '#0b1220',
  muted: '#64748b',
  line: 'rgba(11,18,32,0.08)',
  card: '#ffffff',
  accent: '#0f766e',
  soft: '#ecfdf5',
};

export default function BookingHomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 760;

  const [rooms, setRooms] = useState<BookableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkInText, setCheckInText] = useState(() => formatKbsTrDate(todayIso()) || '');
  const [checkOutText, setCheckOutText] = useState(
    () => formatKbsTrDate(addDaysIso(todayIso(), 1)) || ''
  );
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [breakfast, setBreakfast] = useState<GuestBreakfastDay[]>([]);
  const [occupancy, setOccupancy] = useState<StayOccupancy | null>(null);
  const [occLoading, setOccLoading] = useState(false);
  const [roomFilters, setRoomFilters] = useState<RoomFiltersState>(DEFAULT_ROOM_FILTERS);
  const [guestMode, setGuestMode] = useState<BookingGuestMode>('solo');

  const checkIn = useMemo(() => parseKbsDateInputToIso(checkInText) || '', [checkInText]);
  const checkOut = useMemo(() => parseKbsDateInputToIso(checkOutText) || '', [checkOutText]);
  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const datesOk = Boolean(checkIn && checkOut && nights >= 1);
  const partySize = adults + children;
  const filteredRooms = useMemo(
    () => filterAndSortBookableRooms(rooms, roomFilters),
    [rooms, roomFilters]
  );
  const popularIds = useMemo(() => popularRoomIds(rooms), [rooms]);
  const availableAmenities = useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) for (const a of r.amenities) set.add(a);
    return [...set];
  }, [rooms]);
  const datesDisplay = useMemo(
    () => ({
      checkIn: formatKbsTrDate(checkIn) || checkInText,
      checkOut: formatKbsTrDate(checkOut) || checkOutText,
    }),
    [checkIn, checkOut, checkInText, checkOutText]
  );
  const availableCount = useMemo(
    () => filteredRooms.filter((r) => r.is_available_for_stay !== false).length,
    [filteredRooms]
  );

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const stay = datesOk ? { checkIn, checkOut } : undefined;
      setRooms(await listBookableRooms(undefined, stay));
    } catch (e) {
      setError((e as Error)?.message || t('bookingLoadError'));
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, [t, datesOk, checkIn, checkOut]);

  const loadOccupancy = useCallback(async () => {
    if (!datesOk) {
      setOccupancy(null);
      return;
    }
    setOccLoading(true);
    try {
      setOccupancy(await fetchStayOccupancy(checkIn, checkOut));
    } catch {
      setOccupancy(null);
    } finally {
      setOccLoading(false);
    }
  }, [datesOk, checkIn, checkOut]);

  useEffect(() => {
    if (!datesOk) {
      setBreakfast([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bf = await listGuestBreakfastForStay(checkIn, checkOut);
        if (!cancelled) setBreakfast(bf);
      } catch {
        if (!cancelled) setBreakfast([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [checkIn, checkOut, datesOk]);

  useEffect(() => {
    void loadRooms();
    void loadOccupancy();
    void trackBookingEvent('page_view');
    const channel = supabase
      .channel('booking-rooms-live-occ')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => {
        void loadRooms();
        void loadOccupancy();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_images' }, () => {
        void loadRooms();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'online_bookings' }, () => {
        void loadRooms();
        void loadOccupancy();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadRooms, loadOccupancy]);

  const openRoom = (room: BookableRoom) => {
    if (!datesOk) {
      Alert.alert(t('bookingPickDatesFirst'), t('bookingSubtitleClear'));
      return;
    }
    if (room.is_available_for_stay === false) {
      Alert.alert(
        t('bookingRoomFullTitle'),
        t('bookingRoomFullBody', {
          checkIn: datesDisplay.checkIn,
          checkOut: datesDisplay.checkOut,
        })
      );
      return;
    }
    void trackBookingEvent('room_view', { roomId: room.id, capacityLabel: room.capacity_label });
    router.push({
      pathname: '/booking/[id]',
      params: {
        id: room.id,
        checkIn,
        checkOut,
        adults: String(adults),
        children: String(children),
        mode: guestMode,
      },
    });
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 56 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient
          colors={
            guestMode === 'student'
              ? ['#0f172a', '#1e293b', '#0f766e']
              : guestMode === 'group'
                ? ['#042f2e', '#115e59', '#0d9488']
                : ['#042f2e', '#0f766e', '#14b8a6']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ width: 40 }} />
          </View>
          <Text style={styles.brand}>Valoria</Text>
          <Text style={styles.heroTitle}>
            {guestMode === 'student'
              ? t('bookingHeroLeadStudent')
              : guestMode === 'group'
                ? t('bookingHeroLeadGroup')
                : t('bookingHeroLead')}
          </Text>
          <Text style={styles.heroSub}>
            {guestMode === 'student'
              ? t('bookingHeroSupportStudent')
              : guestMode === 'group'
                ? t('bookingHeroSupportGroup')
                : t('bookingHeroSupport')}
          </Text>
          <View style={styles.stepTrail}>
            <Text style={styles.stepTrailOn}>1 · {t('bookingStepShortDates')}</Text>
            <Text style={styles.stepTrailSep}>→</Text>
            <Text style={styles.stepTrailOff}>2 · {t('bookingStepShortRoom')}</Text>
            <Text style={styles.stepTrailSep}>→</Text>
            <Text style={styles.stepTrailOff}>3 · {t('bookingStepShortPay')}</Text>
          </View>
        </LinearGradient>

        <View style={[styles.content, wide && styles.contentWide]}>
          <View style={styles.searchCard}>
            <Text style={styles.cardEyebrow}>{t('bookingStep1')}</Text>
            <Text style={styles.cardTitle}>{t('bookingWhenWho')}</Text>
            <Text style={styles.cardHint}>{t('bookingDateHint')}</Text>

            <BookingGuestModePicker value={guestMode} onChange={setGuestMode} />

            {guestMode === 'student' ? (
              <View style={styles.studentBanner}>
                <Ionicons name="school-outline" size={20} color="#92400e" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.studentBannerTitle}>{t('bookingStudentDealTitle')}</Text>
                  <Text style={styles.studentBannerBody}>{t('bookingStudentCardNote')}</Text>
                </View>
              </View>
            ) : null}

            {guestMode === 'group' ? (
              <View style={styles.groupBanner}>
                <Ionicons name="people-outline" size={20} color="#0f766e" />
                <Text style={styles.groupBannerBody}>{t('bookingGroupHomeNote')}</Text>
              </View>
            ) : null}

            <BookingStayDatePicker
              checkInText={checkInText}
              checkOutText={checkOutText}
              onChangeCheckIn={setCheckInText}
              onChangeCheckOut={setCheckOutText}
            />

            <View style={styles.fieldRow}>
              <Stepper label={t('bookingAdults')} value={adults} min={1} max={12} onChange={setAdults} />
              <Stepper label={t('bookingChildren')} value={children} min={0} max={12} onChange={setChildren} />
            </View>

            <View style={[styles.readyBar, datesOk ? styles.readyOk : styles.readyWait]}>
              <Ionicons
                name={datesOk ? 'checkmark-circle' : 'calendar-outline'}
                size={18}
                color={datesOk ? '#0f766e' : '#64748b'}
              />
              <Text style={[styles.readyText, datesOk && styles.readyTextOk]}>
                {datesOk
                  ? t('bookingReadyPickRoom', { nights, guests: partySize })
                  : checkInText.length < 10 || checkOutText.length < 10
                    ? t('bookingDatesFormatHint')
                    : t('bookingDatesInvalid')}
              </Text>
            </View>
          </View>

          {datesOk ? (
            <BookingOccupancyStrip
              occupancy={occupancy}
              loading={occLoading}
              checkIn={datesDisplay.checkIn}
              checkOut={datesDisplay.checkOut}
            />
          ) : null}

          <View style={styles.roomsHead}>
            <Text style={styles.cardEyebrow}>{t('bookingStep2')}</Text>
            <Text style={styles.sectionTitle}>{t('bookingPickRoom')}</Text>
            <Text style={styles.sectionSub}>
              {datesOk
                ? t('bookingRoomsEncourage', { count: availableCount })
                : t('bookingRoomsNeedDates')}
            </Text>
          </View>

          {rooms.length > 0 ? (
            <BookingRoomFilters
              value={roomFilters}
              onChange={setRoomFilters}
              partySize={partySize}
              availableAmenities={availableAmenities}
              resultCount={filteredRooms.length}
            />
          ) : null}

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => void loadRooms()} activeOpacity={0.85}>
                <Text style={styles.retryText}>{t('retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : rooms.length === 0 ? (
            <Text style={styles.empty}>{t('bookingRoomsEmpty')}</Text>
          ) : filteredRooms.length === 0 ? (
            <View style={styles.centered}>
              <Text style={styles.empty}>{t('bookingFiltersEmpty')}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => setRoomFilters(DEFAULT_ROOM_FILTERS)}
                activeOpacity={0.85}
              >
                <Text style={styles.retryText}>{t('bookingFiltersClear')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.grid, wide && styles.gridWide]}>
              {filteredRooms.map((room) => (
                <BookingRoomCard
                  key={room.id}
                  room={room}
                  nights={nights}
                  datesOk={datesOk}
                  popular={popularIds.has(room.id)}
                  wide={wide}
                  discountPercent={
                    guestMode === 'student' ? 10 : guestMode === 'group' ? 3 : 0
                  }
                  discountBadge={
                    guestMode === 'student'
                      ? t('bookingStudentPriceBadge', { pct: 10 })
                      : guestMode === 'group'
                        ? t('bookingGroupPriceBadge', { pct: 3 })
                        : undefined
                  }
                  onPress={() => openRoom(room)}
                />
              ))}
            </View>
          )}

          {datesOk ? <BookingBreakfastStrip days={breakfast} /> : null}
        </View>
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
  hero: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    fontSize: 42,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: Platform.OS === 'android' ? 0 : -1.2,
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
    lineHeight: 30,
    maxWidth: 340,
    marginBottom: 8,
  },
  heroSub: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 22,
    maxWidth: 380,
    marginBottom: 18,
  },
  stepTrail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  stepTrailOn: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ecfdf5',
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  stepTrailOff: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.55)',
  },
  stepTrailSep: { fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: '700' },
  content: {
    paddingHorizontal: 20,
    paddingTop: 18,
    alignSelf: 'center',
    width: '100%',
  },
  contentWide: { maxWidth: 960, paddingHorizontal: 28 },
  searchCard: {
    backgroundColor: C.card,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 26,
    gap: 12,
    marginTop: -10,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  cardEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: C.accent,
  },
  cardTitle: { fontSize: 20, fontWeight: '900', color: C.ink, letterSpacing: -0.3 },
  cardHint: { fontSize: 13, fontWeight: '500', color: C.muted, lineHeight: 18, marginBottom: 4 },
  studentBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  studentBannerTitle: { fontSize: 14, fontWeight: '800', color: '#92400e', marginBottom: 2 },
  studentBannerBody: { fontSize: 12, fontWeight: '600', color: '#b45309', lineHeight: 17 },
  groupBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
  },
  groupBannerBody: { flex: 1, fontSize: 12, fontWeight: '600', color: '#0f766e', lineHeight: 17 },
  fieldRow: { flexDirection: 'row', gap: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted },
  stepperField: { flex: 1, gap: 6 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: '#f8faf9',
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 17, fontWeight: '800', color: C.ink, minWidth: 24, textAlign: 'center' },
  readyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  readyOk: { backgroundColor: C.soft },
  readyWait: { backgroundColor: '#f1f5f9' },
  readyText: { flex: 1, fontSize: 13, fontWeight: '700', color: C.muted, lineHeight: 18 },
  readyTextOk: { color: C.accent },
  roomsHead: { marginBottom: 12, gap: 4 },
  sectionTitle: { fontSize: 24, fontWeight: '900', color: C.ink, letterSpacing: -0.4 },
  sectionSub: { fontSize: 14, fontWeight: '500', color: C.muted, lineHeight: 20 },
  grid: { gap: 16, marginBottom: 8 },
  gridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  centered: { paddingVertical: 40, alignItems: 'center', gap: 12 },
  errorText: { color: '#b42318', fontWeight: '600', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: C.ink },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: C.muted, fontWeight: '600', paddingVertical: 24, textAlign: 'center' },
});
