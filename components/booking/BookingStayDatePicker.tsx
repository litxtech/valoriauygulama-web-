import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { addDaysIso, todayIso } from '@/lib/onlineBooking';
import { formatKbsTrDate, parseKbsDateInputToIso } from '@/lib/kbsDisplayFormat';

type Field = 'checkIn' | 'checkOut';

type Props = {
  checkInText: string;
  checkOutText: string;
  onChangeCheckIn: (trDate: string) => void;
  onChangeCheckOut: (trDate: string) => void;
};

const WEEKDAYS = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function ymdToParts(iso: string): { y: number; m: number; d: number } | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function padIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function buildMonthGrid(year: number, month1to12: number): (string | null)[] {
  const first = new Date(year, month1to12 - 1, 1);
  // Monday-first: getDay() Sun=0 → map to Mon=0
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month1to12, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(padIso(year, month1to12, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function displayLabel(trOrIso: string): string {
  const iso = parseKbsDateInputToIso(trOrIso) || trOrIso;
  const tr = formatKbsTrDate(iso);
  return tr || '—';
}

/** Rezervasyon giriş/çıkış — büyük dokunma alanı + takvim modal */
export function BookingStayDatePicker({
  checkInText,
  checkOutText,
  onChangeCheckIn,
  onChangeCheckOut,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cell = Math.min(48, Math.floor((Math.min(width, 420) - 48) / 7));

  const checkInIso = parseKbsDateInputToIso(checkInText) || '';
  const checkOutIso = parseKbsDateInputToIso(checkOutText) || '';
  const today = todayIso();

  const initialParts = ymdToParts(checkInIso || today) || ymdToParts(today)!;
  const [open, setOpen] = useState(false);
  const [activeField, setActiveField] = useState<Field>('checkIn');
  const [viewY, setViewY] = useState(initialParts.y);
  const [viewM, setViewM] = useState(initialParts.m);

  const grid = useMemo(() => buildMonthGrid(viewY, viewM), [viewY, viewM]);

  const openField = (field: Field) => {
    setActiveField(field);
    const focus = field === 'checkIn' ? checkInIso || today : checkOutIso || checkInIso || today;
    const p = ymdToParts(focus);
    if (p) {
      setViewY(p.y);
      setViewM(p.m);
    }
    setOpen(true);
  };

  const shiftMonth = (dir: -1 | 1) => {
    let m = viewM + dir;
    let y = viewY;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewM(m);
    setViewY(y);
  };

  const pickDay = (iso: string) => {
    if (iso < today) return;
    const tr = formatKbsTrDate(iso) || iso;

    if (activeField === 'checkIn') {
      onChangeCheckIn(tr);
      const out = checkOutIso;
      if (!out || out <= iso) {
        const next = addDaysIso(iso, 1);
        onChangeCheckOut(formatKbsTrDate(next) || next);
      }
      setActiveField('checkOut');
      const p = ymdToParts(out && out > iso ? out : addDaysIso(iso, 1));
      if (p) {
        setViewY(p.y);
        setViewM(p.m);
      }
      return;
    }

    // checkOut
    if (checkInIso && iso <= checkInIso) {
      // çıkış girişten önce/eşit → giriş yap, çıkışı +1
      onChangeCheckIn(tr);
      const next = addDaysIso(iso, 1);
      onChangeCheckOut(formatKbsTrDate(next) || next);
      setOpen(false);
      return;
    }
    onChangeCheckOut(tr);
    setOpen(false);
  };

  const applyPreset = (nights: number) => {
    const inIso = today;
    const outIso = addDaysIso(today, nights);
    onChangeCheckIn(formatKbsTrDate(inIso) || inIso);
    onChangeCheckOut(formatKbsTrDate(outIso) || outIso);
    setOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.fieldBtn}
          onPress={() => openField('checkIn')}
          activeOpacity={0.88}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.fieldLabel}>{t('bookingCheckIn')}</Text>
          <View style={styles.fieldValueRow}>
            <Ionicons name="calendar-outline" size={18} color="#0f766e" />
            <Text style={styles.fieldValue}>{displayLabel(checkInText)}</Text>
          </View>
          <Text style={styles.tapHint}>{t('bookingDateTap')}</Text>
        </TouchableOpacity>

        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
        </View>

        <TouchableOpacity
          style={styles.fieldBtn}
          onPress={() => openField('checkOut')}
          activeOpacity={0.88}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={styles.fieldLabel}>{t('bookingCheckOut')}</Text>
          <View style={styles.fieldValueRow}>
            <Ionicons name="calendar-outline" size={18} color="#0f766e" />
            <Text style={styles.fieldValue}>{displayLabel(checkOutText)}</Text>
          </View>
          <Text style={styles.tapHint}>{t('bookingDateTap')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.presets}>
        <TouchableOpacity style={styles.preset} onPress={() => applyPreset(1)} activeOpacity={0.88}>
          <Text style={styles.presetText}>{t('bookingPreset1')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.preset} onPress={() => applyPreset(2)} activeOpacity={0.88}>
          <Text style={styles.presetText}>{t('bookingPreset2')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.preset} onPress={() => applyPreset(3)} activeOpacity={0.88}>
          <Text style={styles.presetText}>{t('bookingPreset3')}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>
              {activeField === 'checkIn' ? t('bookingPickCheckIn') : t('bookingPickCheckOut')}
            </Text>
            <Text style={styles.sheetSub}>
              {activeField === 'checkIn' ? t('bookingPickCheckInHint') : t('bookingPickCheckOutHint')}
            </Text>

            <View style={styles.monthNav}>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(-1)} hitSlop={12}>
                <Ionicons name="chevron-back" size={22} color="#0f172a" />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {MONTHS_TR[viewM - 1]} {viewY}
              </Text>
              <TouchableOpacity style={styles.navBtn} onPress={() => shiftMonth(1)} hitSlop={12}>
                <Ionicons name="chevron-forward" size={22} color="#0f172a" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {WEEKDAYS.map((d) => (
                <Text key={d} style={[styles.weekLabel, { width: cell }]}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {grid.map((iso, i) => {
                if (!iso) {
                  return <View key={`e-${i}`} style={{ width: cell, height: cell }} />;
                }
                const past = iso < today;
                const isIn = iso === checkInIso;
                const isOut = iso === checkOutIso;
                const inRange =
                  !!checkInIso &&
                  !!checkOutIso &&
                  iso > checkInIso &&
                  iso < checkOutIso;
                const selected = isIn || isOut;
                return (
                  <TouchableOpacity
                    key={iso}
                    style={[
                      styles.dayCell,
                      { width: cell, height: cell },
                      inRange && styles.dayInRange,
                      selected && styles.daySelected,
                      past && styles.dayPast,
                    ]}
                    disabled={past}
                    onPress={() => pickDay(iso)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        selected && styles.dayTextSelected,
                        past && styles.dayTextPast,
                      ]}
                    >
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {Platform.OS === 'web' ? (
              <View style={styles.webFallback}>
                <Text style={styles.webLabel}>
                  {activeField === 'checkIn' ? t('bookingCheckIn') : t('bookingCheckOut')}
                </Text>
                {/* @ts-expect-error web-only native date input */}
                <input
                  type="date"
                  min={
                    activeField === 'checkOut' && checkInIso
                      ? addDaysIso(checkInIso, 1)
                      : today
                  }
                  value={
                    activeField === 'checkIn'
                      ? checkInIso || today
                      : checkOutIso || (checkInIso ? addDaysIso(checkInIso, 1) : addDaysIso(today, 1))
                  }
                  onChange={(e: { target: { value: string } }) => {
                    const v = e.target.value;
                    if (!v) return;
                    pickDay(v);
                  }}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid rgba(15,23,42,0.12)',
                    width: '100%',
                  }}
                />
              </View>
            ) : null}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setOpen(false)} activeOpacity={0.88}>
              <Text style={styles.closeText}>{t('bookingDateDone')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  fieldBtn: {
    flex: 1,
    backgroundColor: '#f8faf9',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 88,
    justifyContent: 'center',
    gap: 6,
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  fieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldValue: { fontSize: 17, fontWeight: '800', color: '#0b1220' },
  tapHint: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  arrow: { justifyContent: 'center', paddingTop: 8 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.2)',
  },
  presetText: { fontSize: 12, fontWeight: '800', color: '#0f766e' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)', zIndex: 1 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 8,
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    zIndex: 2,
    elevation: 8,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#0b1220' },
  sheetSub: { fontSize: 13, fontWeight: '500', color: '#64748b', marginTop: 4, marginBottom: 14 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  weekLabel: { textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#94a3b8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginBottom: 4,
  },
  dayInRange: { backgroundColor: '#ecfdf5' },
  daySelected: { backgroundColor: '#0f766e' },
  dayPast: { opacity: 0.35 },
  dayText: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  dayTextSelected: { color: '#fff' },
  dayTextPast: { color: '#94a3b8' },
  webFallback: { marginTop: 12, gap: 6 },
  webLabel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  closeBtn: {
    marginTop: 12,
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
