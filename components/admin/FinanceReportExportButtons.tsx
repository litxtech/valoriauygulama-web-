import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  createFinanceReportPdfUri,
  runFinanceReportAction,
  FINANCE_REPORT_KIND_LABELS,
  type FinanceReportKindFilter,
} from '@/lib/financeCounterpartyReport';

const KIND_ORDER: FinanceReportKindFilter[] = ['paid', 'received', 'all'];

const KIND_FILE_SUFFIX: Record<FinanceReportKindFilter, string> = {
  paid: 'odenen',
  received: 'alinan',
  all: 'tumu',
};

type Props = {
  getHtml: (kindFilter: FinanceReportKindFilter) => string | Promise<string>;
  fileName: string;
  mailSubject: string;
  shareDialogTitle: string;
  disabled?: boolean;
  defaultKindFilter?: FinanceReportKindFilter;
  /** Tek satır ikon düzeni — hızlı ödeme vb. */
  compact?: boolean;
};

export function FinanceReportExportButtons({
  getHtml,
  fileName,
  mailSubject,
  shareDialogTitle,
  disabled,
  defaultKindFilter = 'paid',
  compact = false,
}: Props) {
  const [kindFilter, setKindFilter] = useState<FinanceReportKindFilter>(defaultKindFilter);
  const [busy, setBusy] = useState<'share' | 'print' | 'mail' | 'whatsapp' | null>(null);
  const awaitingNativeUi = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && awaitingNativeUi.current) {
        awaitingNativeUi.current = false;
        setBusy(null);
      }
    });
    return () => sub.remove();
  }, []);

  const run = async (action: 'share' | 'print' | 'mail' | 'whatsapp') => {
    if (disabled || busy) return;
    setBusy(action);
    awaitingNativeUi.current = false;
    const kindLabel = FINANCE_REPORT_KIND_LABELS[kindFilter];
    const exportFileName = `${fileName}-${KIND_FILE_SUFFIX[kindFilter]}`;
    try {
      const html = await getHtml(kindFilter);
      const pdfUri = await createFinanceReportPdfUri(html);
      setBusy(null);
      awaitingNativeUi.current = true;
      await runFinanceReportAction({
        html,
        pdfUri,
        fileName: exportFileName,
        mailSubject: `${mailSubject} (${kindLabel})`,
        shareDialogTitle: `${shareDialogTitle} — ${kindLabel}`,
        action,
      });
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      awaitingNativeUi.current = false;
      setBusy(null);
    }
  };

  const btn = (
    action: 'share' | 'print' | 'mail' | 'whatsapp',
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    iconColor?: string
  ) => (
    <TouchableOpacity
      key={action}
      style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
      onPress={() => run(action)}
      disabled={!!disabled || !!busy}
      activeOpacity={0.85}
    >
      {busy === action ? (
        <ActivityIndicator size="small" color={iconColor ?? adminTheme.colors.primary} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor ?? adminTheme.colors.primary} />
      )}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  const kindRow = (
    <View style={[styles.kindRow, compact && styles.kindRowCompact]}>
      {KIND_ORDER.map((k) => (
        <TouchableOpacity
          key={k}
          style={[styles.kindChip, compact && styles.kindChipCompact, kindFilter === k && styles.kindChipOn]}
          onPress={() => setKindFilter(k)}
          disabled={!!busy}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.kindChipText,
              compact && styles.kindChipTextCompact,
              kindFilter === k && styles.kindChipTextOn,
            ]}
          >
            {FINANCE_REPORT_KIND_LABELS[k]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  if (compact) {
    const iconBtn = (
      action: 'share' | 'print' | 'mail' | 'whatsapp',
      icon: keyof typeof Ionicons.glyphMap,
      label: string,
      iconColor?: string
    ) => (
      <TouchableOpacity
        key={action}
        style={[styles.iconBtn, (disabled || busy) && styles.btnDisabled]}
        onPress={() => run(action)}
        disabled={!!disabled || !!busy}
        accessibilityLabel={label}
        activeOpacity={0.85}
      >
        {busy === action ? (
          <ActivityIndicator size="small" color={iconColor ?? adminTheme.colors.primary} />
        ) : (
          <Ionicons name={icon} size={20} color={iconColor ?? adminTheme.colors.primary} />
        )}
      </TouchableOpacity>
    );

    return (
      <View style={styles.wrapCompact}>
        {kindRow}
        <View style={styles.iconRow}>
          {iconBtn('share', 'document-text-outline', 'PDF')}
          {iconBtn('print', 'print-outline', 'Yazdır')}
          {iconBtn('mail', 'mail-outline', 'Yazıcı mail')}
          {iconBtn('whatsapp', 'logo-whatsapp', 'WhatsApp', '#25D366')}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.kindLbl}>Rapor türü</Text>
      {kindRow}
      <View style={styles.row}>
        {btn('share', 'document-text-outline', 'PDF')}
        {btn('print', 'print-outline', 'Yazdır')}
      </View>
      <View style={styles.row}>
        {btn('mail', 'mail-outline', 'Yazıcı mail')}
        {btn('whatsapp', 'logo-whatsapp', 'WhatsApp', '#25D366')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginBottom: 16 },
  wrapCompact: {
    gap: 6,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  kindRowCompact: { gap: 6 },
  kindChipCompact: { paddingVertical: 6, borderRadius: 8 },
  kindChipTextCompact: { fontSize: 11 },
  iconRow: { flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  kindLbl: {
    fontSize: 11,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 2,
  },
  kindRow: { flexDirection: 'row', gap: 8 },
  kindChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  kindChipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  kindChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  kindChipTextOn: { color: '#fff' },
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
});
