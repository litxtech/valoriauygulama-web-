import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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
  Linking,
  useWindowDimensions,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  addDaysIso,
  createOnlineBooking,
  getBookableRoom,
  isRoomAvailableForStay,
  listGuestBreakfastForStay,
  nightsBetween,
  roomPublicTitle,
  todayIso,
  trackBookingEvent,
  type BookableRoom,
  type GuestBreakfastDay,
  type OnlineBookingExtras,
  type OnlineBookingPartyGuest,
} from '@/lib/onlineBooking';
import { computeBookingQuoteClient } from '@/lib/bookingQuote';
import {
  createOnlineBookingPayment,
  formatTrBirthDateInput,
  saveBookingPayFinalizeDraft,
} from '@/lib/onlineBookingPayment';
import { saveBookingWhatsAppShareDraft } from '@/lib/onlineBookingWhatsApp';
import { parseKbsDateInputToIso, formatKbsTrDate } from '@/lib/kbsDisplayFormat';
import { BookingBreakfastStrip } from '@/components/booking/BookingBreakfastStrip';
import { BookingGroupMembersForm } from '@/components/booking/BookingGroupMembersForm';
import { BookingHeroGallery } from '@/components/booking/BookingHeroGallery';
import { BookingStayDatePicker } from '@/components/booking/BookingStayDatePicker';
import type { BookingGuestMode } from '@/components/booking/BookingGuestModePicker';

function toTrStayDate(raw: string, fallbackIso: string): string {
  const iso = parseKbsDateInputToIso(raw) || fallbackIso;
  return formatKbsTrDate(iso) || iso;
}

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
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const params = useLocalSearchParams<{
    id?: string | string[];
    checkIn?: string | string[];
    checkOut?: string | string[];
    adults?: string | string[];
    children?: string | string[];
    mode?: string | string[];
  }>();

  const roomId = paramOne(params.id);
  const modeRaw = paramOne(params.mode);
  const guestMode: BookingGuestMode =
    modeRaw === 'student' || modeRaw === 'group' || modeRaw === 'solo' ? modeRaw : 'solo';
  const adults = Math.max(1, Number(paramOne(params.adults) || 1) || 1);
  const childrenCount = Math.max(0, Number(paramOne(params.children) || 0) || 0);

  const [checkInText, setCheckInText] = useState(() =>
    toTrStayDate(paramOne(params.checkIn), todayIso())
  );
  const [checkOutText, setCheckOutText] = useState(() =>
    toTrStayDate(paramOne(params.checkOut), addDaysIso(todayIso(), 1))
  );
  const checkIn = useMemo(() => parseKbsDateInputToIso(checkInText) || '', [checkInText]);
  const checkOut = useMemo(() => parseKbsDateInputToIso(checkOutText) || '', [checkOutText]);
  const checkInLabel = formatKbsTrDate(checkIn) || checkInText;
  const checkOutLabel = formatKbsTrDate(checkOut) || checkOutText;
  const nights = nightsBetween(checkIn, checkOut);
  const datesOk = Boolean(checkIn && checkOut && nights >= 1);

  const syncStayParams = (nextInTr: string, nextOutTr: string) => {
    const nextIn = parseKbsDateInputToIso(nextInTr);
    const nextOut = parseKbsDateInputToIso(nextOutTr);
    const patch: Record<string, string> = {};
    if (nextIn) patch.checkIn = nextIn;
    if (nextOut) patch.checkOut = nextOut;
    if (Object.keys(patch).length) router.setParams(patch);
  };

  const [room, setRoom] = useState<BookableRoom | null>(null);
  const [roomAvailable, setRoomAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [tc, setTc] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [university, setUniversity] = useState('');
  const [breakfast, setBreakfast] = useState<GuestBreakfastDay[]>([]);
  const [partyGuests, setPartyGuests] = useState<OnlineBookingPartyGuest[]>([]);
  const [groupIsStudent, setGroupIsStudent] = useState(guestMode === 'student');
  const isStudentParty = guestMode === 'student' || (guestMode === 'group' && groupIsStudent);
  const [extras, setExtras] = useState<OnlineBookingExtras>({
    breakfast: true,
    parking: false,
  });

  useEffect(() => {
    if (guestMode === 'group' && partyGuests.length === 0) {
      setPartyGuests([{ full_name: '', id_number: '', phone: '', university: '', is_student: false }]);
    }
  }, [guestMode]);

  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const nameFieldRef = useRef<View>(null);
  const tcFieldRef = useRef<View>(null);
  const birthFieldRef = useRef<View>(null);
  const phoneFieldRef = useRef<View>(null);
  const emailFieldRef = useRef<View>(null);
  const noteFieldRef = useRef<View>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  /** Odaklanan alanı ekranda tut — scrollToEnd kullanma (ad soyad yukarı kaçar). */
  const scrollFieldIntoView = (target: RefObject<View | null>) => {
    const content = contentRef.current;
    const field = target.current;
    if (!content || !field) return;
    const run = () => {
      field.measureLayout(
        content,
        (_x, y) => {
          scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
        },
        () => {},
      );
    };
    requestAnimationFrame(() => {
      setTimeout(run, Platform.OS === 'ios' ? 60 : 140);
    });
  };

  const contentPadBottom = insets.bottom + 48 + (Platform.OS === 'android' ? keyboardHeight : 24);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [bf, available] = await Promise.all([
          datesOk ? listGuestBreakfastForStay(checkIn, checkOut) : Promise.resolve([]),
          datesOk && roomId
            ? isRoomAvailableForStay(roomId, checkIn, checkOut).catch(() => true)
            : Promise.resolve(true),
        ]);
        if (!cancelled) {
          setRoomAvailable(available);
          setBreakfast(bf);
        }
      } catch {
        /* stay metadata optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, checkIn, checkOut, datesOk]);

  const quote = useMemo(() => {
    const booker: OnlineBookingPartyGuest = {
      full_name: name,
      id_number: tc,
      phone,
      university: isStudentParty ? university : undefined,
      is_student: isStudentParty,
    };
    return computeBookingQuoteClient({
      pricePerNight: room?.price_per_night ?? null,
      nights,
      members: [booker, ...partyGuests],
      isStudentParty,
      isGroup: guestMode === 'group' || partyGuests.length > 0,
      campaign: null,
    });
  }, [room?.price_per_night, nights, name, tc, phone, university, partyGuests, isStudentParty, guestMode]);

  const total = quote.payable;

  const images = room?.image_urls?.length
    ? room.image_urls
    : room?.cover_image_url
      ? [room.cover_image_url]
      : [];

  const submit = async () => {
    if (!room) return;
    if (!datesOk) {
      Alert.alert(t('bookingInvalid'), t('bookingPickDatesFirst'));
      return;
    }
    if (name.trim().length < 2) {
      Alert.alert(t('bookingInvalid'), t('bookingNameRequired'));
      return;
    }
    if (phone.trim().length < 7) {
      Alert.alert(t('bookingInvalid'), t('bookingPhoneRequired'));
      return;
    }
    const tcDigits = tc.replace(/\D/g, '');
    if (tcDigits.length !== 11) {
      Alert.alert(t('bookingInvalid'), t('bookingTcRequired'));
      return;
    }
    const birthIso = parseKbsDateInputToIso(birthDate.trim());
    if (!birthIso) {
      Alert.alert(t('bookingInvalid'), t('bookingBirthRequired'));
      return;
    }
    if (isStudentParty && university.trim().length < 2) {
      Alert.alert(t('bookingInvalid'), t('bookingUniversityRequired'));
      return;
    }
    if (guestMode === 'group' && partyGuests.length < 1) {
      Alert.alert(t('bookingInvalid'), t('bookingGroupMembersRequired'));
      return;
    }
    for (let i = 0; i < partyGuests.length; i++) {
      const m = partyGuests[i]!;
      const label = isStudentParty ? `Öğrenci ${i + 1}` : `Grup üyesi ${i + 1}`;
      if ((m.full_name ?? '').trim().length < 2) {
        Alert.alert(t('bookingInvalid'), `${label}: ad soyad gerekli`);
        return;
      }
      const mTc = (m.id_number ?? '').replace(/\D/g, '');
      if (mTc.length !== 11) {
        Alert.alert(t('bookingInvalid'), `${label}: 11 haneli TC gerekli`);
        return;
      }
      const needsUni = isStudentParty || !!m.is_student;
      if (needsUni && (m.university ?? '').trim().length < 2) {
        Alert.alert(t('bookingInvalid'), `${label}: üniversite gerekli`);
        return;
      }
    }
    if (total == null || total <= 0) {
      Alert.alert(t('bookingInvalid'), t('bookingPayAmountMissing'));
      return;
    }
    setSubmitting(true);
    try {
      const stillOpen = await isRoomAvailableForStay(room.id, checkIn, checkOut);
      if (!stillOpen) {
        setRoomAvailable(false);
        Alert.alert(t('bookingRoomFullTitle'), t('bookingRoomFullBody', { checkIn: checkInLabel, checkOut: checkOutLabel }));
        return;
      }
      const source = Platform.OS === 'web' ? 'web' : Platform.OS === 'ios' || Platform.OS === 'android' ? 'app' : 'lobby';
      const id = await createOnlineBooking({
        roomId: room.id,
        checkIn,
        checkOut,
        adults: Math.max(adults, 1 + partyGuests.length),
        children: childrenCount,
        guestFullName: name,
        guestPhone: phone,
        guestEmail: email,
        guestNote: [
          note.trim(),
          isStudentParty && university.trim() ? `Öğrenci · ${university.trim()}` : null,
        ]
          .filter(Boolean)
          .join('\n') || undefined,
        guestIdNumber: tcDigits,
        guestBirthDate: birthIso,
        partyGuests: partyGuests.map((m) => ({
          full_name: (m.full_name ?? '').trim(),
          id_number: (m.id_number ?? '').replace(/\D/g, ''),
          phone: isStudentParty ? undefined : (m.phone ?? '').trim() || undefined,
          university:
            isStudentParty || m.is_student
              ? (m.university ?? '').trim() || undefined
              : undefined,
          birth_date: m.birth_date,
          is_student: isStudentParty ? true : !!m.is_student,
        })),
        extras,
        source,
        isStudentParty,
        isGroup: guestMode === 'group' || partyGuests.length > 0,
      });
      void trackBookingEvent('form_submit', {
        roomId: room.id,
        bookingId: id,
        capacityLabel: room.capacity_label,
        source,
      });

      await saveBookingPayFinalizeDraft({
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
      });
      await saveBookingWhatsAppShareDraft({
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
      });

      const payment = await createOnlineBookingPayment({
        bookingId: id,
        lang: (i18n.language || 'tr').split('-')[0],
      });

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.location.href = payment.pay_url;
        return;
      }

      const canOpen = await Linking.canOpenURL(payment.pay_url);
      if (!canOpen) {
        throw new Error(t('bookingPayOpenError'));
      }
      await Linking.openURL(payment.pay_url);
      router.replace({
        pathname: '/booking/success',
        params: { id, payment: 'pending' },
      });
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? Math.max(insets.top, 12) : 0}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View ref={contentRef} collapsable={false}>
        <BookingHeroGallery
          images={images}
          videoUrl={room.video_url}
          title={roomPublicTitle(room)}
          subtitle={
            `${checkInLabel} → ${checkOutLabel} · ${t('bookingNights', { count: nights })} · ${adults} ${t('bookingAdults').toLowerCase()}` +
            (childrenCount > 0 ? ` · ${childrenCount} ${t('bookingChildren').toLowerCase()}` : '')
          }
          priceLabel={
            isStudentParty && quote.listTotal != null && total != null && quote.discountAmount > 0
              ? `${money(Math.round((room.price_per_night ?? 0) * 0.9))} / ${t('bookingPerNight')} · ${t('bookingStayTotal', { total: money(total) })}`
              : total != null
                ? `${money(room.price_per_night)} / ${t('bookingPerNight')} · ${t('bookingStayTotal', { total: money(total) })}`
                : money(room.price_per_night)
          }
          onBack={() => router.back()}
        />

        <View style={[styles.body, wide && styles.bodyWide]}>
          <Text style={styles.stepChip}>{t('bookingStep3')}</Text>

          <View style={styles.datesCard}>
            <Text style={styles.datesTitle}>{t('bookingCheckIn')} / {t('bookingCheckOut')}</Text>
            <BookingStayDatePicker
              checkInText={checkInText}
              checkOutText={checkOutText}
              onChangeCheckIn={(tr) => {
                setCheckInText(tr);
                syncStayParams(tr, checkOutText);
              }}
              onChangeCheckOut={(tr) => {
                setCheckOutText(tr);
                syncStayParams(checkInText, tr);
              }}
            />
            {!datesOk ? (
              <Text style={styles.datesWarn}>{t('bookingPickDatesFirst')}</Text>
            ) : (
              <Text style={styles.datesMeta}>
                {t('bookingNights', { count: nights })} · {checkInLabel} → {checkOutLabel}
              </Text>
            )}
          </View>

          <BookingBreakfastStrip days={breakfast} />

          {!roomAvailable && datesOk ? (
            <View style={styles.fullBanner}>
              <Text style={styles.fullBannerTitle}>{t('bookingRoomFullTitle')}</Text>
              <Text style={styles.fullBannerBody}>{t('bookingRoomFullBody', { checkIn: checkInLabel, checkOut: checkOutLabel })}</Text>
              <Text style={styles.fullBannerHint}>Farklı tarih seçebilir veya odalara dönebilirsiniz.</Text>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.replace('/booking')}
                activeOpacity={0.88}
              >
                <Text style={styles.secondaryBtnText}>{t('bookingBackToRooms')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {room.description ? <Text style={styles.description}>{room.description}</Text> : null}

          <View style={styles.summaryCard}>
            {quote.discountAmount > 0 && room.price_per_night != null ? (
              <>
                <View style={styles.summaryPriceRow}>
                  <Text style={styles.summaryPriceStrike}>{money(room.price_per_night)}</Text>
                  <Text style={styles.summaryPrice}>
                    {money(
                      Math.round(
                        room.price_per_night *
                          (1 - (quote.discountAmount / Math.max(quote.listTotal || 1, 1)))
                      )
                    )}
                  </Text>
                </View>
                <Text style={styles.summaryHint}>
                  {t('bookingPerNight')}
                  {quote.label ? ` · ${quote.label}` : ''}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryPrice}>{money(room.price_per_night)}</Text>
                <Text style={styles.summaryHint}>{t('bookingPerNight')}</Text>
              </>
            )}
            {quote.listTotal != null && quote.discountAmount > 0 ? (
              <View style={styles.summaryTotalRow}>
                <Text style={styles.summaryListStrike}>{money(quote.listTotal)}</Text>
                <Text style={styles.summaryPay}>{money(total)}</Text>
              </View>
            ) : total != null ? (
              <Text style={styles.summaryPay}>Ödenecek: {money(total)}</Text>
            ) : null}
            {quote.discountAmount > 0 ? (
              <Text style={styles.summaryDeal}>
                {quote.label ?? 'İndirim'} · −{money(quote.discountAmount)}
              </Text>
            ) : null}
            {isStudentParty ? (
              <Text style={styles.summaryCardNote}>{t('bookingStudentCardNote')}</Text>
            ) : null}
          </View>

          <View style={styles.formPanel}>
            <Text style={styles.section}>{t('bookingExtras')}</Text>
            {(
              [
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

            <Text style={[styles.section, styles.guestSection]}>
              {guestMode === 'student'
                ? t('bookingStudentDetails')
                : guestMode === 'group'
                  ? t('bookingGroupLeadDetails')
                  : t('bookingGuestDetails')}
            </Text>

            {isStudentParty ? (
              <View style={styles.studentCardNote}>
                <Text style={styles.studentCardNoteText}>{t('bookingStudentCardNote')}</Text>
              </View>
            ) : null}

            <View ref={nameFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingFullName')}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                onFocus={() => scrollFieldIntoView(nameFieldRef)}
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
                placeholderTextColor="#98a2b3"
              />
            </View>

            <View ref={tcFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingTc')}</Text>
              <TextInput
                style={styles.input}
                value={tc}
                onChangeText={setTc}
                onFocus={() => scrollFieldIntoView(tcFieldRef)}
                keyboardType="number-pad"
                maxLength={11}
                placeholder="11 haneli TC"
                placeholderTextColor="#98a2b3"
              />
            </View>

            {isStudentParty ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>{t('bookingUniversity')}</Text>
                <TextInput
                  style={styles.input}
                  value={university}
                  onChangeText={setUniversity}
                  placeholder={t('bookingUniversityPlaceholder')}
                  autoCapitalize="words"
                  placeholderTextColor="#98a2b3"
                />
              </View>
            ) : null}

            <View ref={birthFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingBirthDate')}</Text>
              <TextInput
                style={styles.input}
                value={birthDate}
                onChangeText={(v) => setBirthDate(formatTrBirthDateInput(v))}
                onFocus={() => scrollFieldIntoView(birthFieldRef)}
                placeholder={t('bookingBirthPlaceholder')}
                placeholderTextColor="#98a2b3"
                keyboardType="number-pad"
                maxLength={10}
              />
            </View>

            <View ref={phoneFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingPhone')}</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                onFocus={() => scrollFieldIntoView(phoneFieldRef)}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholderTextColor="#98a2b3"
              />
            </View>

            <View ref={emailFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingEmail')}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                onFocus={() => scrollFieldIntoView(emailFieldRef)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                placeholderTextColor="#98a2b3"
              />
            </View>

            <BookingGroupMembersForm
              mode={guestMode}
              members={partyGuests}
              onChange={setPartyGuests}
              groupIsStudent={groupIsStudent}
              onGroupIsStudentChange={setGroupIsStudent}
            />

            <View ref={noteFieldRef} collapsable={false} style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>{t('bookingNote')}</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                onFocus={() => scrollFieldIntoView(noteFieldRef)}
                multiline
                blurOnSubmit={false}
                textAlignVertical="top"
                placeholderTextColor="#98a2b3"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, (submitting || !roomAvailable || !datesOk) && styles.primaryBtnDisabled]}
              onPress={() => {
                if (!datesOk) {
                  Alert.alert(t('bookingInvalid'), t('bookingPickDatesFirst'));
                  return;
                }
                if (!roomAvailable) {
                  Alert.alert(t('bookingRoomFullTitle'), t('bookingRoomFullBody', { checkIn: checkInLabel, checkOut: checkOutLabel }));
                  return;
                }
                void submit();
              }}
              disabled={submitting || !datesOk || !roomAvailable}
              activeOpacity={0.88}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {!roomAvailable ? t('bookingRoomFullBadge') : t('bookingPayWithCard')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  body: {
    paddingHorizontal: 22,
    paddingTop: 22,
    width: '100%',
    alignSelf: 'center',
  },
  bodyWide: {
    maxWidth: 920,
    paddingHorizontal: 32,
  },
  stepChip: {
    alignSelf: 'flex-start', fontSize: 11, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', color: C.accent, backgroundColor: C.soft,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, marginBottom: 14,
  },
  fullBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.25)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  datesCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 16,
  },
  datesTitle: { fontSize: 16, fontWeight: '800', color: C.ink, marginBottom: 10 },
  datesWarn: { marginTop: 8, fontSize: 13, fontWeight: '700', color: '#b42318' },
  datesMeta: { marginTop: 8, fontSize: 12, fontWeight: '600', color: C.muted },
  fullBannerTitle: { fontSize: 15, fontWeight: '800', color: '#92400e' },
  fullBannerBody: { fontSize: 13, fontWeight: '500', color: '#78350f', lineHeight: 19 },
  fullBannerHint: { fontSize: 12, fontWeight: '600', color: '#92400e', marginTop: 4 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: '#0f766e',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  secondaryBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  description: { fontSize: 15, fontWeight: '500', color: C.ink, lineHeight: 22, marginBottom: 14 },
  summaryCard: { backgroundColor: '#0f172a', borderRadius: 22, padding: 20, marginBottom: 24, marginTop: 8 },
  summaryPrice: { fontSize: 28, fontWeight: '800', color: '#5eead4' },
  summaryPriceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 },
  summaryPriceStrike: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    textDecorationLine: 'line-through',
  },
  summaryHint: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  summaryTotal: { marginTop: 12, fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  summaryTotalRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryListStrike: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    textDecorationLine: 'line-through',
  },
  summaryPay: { marginTop: 6, fontSize: 18, fontWeight: '800', color: '#5eead4' },
  summaryDeal: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#99f6e4' },
  summaryCardNote: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#fde68a',
    lineHeight: 17,
  },
  formPanel: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginBottom: 8,
  },
  section: { fontSize: 18, fontWeight: '800', color: C.ink, marginBottom: 12, marginTop: 4 },
  guestSection: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line },
  studentCardNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    marginBottom: 10,
  },
  studentCardNoteText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#92400e', lineHeight: 18 },
  fieldBlock: { marginBottom: 2 },
  extraRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: C.line, marginBottom: 10,
  },
  extraLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, fontWeight: '600',
    color: C.ink, backgroundColor: '#fafaf9', marginBottom: 2,
  },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: {
    marginTop: 22, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  errorText: { color: '#b42318', fontWeight: '700', textAlign: 'center' },
});
