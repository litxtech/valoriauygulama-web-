import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CHECK_DIR_META,
  checkStatusTone,
  daysUntilDue,
  dueUrgencyLabel,
} from '@/lib/financeCheckTheme';
import {
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  fmtMoneyTry,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import { adminTheme } from '@/constants/adminTheme';
import type { FinanceCheckPreviewData } from '@/lib/financeCheckPdf';

export type { FinanceCheckPreviewData };

type Props = {
  data: FinanceCheckPreviewData;
  onImagePress?: (uri: string) => void;
  large?: boolean;
};

export function FinanceCheckPreviewCard({ data, onImagePress, large = false }: Props) {
  const dir = CHECK_DIR_META[data.direction];
  const st = checkStatusTone(data.status);
  const days = daysUntilDue(data.due_date ?? null);
  const urgency = dueUrgencyLabel(days);
  const images = data.image_urls ?? [];

  return (
    <View style={[styles.shell, large && styles.shellLarge]}>
      <LinearGradient colors={dir.gradient} style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.dirBadge}>
            <Ionicons name={dir.icon} size={16} color="#fff" />
            <Text style={styles.dirText}>{CHECK_DIRECTION_LABELS[data.direction]}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
            <Text style={styles.statusText}>{CHECK_STATUS_LABELS[data.status]}</Text>
          </View>
        </View>
        <Text style={styles.headerHint}>ÇEK ÖNİZLEME</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Tutar</Text>
          <Text style={[styles.amount, large && styles.amountLarge]}>{fmtMoneyTry(Number(data.amount))}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldKey}>Lehtar / Karşı taraf</Text>
          <Text style={styles.fieldVal}>{data.counterparty_name || '—'}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridCell}>
            <Text style={styles.fieldKey}>Düzenleme tarihi</Text>
            <Text style={styles.fieldVal}>{data.issue_date ? formatDateShort(data.issue_date) : '—'}</Text>
          </View>
          <View style={styles.gridCell}>
            <Text style={styles.fieldKey}>Vade tarihi</Text>
            <Text style={[styles.fieldVal, urgency && data.status !== 'paid' ? styles.dueWarn : null]}>
              {data.due_date ? formatDateShort(data.due_date) : '—'}
            </Text>
          </View>
        </View>

        {(data.check_number || data.bank_name || data.branch_name) && (
          <View style={styles.bankBox}>
            {data.check_number ? (
              <Text style={styles.bankLine}>
                <Text style={styles.bankKey}>Çek no: </Text>
                {data.check_number}
              </Text>
            ) : null}
            {data.bank_name ? (
              <Text style={styles.bankLine}>
                <Text style={styles.bankKey}>Banka: </Text>
                {data.bank_name}
                {data.branch_name ? ` · ${data.branch_name}` : ''}
              </Text>
            ) : null}
          </View>
        )}

        {data.purpose ? (
          <View style={styles.field}>
            <Text style={styles.fieldKey}>Amaç</Text>
            <Text style={styles.fieldValMultiline}>{data.purpose}</Text>
          </View>
        ) : null}

        {data.notes ? (
          <View style={styles.field}>
            <Text style={styles.fieldKey}>Not</Text>
            <Text style={styles.fieldValMultiline}>{data.notes}</Text>
          </View>
        ) : null}

        {urgency && data.status !== 'paid' && data.status !== 'cancelled' ? (
          <View style={[styles.urgency, { backgroundColor: st.bg }]}>
            <Ionicons name="time-outline" size={14} color={st.color} />
            <Text style={[styles.urgencyText, { color: st.color }]}>{urgency}</Text>
          </View>
        ) : null}

        {images.length > 0 ? (
          <View style={styles.imagesBlock}>
            <Text style={styles.fieldKey}>Çek görseli</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
              {images.map((uri) => (
                <TouchableOpacity
                  key={uri}
                  onPress={() => onImagePress?.(uri)}
                  activeOpacity={onImagePress ? 0.85 : 1}
                  disabled={!onImagePress}
                >
                  <Image source={{ uri }} style={[styles.thumb, large && styles.thumbLarge]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.footerMicr}>
          <Text style={styles.micrText}>
            {data.check_number ? `№ ${data.check_number}` : 'Çek kaydı'}
            {data.due_date ? ` · Vade ${formatDateShort(data.due_date)}` : ''}
          </Text>
        </View>
      </View>
    </View>
  );
}

const T = adminTheme;

const styles = StyleSheet.create({
  shell: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: T.colors.border,
    backgroundColor: T.colors.surface,
  },
  shellLarge: { marginBottom: 8 },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  dirBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dirText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerHint: {
    marginTop: 10,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.65)',
  },
  body: { padding: 16 },
  amountRow: { marginBottom: 14 },
  amountLabel: { fontSize: 12, fontWeight: '700', color: T.colors.textMuted, marginBottom: 4 },
  amount: { fontSize: 28, fontWeight: '900', color: T.colors.text, letterSpacing: -0.5 },
  amountLarge: { fontSize: 34 },
  field: { marginBottom: 12 },
  fieldKey: { fontSize: 11, fontWeight: '700', color: T.colors.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  fieldVal: { fontSize: 16, fontWeight: '700', color: T.colors.text },
  fieldValMultiline: { fontSize: 14, lineHeight: 21, color: T.colors.textSecondary },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gridCell: { flex: 1 },
  dueWarn: { color: '#b45309' },
  bankBox: {
    backgroundColor: T.colors.surfaceTertiary,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  bankLine: { fontSize: 14, color: T.colors.text, marginBottom: 4 },
  bankKey: { fontWeight: '800', color: T.colors.textSecondary },
  urgency: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  urgencyText: { fontSize: 12, fontWeight: '700' },
  imagesBlock: { marginTop: 4, marginBottom: 8 },
  imageRow: { gap: 8, paddingVertical: 4 },
  thumb: { width: 96, height: 64, borderRadius: 8, backgroundColor: T.colors.surfaceTertiary },
  thumbLarge: { width: 140, height: 96 },
  footerMicr: {
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: T.colors.border,
  },
  micrText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: T.colors.textMuted,
    letterSpacing: 0.5,
  },
});
