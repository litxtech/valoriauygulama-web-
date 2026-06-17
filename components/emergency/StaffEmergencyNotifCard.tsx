import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { StaffEmergencyAlertPayload } from '@/lib/staffEmergency';

type Props = {
  payload: StaffEmergencyAlertPayload;
  compact?: boolean;
};

export function StaffEmergencyNotifCard({ payload, compact = false }: Props) {
  const { t } = useTranslation();
  const { location, note, authorName } = payload;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.headerRow}>
        <Ionicons name="warning" size={compact ? 16 : 20} color="#dc2626" />
        <Text style={[styles.headerText, compact && styles.headerTextCompact]}>
          {t('staffEmergencyNotifHeading')}
        </Text>
      </View>
      {location ? (
        <View style={styles.row}>
          <Text style={styles.label}>{t('staffEmergencyNotifLocationLabel')}</Text>
          <Text style={[styles.value, styles.locationValue, compact && styles.valueCompact]}>
            {location}
          </Text>
        </View>
      ) : null}
      <Text style={[styles.instruction, compact && styles.instructionCompact]}>
        {t('staffEmergencyNotifInstruction')}
      </Text>
      {authorName ? (
        <View style={styles.row}>
          <Text style={styles.label}>{t('staffEmergencyNotifSenderLabel')}</Text>
          <Text style={[styles.value, compact && styles.valueCompact]}>{authorName}</Text>
        </View>
      ) : null}
      {note ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>{t('staffEmergencyNotifNoteLabel')}</Text>
          <Text style={[styles.noteText, compact && styles.noteTextCompact]}>{note}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  cardCompact: {
    padding: 10,
    gap: 6,
    marginBottom: 6,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991b1b',
    flex: 1,
  },
  headerTextCompact: {
    fontSize: 13,
  },
  row: {
    gap: 2,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7f1d1d',
  },
  valueCompact: {
    fontSize: 13,
  },
  locationValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  instruction: {
    fontSize: 14,
    lineHeight: 20,
    color: '#991b1b',
    fontWeight: '600',
  },
  instructionCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  noteBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    gap: 4,
  },
  noteLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7f1d1d',
  },
  noteTextCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
});
