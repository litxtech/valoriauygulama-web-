import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Share,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { formatPaymentAmount } from '@/lib/payments';
import {
  closePaymentQrStand,
  fetchPaymentQrStand,
  fetchPaymentQrStandStats,
  paymentQrStandOpenUrl,
  subscribePaymentQrStand,
  type PaymentQrStandRow,
} from '@/lib/paymentQrStands';
import { paymentKindLabel, paymentText } from '@/lib/paymentsI18n';
import { isSupabaseUnavailableError } from '@/lib/supabaseTransientErrors';

const ACCENT = '#635bff';

export function PaymentQrStandView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<PaymentQrStandRow | null>(null);
  const [paidCount, setPaidCount] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const [stand, stats] = await Promise.all([fetchPaymentQrStand(id), fetchPaymentQrStandStats(id)]);
      if (!stand) {
        setRow(null);
        setLoadError('Sabit QR kaydı bulunamadı.');
        return;
      }
      setRow(stand);
      setPaidCount(stats.paid_count);
      setPaidTotal(stats.paid_total);
    } catch (e) {
      const msg = (e as Error).message || 'Yüklenemedi';
      setLoadError(
        isSupabaseUnavailableError(msg)
          ? 'Sunucu geçici olarak yanıt vermiyor. Birkaç saniye sonra tekrar deneyin.'
          : msg
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    return subscribePaymentQrStand(id, () => {
      void load();
    });
  }, [id, load]);

  const openUrl = row ? paymentQrStandOpenUrl(row.public_token) : '';
  const isActive = row?.status === 'active';

  const copyLink = async () => {
    if (!openUrl) return;
    await Clipboard.setStringAsync(openUrl);
    Alert.alert('', paymentText('paymentsCopied'));
  };

  const shareLink = async () => {
    if (!openUrl) return;
    await Share.share({ message: openUrl, url: openUrl });
  };

  const closeQr = () => {
    if (!row?.id) return;
    Alert.alert(paymentText('paymentsCloseQr'), paymentText('paymentsCloseQrConfirm'), [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: paymentText('paymentsCloseQr'),
        style: 'destructive',
        onPress: () => {
          setClosing(true);
          void closePaymentQrStand(row.id)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message))
            .finally(() => setClosing(false));
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  if (loadError || !row) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.errorTitle}>{loadError ?? 'Kayıt bulunamadı'}</Text>
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => {
            setLoading(true);
            void load();
          }}
        >
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryBtnText}>Tekrar dene</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isActive ? ['#635bff18', '#635bff06'] : ['#94a3b822', '#94a3b808']}
        style={styles.glow}
      />

      <View style={[styles.statusBanner, isActive ? styles.statusActive : styles.statusClosed]}>
        <Ionicons
          name={isActive ? 'radio-button-on' : 'close-circle'}
          size={20}
          color={isActive ? '#16a34a' : '#64748b'}
        />
        <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
          {isActive ? paymentText('paymentsStandingActive') : paymentText('paymentsStandingClosed')}
        </Text>
      </View>

      <Text style={styles.amount}>{formatPaymentAmount(Number(row.amount), row.currency)}</Text>
      <Text style={styles.title}>{row.title}</Text>
      {row.description ? <Text style={styles.desc}>{row.description}</Text> : null}
      <Text style={styles.kind}>{paymentKindLabel(row.service_kind)} · {paymentText('paymentsQrModeStanding')}</Text>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{paidCount}</Text>
          <Text style={styles.statLabel}>Ödeme</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{formatPaymentAmount(paidTotal, row.currency)}</Text>
          <Text style={styles.statLabel}>Toplam</Text>
        </View>
      </View>

      {isActive && openUrl ? (
        <View style={styles.qrWrap}>
          <View style={styles.qrCard}>
            <QRCode value={openUrl} size={220} backgroundColor="#fff" color="#111" />
          </View>
          <Text style={styles.hint}>{paymentText('paymentsStandingScanHint')}</Text>
        </View>
      ) : (
        <View style={styles.closedBox}>
          <Ionicons name="lock-closed-outline" size={32} color="#64748b" />
          <Text style={styles.closedText}>QR kapatıldı — yeni ödeme alınamaz</Text>
        </View>
      )}

      {openUrl ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void copyLink()}>
            <Ionicons name="copy-outline" size={18} color={ACCENT} />
            <Text style={styles.actionText}>{paymentText('paymentsCopyLink')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void shareLink()}>
            <Ionicons name="share-outline" size={18} color={ACCENT} />
            <Text style={styles.actionText}>{paymentText('paymentsShareLink')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {isActive ? (
        <TouchableOpacity style={styles.closeBtn} onPress={closeQr} disabled={closing}>
          {closing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="stop-circle-outline" size={20} color="#fff" />
              <Text style={styles.closeBtnText}>{paymentText('paymentsCloseQr')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 20, alignItems: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorTitle: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: ACCENT,
  },
  retryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  glow: { ...StyleSheet.absoluteFillObject },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    marginBottom: 12,
  },
  statusActive: { backgroundColor: '#dcfce7' },
  statusClosed: { backgroundColor: '#f1f5f9' },
  statusText: { fontWeight: '800', fontSize: 13, color: '#64748b' },
  statusTextActive: { color: '#16a34a' },
  amount: { fontSize: 36, fontWeight: '900', color: ACCENT },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginTop: 4, textAlign: 'center' },
  desc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
  kind: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 12, marginTop: 16, width: '100%' },
  statBox: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statValue: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  qrWrap: { alignItems: 'center', marginTop: 20, gap: 12 },
  qrCard: { padding: 16, backgroundColor: '#fff', borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  hint: { fontSize: 13, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  closedBox: { alignItems: 'center', gap: 10, marginTop: 24, padding: 24 },
  closedText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16, width: '100%' },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: ACCENT + '33',
  },
  actionText: { fontSize: 13, fontWeight: '700', color: ACCENT },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#64748b',
  },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
