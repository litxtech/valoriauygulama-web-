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
import {
  archivePaymentRequest,
  cancelPaymentRequest,
  fetchPaymentRequestById,
  formatPaymentAmount,
  isPaymentArchived,
  subscribePaymentRequestStatus,
  type PaymentRequestRow,
} from '@/lib/payments';
import { paymentKindLabel, paymentStatusLabel, paymentText } from '@/lib/paymentsI18n';
import { paymentShareUrl } from '@/lib/paymentOpenUrl';

const ACCENT = '#635bff';

export function PaymentSingleQrView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [row, setRow] = useState<PaymentRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchPaymentRequestById(id);
      setRow(data);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!id || !row || row.status === 'paid' || isPaymentArchived(row)) return;
    return subscribePaymentRequestStatus(id, (patch) => {
      setRow((prev) => (prev ? { ...prev, ...patch } : prev));
    });
  }, [id, row]);

  const shareLinkUrl = row ? paymentShareUrl(row.public_token, row.pay_url) : '';

  const copyLink = async () => {
    if (!shareLinkUrl) return;
    await Clipboard.setStringAsync(shareLinkUrl);
    Alert.alert('', paymentText('paymentsCopied'));
  };

  const shareLink = async () => {
    if (!shareLinkUrl) return;
    await Share.share({ message: shareLinkUrl, url: shareLinkUrl });
  };

  if (loading || !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={ACCENT} />
      </View>
    );
  }

  const archived = isPaymentArchived(row);
  const isPaid = row.status === 'paid';
  const isPending = row.status === 'pending' && !archived;
  const payUrl = !archived && row ? paymentShareUrl(row.public_token, row.pay_url) : '';

  const onCancel = () => {
    Alert.alert(paymentText('paymentsCancelLink'), paymentText('paymentsCancelLinkConfirm'), [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: () => {
          setActing(true);
          void cancelPaymentRequest(row.id)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message))
            .finally(() => setActing(false));
        },
      },
    ]);
  };

  const onArchive = () => {
    Alert.alert(paymentText('paymentsClosePaidLink'), paymentText('paymentsClosePaidLinkConfirm'), [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Kapat',
        onPress: () => {
          setActing(true);
          void archivePaymentRequest(row.id)
            .then(() => load())
            .catch((e) => Alert.alert('Hata', (e as Error).message))
            .finally(() => setActing(false));
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={isPaid ? ['#22c55e22', '#22c55e08'] : ['#635bff18', '#635bff06']}
        style={styles.glow}
      />

      <View style={[styles.statusBanner, isPaid && styles.statusBannerPaid]}>
        <Ionicons name={isPaid ? 'checkmark-circle' : 'time-outline'} size={22} color={isPaid ? '#22c55e' : '#f59e0b'} />
        <Text style={[styles.statusText, isPaid && styles.statusTextPaid]}>{paymentStatusLabel(row.status)}</Text>
      </View>

      <Text style={styles.amount}>{formatPaymentAmount(Number(row.amount), row.currency)}</Text>
      <Text style={styles.title}>{row.title}</Text>
      {row.description ? <Text style={styles.desc}>{row.description}</Text> : null}
      <Text style={styles.kind}>{paymentKindLabel(row.service_kind)} · {paymentText('paymentsQrModeSingle')}</Text>

      {isPending && payUrl ? (
        <View style={styles.qrWrap}>
          <View style={styles.qrCard}>
            <QRCode value={payUrl} size={220} backgroundColor="#fff" color="#111" />
          </View>
          <Text style={styles.hint}>{paymentText('paymentsScanHint')}</Text>
        </View>
      ) : null}

      {payUrl ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void copyLink()} activeOpacity={0.85}>
            <Ionicons name="copy-outline" size={18} color={ACCENT} />
            <Text style={styles.actionText}>{paymentText('paymentsCopyLink')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => void shareLink()} activeOpacity={0.85}>
            <Ionicons name="share-outline" size={18} color={ACCENT} />
            <Text style={styles.actionText}>{paymentText('paymentsShareLink')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {row.expires_at && isPending ? (
        <Text style={styles.expires}>Son: {new Date(row.expires_at).toLocaleString('tr-TR')}</Text>
      ) : null}
      {row.paid_at ? (
        <Text style={styles.paidAt}>Ödeme: {new Date(row.paid_at).toLocaleString('tr-TR')}</Text>
      ) : null}

      {archived ? (
        <Text style={styles.archivedNote}>Bu link kapatıldı — misafir tekrar ödeyemez.</Text>
      ) : null}

      {isPending ? (
        <TouchableOpacity style={styles.closeBtn} onPress={onCancel} disabled={acting}>
          <Ionicons name="close-circle-outline" size={20} color="#fff" />
          <Text style={styles.closeBtnText}>{paymentText('paymentsCancelLink')}</Text>
        </TouchableOpacity>
      ) : null}

      {!archived && (isPaid || row.status === 'refunded' || row.status === 'failed' || row.status === 'expired') ? (
        <TouchableOpacity style={styles.closeBtn} onPress={onArchive} disabled={acting}>
          {acting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="archive-outline" size={20} color="#fff" />
              <Text style={styles.closeBtnText}>{paymentText('paymentsClosePaidLink')}</Text>
            </>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, alignItems: 'center', padding: 20 },
  glow: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f59e0b18',
    marginTop: 8,
  },
  statusBannerPaid: { backgroundColor: '#22c55e18' },
  statusText: { fontSize: 14, fontWeight: '800', color: '#f59e0b' },
  statusTextPaid: { color: '#22c55e' },
  amount: { fontSize: 36, fontWeight: '900', color: ACCENT, marginTop: 20 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginTop: 8, textAlign: 'center' },
  desc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
  kind: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 8 },
  qrWrap: { alignItems: 'center', marginTop: 24 },
  qrCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
  hint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 14, textAlign: 'center', maxWidth: 280 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACCENT + '40',
    backgroundColor: theme.colors.surface,
  },
  actionText: { fontSize: 13, fontWeight: '800', color: ACCENT },
  expires: { fontSize: 11, color: theme.colors.textMuted, marginTop: 16 },
  paidAt: { fontSize: 12, fontWeight: '700', color: '#22c55e', marginTop: 12 },
  archivedNote: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 16, textAlign: 'center' },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    width: '100%',
    maxWidth: 320,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#64748b',
  },
  closeBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
