import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  printFinanceCheck,
  shareFinanceCheck,
  shareFinanceCheckPdf,
  type FinanceCheckPdfInput,
} from '@/lib/financeCheckPdf';

type Props = {
  data: FinanceCheckPdfInput;
  disabled?: boolean;
};

export function FinanceCheckExportButtons({ data, disabled }: Props) {
  const [busy, setBusy] = useState<'paylas' | 'print' | 'pdf' | null>(null);

  const run = async (action: 'paylas' | 'print' | 'pdf') => {
    if (disabled || busy) return;
    setBusy(action);
    try {
      if (action === 'paylas') await shareFinanceCheck(data);
      else if (action === 'print') await printFinanceCheck(data);
      else await shareFinanceCheckPdf(data);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      setBusy(null);
    }
  };

  const btn = (
    action: 'paylas' | 'print' | 'pdf',
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    iconColor?: string,
  ) => (
    <TouchableOpacity
      key={action}
      style={[styles.btn, (disabled || busy) && styles.btnDisabled]}
      onPress={() => void run(action)}
      disabled={!!disabled || !!busy}
      activeOpacity={0.85}
    >
      {busy === action ? (
        <ActivityIndicator size="small" color={iconColor ?? adminTheme.colors.primary} />
      ) : (
        <Ionicons name={icon} size={18} color={iconColor ?? adminTheme.colors.primary} />
      )}
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.wrap}>
      {btn('paylas', 'share-outline', 'Paylaş', '#0369a1')}
      {btn('print', 'print-outline', 'Yazdır')}
      {btn('pdf', 'document-text-outline', 'PDF', '#b45309')}
    </View>
  );
}

const T = adminTheme;

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    minHeight: 58,
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { fontSize: 11, fontWeight: '800', color: T.colors.text, textAlign: 'center' },
});
