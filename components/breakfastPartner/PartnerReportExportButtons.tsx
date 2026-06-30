import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  exportBreakfastPartnerReport,
  type PartnerActivityReportData,
} from '@/lib/breakfastPartnerReportPdf';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  loadReport: () => Promise<PartnerActivityReportData>;
  disabled?: boolean;
  compact?: boolean;
  hint?: string;
};

type BusyAction = 'share' | 'print' | 'printer' | null;

export function PartnerReportExportButtons({ loadReport, disabled, compact, hint }: Props) {
  const [busy, setBusy] = useState<BusyAction>(null);

  const run = async (action: Exclude<BusyAction, null>) => {
    if (disabled || busy) return;
    setBusy(action);
    try {
      const data = await loadReport();
      await exportBreakfastPartnerReport(data, action);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Rapor oluşturulamadı');
    } finally {
      setBusy(null);
    }
  };

  const btn = (
    action: Exclude<BusyAction, null>,
    icon: keyof typeof Ionicons.glyphMap,
    label: string
  ) => (
    <TouchableOpacity
      key={action}
      style={[styles.btn, compact && styles.btnCompact, (disabled || busy) && styles.btnDisabled]}
      onPress={() => void run(action)}
      disabled={!!disabled || !!busy}
      activeOpacity={0.85}
      accessibilityLabel={label}
    >
      {busy === action ? (
        <ActivityIndicator size="small" color={partnerTheme.accent} />
      ) : (
        <>
          <Ionicons name={icon} size={compact ? 17 : 18} color={partnerTheme.accent} />
          <Text style={[styles.btnText, compact && styles.btnTextCompact]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      {!compact ? (
        <View style={styles.titleRow}>
          <Ionicons name="document-text-outline" size={16} color={partnerTheme.accent} />
          <Text style={styles.title}>İşlem özeti</Text>
        </View>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={[styles.row, compact && styles.rowCompact]}>
        {btn('share', 'document-text-outline', 'PDF')}
        {btn('print', 'print-outline', 'Yazdır')}
        {btn('printer', 'mail-outline', 'Yazıcıya gönder')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: partnerTheme.text, fontWeight: '800', fontSize: 14 },
  hint: { color: partnerTheme.muted, fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8 },
  rowCompact: { gap: 6 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  btnCompact: { paddingVertical: 10, borderRadius: partnerRadii.sm },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: partnerTheme.text, fontWeight: '700', fontSize: 12 },
  btnTextCompact: { fontSize: 11 },
});
