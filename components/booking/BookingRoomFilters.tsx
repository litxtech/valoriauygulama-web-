import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

export type RoomSortKey = 'recommended' | 'sold' | 'price_asc' | 'price_desc' | 'size_desc';

export type RoomSizeBucket = 'any' | 's' | 'm' | 'l';

export type RoomFiltersState = {
  sort: RoomSortKey;
  guestsMin: number | null;
  size: RoomSizeBucket;
  amenities: string[];
};

export const BOOKING_AMENITY_OPTIONS = [
  { id: 'wifi', labelKey: 'bookingAmenityWifi', icon: 'wifi-outline' as const },
  { id: 'klima', labelKey: 'bookingAmenityAc', icon: 'snow-outline' as const },
  { id: 'tv', labelKey: 'bookingAmenityTv', icon: 'tv-outline' as const },
  { id: 'minibar', labelKey: 'bookingAmenityMinibar', icon: 'wine-outline' as const },
  { id: 'balkon', labelKey: 'bookingAmenityBalcony', icon: 'sunny-outline' as const },
  { id: 'manzara', labelKey: 'bookingAmenityView', icon: 'eye-outline' as const },
] as const;

export const DEFAULT_ROOM_FILTERS: RoomFiltersState = {
  sort: 'recommended',
  guestsMin: null,
  size: 'any',
  amenities: [],
};

type Props = {
  value: RoomFiltersState;
  onChange: (next: RoomFiltersState) => void;
  partySize?: number;
  availableAmenities?: string[];
  resultCount?: number;
};

function countActive(value: RoomFiltersState): number {
  let n = 0;
  if (value.sort !== 'recommended') n += 1;
  if (value.guestsMin != null) n += 1;
  if (value.size !== 'any') n += 1;
  n += value.amenities.length;
  return n;
}

/**
 * Kompakt filtre şeridi (Airbnb tarzı) + detay sheet.
 * Ekranda yer kaplamaz; seçenekler modalda.
 */
export function BookingRoomFilters({
  value,
  onChange,
  partySize,
  availableAmenities,
  resultCount,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  const amenityIds = useMemo(() => {
    const opts = availableAmenities?.length
      ? BOOKING_AMENITY_OPTIONS.filter((a) => availableAmenities.includes(a.id))
      : BOOKING_AMENITY_OPTIONS;
    return opts;
  }, [availableAmenities]);

  const active = countActive(value);

  const openSheet = () => {
    setDraft(value);
    setOpen(true);
  };

  const apply = () => {
    onChange(draft);
    setOpen(false);
  };

  const sortLabel =
    value.sort === 'sold'
      ? t('bookingSortSold')
      : value.sort === 'price_asc'
        ? t('bookingSortPriceAsc')
        : value.sort === 'price_desc'
          ? t('bookingSortPriceDesc')
          : value.sort === 'size_desc'
            ? t('bookingSortSize')
            : t('bookingSortRecommended');

  const toggleAmenity = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(id)
        ? prev.amenities.filter((x) => x !== id)
        : [...prev.amenities, id],
    }));
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bar}
      >
        <TouchableOpacity
          style={[styles.pill, styles.pillPrimary, active > 0 && styles.pillPrimaryOn]}
          onPress={openSheet}
          activeOpacity={0.88}
        >
          <Ionicons name="options-outline" size={15} color={active > 0 ? '#fff' : '#0f172a'} />
          <Text style={[styles.pillText, active > 0 && styles.pillTextOn]}>
            {t('bookingFiltersTitle')}
          </Text>
          {active > 0 ? (
            <View style={styles.countDot}>
              <Text style={styles.countDotText}>{active}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.pill, value.sort === 'sold' && styles.pillOn]}
          onPress={() =>
            onChange({
              ...value,
              sort: value.sort === 'sold' ? 'recommended' : 'sold',
            })
          }
          activeOpacity={0.88}
        >
          <Ionicons
            name="trending-up-outline"
            size={14}
            color={value.sort === 'sold' ? '#0f766e' : '#64748b'}
          />
          <Text style={[styles.pillText, value.sort === 'sold' && styles.pillTextTeal]}>
            {t('bookingSortSoldShort')}
          </Text>
        </TouchableOpacity>

        {partySize != null && partySize > 0 ? (
          <TouchableOpacity
            style={[styles.pill, value.guestsMin === partySize && styles.pillOn]}
            onPress={() =>
              onChange({
                ...value,
                guestsMin: value.guestsMin === partySize ? null : partySize,
              })
            }
            activeOpacity={0.88}
          >
            <Ionicons
              name="people-outline"
              size={14}
              color={value.guestsMin === partySize ? '#0f766e' : '#64748b'}
            />
            <Text
              style={[styles.pillText, value.guestsMin === partySize && styles.pillTextTeal]}
            >
              {t('bookingFilterPartyShort', { n: partySize })}
            </Text>
          </TouchableOpacity>
        ) : null}

        {value.guestsMin != null && value.guestsMin !== partySize ? (
          <TouchableOpacity
            style={[styles.pill, styles.pillOn]}
            onPress={() => onChange({ ...value, guestsMin: null })}
            activeOpacity={0.88}
          >
            <Text style={[styles.pillText, styles.pillTextTeal]}>
              {t('bookingFilterGuestsN', { n: value.guestsMin })}
            </Text>
            <Ionicons name="close" size={13} color="#0f766e" />
          </TouchableOpacity>
        ) : null}

        {value.size !== 'any' ? (
          <TouchableOpacity
            style={[styles.pill, styles.pillOn]}
            onPress={() => onChange({ ...value, size: 'any' })}
            activeOpacity={0.88}
          >
            <Text style={[styles.pillText, styles.pillTextTeal]}>
              {value.size === 's'
                ? t('bookingSizeSShort')
                : value.size === 'm'
                  ? t('bookingSizeMShort')
                  : t('bookingSizeLShort')}
            </Text>
            <Ionicons name="close" size={13} color="#0f766e" />
          </TouchableOpacity>
        ) : null}

        {value.amenities.map((id) => {
          const meta = BOOKING_AMENITY_OPTIONS.find((a) => a.id === id);
          if (!meta) return null;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.pill, styles.pillOn]}
              onPress={() =>
                onChange({
                  ...value,
                  amenities: value.amenities.filter((x) => x !== id),
                })
              }
              activeOpacity={0.88}
            >
              <Ionicons name={meta.icon} size={13} color="#0f766e" />
              <Text style={[styles.pillText, styles.pillTextTeal]}>{t(meta.labelKey)}</Text>
              <Ionicons name="close" size={13} color="#0f766e" />
            </TouchableOpacity>
          );
        })}

        {active > 0 ? (
          <TouchableOpacity
            style={styles.pillGhost}
            onPress={() => onChange(DEFAULT_ROOM_FILTERS)}
            activeOpacity={0.85}
          >
            <Text style={styles.clearText}>{t('bookingFiltersClear')}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {resultCount != null ? (
        <Text style={styles.resultHint}>
          {t('bookingFilterResults', { count: resultCount })} · {sortLabel}
        </Text>
      ) : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t('bookingFiltersTitle')}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={22} color="#0f172a" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetBody}>
            <Text style={styles.group}>{t('bookingFilterSort')}</Text>
            <View style={styles.grid}>
              {(
                [
                  ['recommended', 'bookingSortRecommended'],
                  ['sold', 'bookingSortSold'],
                  ['price_asc', 'bookingSortPriceAsc'],
                  ['price_desc', 'bookingSortPriceDesc'],
                  ['size_desc', 'bookingSortSize'],
                ] as const
              ).map(([key, labelKey]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.opt, draft.sort === key && styles.optOn]}
                  onPress={() => setDraft((p) => ({ ...p, sort: key }))}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.optText, draft.sort === key && styles.optTextOn]}>
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.group}>{t('bookingFilterGuests')}</Text>
            <View style={styles.grid}>
              <TouchableOpacity
                style={[styles.opt, draft.guestsMin == null && styles.optOn]}
                onPress={() => setDraft((p) => ({ ...p, guestsMin: null }))}
              >
                <Text style={[styles.optText, draft.guestsMin == null && styles.optTextOn]}>
                  {t('bookingFilterAny')}
                </Text>
              </TouchableOpacity>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.opt, draft.guestsMin === n && styles.optOn]}
                  onPress={() => setDraft((p) => ({ ...p, guestsMin: n }))}
                >
                  <Text style={[styles.optText, draft.guestsMin === n && styles.optTextOn]}>
                    {n}+
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.group}>{t('bookingFilterSize')}</Text>
            <View style={styles.grid}>
              {(
                [
                  ['any', 'bookingFilterAny'],
                  ['s', 'bookingSizeSShort'],
                  ['m', 'bookingSizeMShort'],
                  ['l', 'bookingSizeLShort'],
                ] as const
              ).map(([key, labelKey]) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.opt, draft.size === key && styles.optOn]}
                  onPress={() => setDraft((p) => ({ ...p, size: key }))}
                >
                  <Text style={[styles.optText, draft.size === key && styles.optTextOn]}>
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {amenityIds.length ? (
              <>
                <Text style={styles.group}>{t('bookingFilterAmenities')}</Text>
                <View style={styles.grid}>
                  {amenityIds.map((a) => {
                    const on = draft.amenities.includes(a.id);
                    return (
                      <TouchableOpacity
                        key={a.id}
                        style={[styles.opt, on && styles.optOn]}
                        onPress={() => toggleAmenity(a.id)}
                      >
                        <Ionicons name={a.icon} size={14} color={on ? '#0f766e' : '#64748b'} />
                        <Text style={[styles.optText, on && styles.optTextOn]}>{t(a.labelKey)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.sheetFooter}>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => setDraft(DEFAULT_ROOM_FILTERS)}
              activeOpacity={0.85}
            >
              <Text style={styles.resetText}>{t('bookingFiltersClear')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={apply} activeOpacity={0.9}>
              <Text style={styles.applyText}>{t('bookingFiltersApply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14, gap: 8 },
  bar: { gap: 8, paddingVertical: 2, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.1)',
  },
  pillPrimary: {
    backgroundColor: '#fff',
    borderColor: 'rgba(15,23,42,0.14)',
    paddingRight: 10,
  },
  pillPrimaryOn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  pillOn: {
    backgroundColor: '#ecfdf5',
    borderColor: 'rgba(15,118,110,0.35)',
  },
  pillGhost: { paddingHorizontal: 8, paddingVertical: 9 },
  pillText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  pillTextOn: { color: '#fff' },
  pillTextTeal: { color: '#0f766e' },
  countDot: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#14b8a6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  clearText: { fontSize: 13, fontWeight: '700', color: '#64748b', textDecorationLine: 'underline' },
  resultHint: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '78%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    ...Platform.select({
      web: { boxShadow: '0 -8px 32px rgba(15,23,42,0.12)' } as object,
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.15,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: -6 },
        elevation: 16,
      },
    }),
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 10,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0b1220' },
  sheetBody: { paddingHorizontal: 20, paddingBottom: 16, gap: 8 },
  group: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: '#94a3b8',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  optOn: {
    backgroundColor: '#ecfdf5',
    borderColor: 'rgba(15,118,110,0.3)',
  },
  optText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  optTextOn: { color: '#0f766e' },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  resetBtn: { paddingHorizontal: 8, paddingVertical: 14 },
  resetText: { fontSize: 14, fontWeight: '700', color: '#64748b', textDecorationLine: 'underline' },
  applyBtn: {
    flex: 1,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
