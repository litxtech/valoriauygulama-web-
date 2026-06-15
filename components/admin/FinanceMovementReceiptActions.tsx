import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import type { FinanceMovementReceiptInput } from '@/lib/financeMovementReceiptPdf';
import {
  shareFinanceMovementReceiptPdf,
  shareFinanceMovementReceiptWhatsApp,
  printFinanceMovementReceipt,
  mailFinanceMovementReceiptToPrinter,
} from '@/lib/financeMovementReceiptPdf';

type Props = {
  input?: FinanceMovementReceiptInput;
  /** Liste satırı: ilk tıklamada yüklenir */
  loadInput?: () => Promise<FinanceMovementReceiptInput>;
  /** Kompakt ikon satırı (PDF, yazdır, yazıcı mail, WhatsApp) */
  compact?: boolean;
};

export function FinanceMovementReceiptActions({ input, loadInput, compact }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'print' | 'mail' | 'whatsapp' | null>(null);
  const [cachedInput, setCachedInput] = useState<FinanceMovementReceiptInput | null>(input ?? null);

  useEffect(() => {
    if (input) setCachedInput(input);
  }, [input]);

  const resolveInput = async (): Promise<FinanceMovementReceiptInput> => {
    if (cachedInput) return cachedInput;
    if (input) {
      setCachedInput(input);
      return input;
    }
    if (!loadInput) throw new Error('Belge verisi yok');
    const loaded = await loadInput();
    setCachedInput(loaded);
    return loaded;
  };

  const run = async (action: 'pdf' | 'print' | 'mail' | 'whatsapp') => {
    if (busy) return;
    setBusy(action);
    try {
      const data = await resolveInput();
      if (action === 'pdf') await shareFinanceMovementReceiptPdf(data);
      else if (action === 'print') await printFinanceMovementReceipt(data);
      else if (action === 'mail') await mailFinanceMovementReceiptToPrinter(data);
      else await shareFinanceMovementReceiptWhatsApp(data);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      setBusy(null);
    }
  };

  if (compact) {
    const iconBtn = (
      action: 'pdf' | 'print' | 'mail' | 'whatsapp',
      icon: keyof typeof Ionicons.glyphMap,
      label: string,
      iconColor?: string
    ) => (
      <TouchableOpacity
        key={action}
        style={[styles.iconBtn, busy && styles.disabled]}
        onPress={() => run(action)}
        disabled={!!busy}
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
      <View style={styles.compactWrap}>
        <View style={styles.compactRow}>
          {iconBtn('pdf', 'document-text-outline', 'PDF')}
          {iconBtn('print', 'print-outline', 'Yazdır')}
          {iconBtn('mail', 'mail-outline', 'Yazıcı mail')}
          {iconBtn('whatsapp', 'logo-whatsapp', 'WhatsApp', '#25D366')}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Belge — tek ödeme / tahsilat</Text>
      <Text style={styles.hint}>
        Kurumsal A4 — yalnızca bu işlem. Yazıcı mail: diğer modüllerle aynı HP/e-posta (hafif PDF, fiş
        fotoğrafları gömülmez). Yazdır: cihaz yazıcı menüsü.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPdf, busy && styles.disabled]}
          onPress={() => run('pdf')}
          disabled={!!busy}
          activeOpacity={0.88}
        >
          {busy === 'pdf' ? (
            <ActivityIndicator color={adminTheme.colors.primary} />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.primary} />
              <Text style={styles.btnTextPdf}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnMail, busy && styles.disabled]}
          onPress={() => run('mail')}
          disabled={!!busy}
          activeOpacity={0.88}
        >
          {busy === 'mail' ? (
            <ActivityIndicator color={adminTheme.colors.primary} />
          ) : (
            <>
              <Ionicons name="mail-outline" size={18} color={adminTheme.colors.primary} />
              <Text style={styles.btnTextMail}>Yazıcı mail</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
      <View style={[styles.row, styles.rowSecond]}>
        <TouchableOpacity
          style={[styles.btn, styles.btnPrint, busy && styles.disabled]}
          onPress={() => run('print')}
          disabled={!!busy}
          activeOpacity={0.88}
        >
          {busy === 'print' ? (
            <ActivityIndicator color={adminTheme.colors.text} />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color={adminTheme.colors.text} />
              <Text style={styles.btnTextPrint}>Yazdır</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, styles.btnWa, busy && styles.disabled]}
          onPress={() => run('whatsapp')}
          disabled={!!busy}
          activeOpacity={0.88}
        >
          {busy === 'whatsapp' ? (
            <ActivityIndicator color="#25D366" />
          ) : (
            <>
              <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
              <Text style={styles.btnTextWa}>WhatsApp</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  title: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  hint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnPdf: { borderColor: adminTheme.colors.border, backgroundColor: adminTheme.colors.surfaceSecondary },
  btnMail: { borderColor: '#c7d2fe', backgroundColor: '#eef2ff' },
  btnPrint: { borderColor: adminTheme.colors.border, backgroundColor: adminTheme.colors.surface },
  btnWa: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  btnTextPdf: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  btnTextMail: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.primary },
  btnTextPrint: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  btnTextWa: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  disabled: { opacity: 0.6 },
  compactWrap: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: adminTheme.colors.border },
  compactRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
});
