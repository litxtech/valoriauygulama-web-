import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ParsedDocument } from '@/lib/scanner/types';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';

type Props = {
  index: number;
  parsed: ParsedDocument;
  portraitUri: string;
  onPress?: () => void;
  onRemove?: () => void;
};

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function fmt(v: string | null | undefined): string {
  return v != null && String(v).trim().length > 0 ? String(v).trim() : '—';
}

export function NfcFamilyMemberCard({ index, parsed, portraitUri, onPress, onRemove }: Props) {
  const { t } = useTranslation();
  const name = [parsed.firstName, parsed.lastName].filter(Boolean).join(' ').trim() || '—';
  const gender =
    parsed.gender === 'M'
      ? 'Erkek (M)'
      : parsed.gender === 'F'
        ? 'Kadın (F)'
        : parsed.gender === 'X'
          ? 'Belirtilmedi (X)'
          : '—';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && onPress ? styles.cardPressed : null]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={styles.indexBadge}>
          <Text style={styles.indexText}>{index + 1}</Text>
        </View>
        <Image source={{ uri: portraitUri }} style={styles.portrait} contentFit="cover" />
        <View style={styles.headerBody}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.docNo} numberOfLines={1}>
            {fmt(parsed.documentNumber)}
          </Text>
        </View>
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            hitSlop={10}
            style={styles.removeBtn}
            accessibilityLabel={t('kbsRemoveFromListA11y')}
          >
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.fields}>
        <Field label={t('kbsGuestBirthDate')} value={formatIsoDateTr(parsed.birthDate)} />
        <Field label={t('kbsGuestNationality')} value={formatIcao3ForTr(parsed.nationalityCode)} />
        <Field label={t('kbsNfcExpiryDate')} value={formatIsoDateTr(parsed.expiryDate)} />
        <Field label={t('kbsGuestGender')} value={gender} />
        {parsed.personalNumber ? (
          <Field label={t('kbsGuestIdentityNo')} value={fmt(parsed.personalNumber)} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: { opacity: 0.92 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  portrait: {
    width: 52,
    height: 66,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  headerBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  docNo: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600' },
  removeBtn: { padding: 4 },
  fields: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0', paddingTop: 8 },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 5,
  },
  fieldLabel: { fontSize: 12, color: '#64748b', flex: 1 },
  fieldValue: { fontSize: 13, fontWeight: '600', color: '#0f172a', flex: 1.2, textAlign: 'right' },
});
