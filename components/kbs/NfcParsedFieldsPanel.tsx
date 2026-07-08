import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ParsedDocument } from '@/lib/scanner/types';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import { formatIcao3ForTr } from '@/lib/scanner/mrzIssuingLabel';

type Props = {
  parsed: ParsedDocument;
  compact?: boolean;
  variant?: 'dark' | 'light';
};

function fmt(v: string | null | undefined): string {
  return v != null && String(v).length > 0 ? String(v) : '—';
}

function docTypeTr(code: string | null | undefined): string {
  const m: Record<string, string> = {
    passport: 'Pasaport',
    id_card: 'Kimlik kartı',
    residence_permit: 'İkamet izni',
    other: 'Diğer',
  };
  return code && m[code] ? m[code] : fmt(code);
}

function genderTr(g: ParsedDocument['gender']): string {
  if (g === 'M') return 'Erkek (M)';
  if (g === 'F') return 'Kadın (F)';
  if (g === 'X') return 'Belirtilmedi (X)';
  return '—';
}

export function NfcParsedFieldsPanel({ parsed, compact, variant = 'dark' }: Props) {
  const light = variant === 'light';
  const rowStyle = light ? styles.rowLight : styles.row;
  const labelStyle = light ? styles.labelLight : styles.label;
  const valueStyle = light ? styles.valueLight : styles.value;
  const warnStyle = light ? styles.warnLight : styles.warn;

  const RowLight = ({ label, value }: { label: string; value: string }) => (
    <View style={rowStyle}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={valueStyle}>{value}</Text>
    </View>
  );

  const body = (
    <View style={styles.table}>
      <RowLight label="Belge türü" value={docTypeTr(parsed.documentType)} />
      <RowLight label="Ad" value={fmt(parsed.firstName)} />
      <RowLight label="İkinci ad" value={fmt(parsed.middleName)} />
      <RowLight label="Soyad" value={fmt(parsed.lastName)} />
      <RowLight label="Tam ad" value={fmt(parsed.fullName)} />
      <RowLight label="Pasaport / belge no" value={fmt(parsed.documentNumber)} />
      <RowLight label="Kişisel no" value={fmt(parsed.personalNumber)} />
      <RowLight label="Uyruk (ICAO)" value={formatIcao3ForTr(parsed.nationalityCode)} />
      <RowLight label="Veren ülke (ICAO)" value={formatIcao3ForTr(parsed.issuingCountryCode)} />
      <RowLight label="Doğum tarihi" value={formatIsoDateTr(parsed.birthDate)} />
      <RowLight label="Doğum yeri" value={fmt(parsed.placeOfBirth)} />
      <RowLight label="Son geçerlilik" value={formatIsoDateTr(parsed.expiryDate)} />
      <RowLight label="Cinsiyet" value={genderTr(parsed.gender)} />
      <RowLight
        label="MRZ checksum"
        value={parsed.checksumsValid == null ? '—' : parsed.checksumsValid ? 'Geçerli' : 'Hatalı'}
      />
      {parsed.warnings?.length ? (
        <Text style={warnStyle}>Uyarı: {parsed.warnings.join('; ')}</Text>
      ) : null}
    </View>
  );

  if (compact) return body;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 360 },
  scrollContent: { paddingBottom: 8 },
  table: { gap: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  rowLight: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  label: { color: 'rgba(255,255,255,0.65)', fontSize: 12, flex: 1 },
  labelLight: { color: '#64748b', fontSize: 12, flex: 1 },
  value: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    flex: 1.2,
    textAlign: 'right',
  },
  valueLight: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '600',
    flex: 1.2,
    textAlign: 'right',
  },
  warn: {
    color: '#fde68a',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
  warnLight: {
    color: '#b45309',
    fontSize: 12,
    marginTop: 8,
    lineHeight: 17,
  },
});
