import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { MrzRecentDocRow } from '@/lib/loadMrzRecentDocuments';
import {
  documentTypeLabelTr,
  genderLabelTr,
  guestDisplayName,
  scanStatusColor,
  scanStatusLabelTr,
} from '@/lib/mrzPassportArchive';
import { formatDateShort } from '@/lib/date';

type Props = {
  visible: boolean;
  row: MrzRecentDocRow | null;
  onClose: () => void;
  onEdit?: () => void;
};

function dash(v: string | null | undefined): string {
  const s = v?.trim();
  return s ? s : '—';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLbl}>{label}</Text>
      <Text style={styles.rowVal} selectable>
        {value}
      </Text>
    </View>
  );
}

export function MrzPassportDetailSheet({ visible, row, onClose, onEdit }: Props) {
  const { t, i18n } = useTranslation();

  const fields = useMemo(() => {
    if (!row) return [];
    const g = row.guest ?? null;
    const parsed = row.parsed_payload ?? {};
    const str = (k: string) => {
      const v = parsed[k];
      return typeof v === 'string' ? v : null;
    };
    const num = (k: string) => {
      const v = parsed[k];
      return typeof v === 'number' ? v : null;
    };

    const firstName = g?.first_name?.trim() || str('firstName');
    const lastName = g?.last_name?.trim() || str('lastName');
    const middleName = g?.middle_name?.trim() || str('middleName');
    const fullName = g?.full_name?.trim() || str('fullName');
    const birth = g?.birth_date?.slice(0, 10) || str('birthDate')?.slice(0, 10);
    const nationality = row.nationality_code?.trim() || g?.nationality_code?.trim() || str('nationalityCode');
    const issuing = row.issuing_country_code?.trim() || str('issuingCountryCode');
    const gender = g?.gender || str('gender');
    const expiry = row.expiry_date?.slice(0, 10) || str('expiryDate')?.slice(0, 10);
    const confidence =
      row.scan_confidence != null
        ? `${Math.round(row.scan_confidence * 100)}%`
        : num('confidence') != null
          ? `${Math.round((num('confidence') as number) * 100)}%`
          : null;

    const scannedAt = new Date(row.created_at).toLocaleString(
      i18n.language === 'tr' ? 'tr-TR' : 'en-GB',
      { dateStyle: 'medium', timeStyle: 'short' }
    );

    const statusColor = scanStatusColor(row.scan_status);

    return {
      titleName: guestDisplayName(g) || fullName || t('staffPassportCardGuest'),
      statusColor,
      rows: [
        { label: t('staffPassportsDetailFullName'), value: dash(fullName) },
        { label: t('kbsGuestFirstName'), value: dash(firstName) },
        { label: t('kbsGuestLastName'), value: dash(lastName) },
        ...(middleName ? [{ label: t('staffPassportsDetailMiddleName'), value: middleName }] : []),
        { label: t('staffPassportsBirthDate'), value: birth ? formatDateShort(birth) : '—' },
        { label: t('nationality'), value: dash(nationality) },
        ...(issuing ? [{ label: t('staffPassportsDetailIssuingCountry'), value: issuing }] : []),
        ...(gender ? [{ label: t('staffPassportsDetailGender'), value: genderLabelTr(gender) }] : []),
        { label: t('staffPassportsDetailDocType'), value: documentTypeLabelTr(row.document_type) },
        { label: t('staffPassportCardDoc'), value: dash(row.document_number) },
        { label: t('staffPassportsDetailExpiry'), value: expiry ? formatDateShort(expiry) : '—' },
        { label: t('staffPassportsDetailScanStatus'), value: scanStatusLabelTr(row.scan_status) },
        { label: t('staffPassportsDetailScannedAt'), value: scannedAt },
        ...(confidence ? [{ label: t('staffPassportsDetailConfidence'), value: confidence }] : []),
      ] as { label: string; value: string }[],
      rawMrz: row.raw_mrz?.trim() || str('rawMrz') || null,
    };
  }, [row, t, i18n.language]);

  if (!row) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={[styles.typeIcon, { backgroundColor: fields.statusColor + '18' }]}>
              <Ionicons
                name={row.document_type === 'passport' ? 'book-outline' : 'card-outline'}
                size={22}
                color={fields.statusColor}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.sheetTitle}>{t('staffPassportsDetailTitle')}</Text>
              <Text style={styles.sheetSub} numberOfLines={2}>
                {fields.titleName}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={t('close')}>
              <Ionicons name="close" size={24} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {fields.rows.map((r) => (
              <DetailRow key={r.label} label={r.label} value={r.value} />
            ))}
            {fields.rawMrz ? (
              <View style={styles.mrzBlock}>
                <Text style={styles.rowLbl}>{t('staffPassportsDetailMrz')}</Text>
                <Text style={styles.mrzText} selectable>
                  {fields.rawMrz}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>{t('close')}</Text>
            </Pressable>
            {onEdit ? (
              <Pressable style={styles.btnPrimary} onPress={onEdit}>
                <Ionicons name="create-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>{t('edit')}</Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: 10,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  typeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 17, fontWeight: '900', color: theme.colors.text },
  sheetSub: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary, marginTop: 2 },
  scroll: { paddingHorizontal: 20, maxHeight: 440 },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  rowLbl: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  rowVal: { fontSize: 16, fontWeight: '700', color: theme.colors.text, lineHeight: 22 },
  mrzBlock: {
    marginTop: 8,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  mrzText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350f',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 6,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  btnGhost: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  btnGhostText: { fontWeight: '800', color: theme.colors.text },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#d97706',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
