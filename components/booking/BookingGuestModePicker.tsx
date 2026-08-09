import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export type BookingGuestMode = 'solo' | 'student' | 'group';

type Props = {
  value: BookingGuestMode;
  onChange: (mode: BookingGuestMode) => void;
};

const OPTIONS: {
  id: BookingGuestMode;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  hintKey: string;
}[] = [
  {
    id: 'solo',
    icon: 'person-outline',
    titleKey: 'bookingModeSolo',
    hintKey: 'bookingModeSoloHint',
  },
  {
    id: 'student',
    icon: 'school-outline',
    titleKey: 'bookingModeStudent',
    hintKey: 'bookingModeStudentHint',
  },
  {
    id: 'group',
    icon: 'people-outline',
    titleKey: 'bookingModeGroup',
    hintKey: 'bookingModeGroupHint',
  },
];

/** Anasayfa: bireysel / öğrenci / grup — karışıklığı önler */
export function BookingGuestModePicker({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('bookingWhoComing')}</Text>
      <Text style={styles.sub}>{t('bookingWhoComingHint')}</Text>
      <View style={styles.row}>
        {OPTIONS.map((opt) => {
          const on = value === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.card, on && styles.cardOn, opt.id === 'student' && on && styles.cardStudentOn]}
              onPress={() => onChange(opt.id)}
              activeOpacity={0.88}
            >
              <View style={[styles.iconWrap, on && styles.iconWrapOn]}>
                <Ionicons name={opt.icon} size={22} color={on ? '#fff' : '#0f766e'} />
              </View>
              <Text style={[styles.title, on && styles.titleOn]}>{t(opt.titleKey)}</Text>
              <Text style={[styles.hint, on && styles.hintOn]}>{t(opt.hintKey)}</Text>
              {on ? (
                <View style={styles.check}>
                  <Ionicons name="checkmark-circle" size={18} color={opt.id === 'student' ? '#fef3c7' : '#5eead4'} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 14, gap: 8 },
  label: { fontSize: 14, fontWeight: '800', color: '#0b1220' },
  sub: { fontSize: 12, fontWeight: '500', color: '#64748b', lineHeight: 17, marginBottom: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 100,
    backgroundColor: '#f8faf9',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(11,18,32,0.08)',
    padding: 12,
    gap: 6,
    minHeight: 128,
  },
  cardOn: {
    backgroundColor: '#0f766e',
    borderColor: '#0f766e',
  },
  cardStudentOn: {
    backgroundColor: '#0f172a',
    borderColor: '#f59e0b',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ecfdf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapOn: { backgroundColor: 'rgba(255,255,255,0.16)' },
  title: { fontSize: 14, fontWeight: '800', color: '#0b1220' },
  titleOn: { color: '#fff' },
  hint: { fontSize: 11, fontWeight: '600', color: '#64748b', lineHeight: 15 },
  hintOn: { color: 'rgba(255,255,255,0.78)' },
  check: { position: 'absolute', top: 10, right: 10 },
});
