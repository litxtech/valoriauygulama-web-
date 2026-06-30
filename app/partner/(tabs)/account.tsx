import { useCallback, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PartnerEmptyState, PartnerGlassCard, PartnerPrimaryButton, PartnerScreenTitle, PartnerSectionTitle } from '@/components/breakfastPartner/PartnerUi';
import { PartnerReportExportButtons } from '@/components/breakfastPartner/PartnerReportExportButtons';
import { loadPartnerPortalActivityReport } from '@/lib/breakfastPartnerReportPdf';
import {
  fmtPartnerMoney,
  formatPartnerDate,
  type PartnerPaymentRow,
} from '@/lib/breakfastPartner';
import {
  getPartnerAccountCache,
  loadPartnerAccountSnapshot,
  refreshPartnerAccountAfterPayment,
  type PartnerAccountSnapshot,
} from '@/lib/partnerAccountCache';
import { PartnerStripeCheckoutHost } from '@/components/payment/PartnerStripeCheckoutHost';
import { usePartnerStripeCheckout } from '@/hooks/usePartnerStripeCheckout';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';

function PaymentRow({ row }: { row: PartnerPaymentRow }) {
  return (
    <View style={styles.payRow}>
      <View style={styles.payIcon}>
        <Ionicons name="arrow-down-circle" size={20} color={partnerTheme.success} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.payTitle}>{row.description?.trim() || 'Tahsilat'}</Text>
        <Text style={styles.payMeta}>{formatPartnerDate(row.movementDate)}</Text>
      </View>
      <Text style={styles.payAmount}>-{fmtPartnerMoney(row.amount)}</Text>
    </View>
  );
}

export default function PartnerAccountScreen() {
  const insets = useSafeAreaInsets();
  const partner = usePartnerAuthStore((s) => s.partner)!;
  const hotelId = partner.hotel.id;
  const cached = getPartnerAccountCache(hotelId);

  const [openBalance, setOpenBalance] = useState(cached?.openBalance ?? 0);
  const [monthAmount, setMonthAmount] = useState(cached?.monthAmount ?? 0);
  const [monthGuests, setMonthGuests] = useState(cached?.monthGuests ?? 0);
  const [totalAmount, setTotalAmount] = useState(cached?.totalAmount ?? 0);
  const [payments, setPayments] = useState<PartnerPaymentRow[]>(cached?.payments ?? []);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const openBalanceRef = useRef(openBalance);
  openBalanceRef.current = openBalance;

  const applySnapshot = useCallback((snap: PartnerAccountSnapshot) => {
    setOpenBalance(snap.openBalance);
    setMonthAmount(snap.monthAmount);
    setMonthGuests(snap.monthGuests);
    setTotalAmount(snap.totalAmount);
    setPayments(snap.payments);
  }, []);

  const load = useCallback(async (opts?: { force?: boolean }) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const snap = await loadPartnerAccountSnapshot(hotelId, { force: opts?.force });
      applySnapshot(snap);
    } finally {
      inFlightRef.current = false;
      setRefreshing(false);
    }
  }, [applySnapshot, hotelId]);

  const { startPayment, payingKey, checkout, dismissCheckout, finishCheckout } = usePartnerStripeCheckout(
    async (result) => {
      if (result.status !== 'success') return;
      const snap = await refreshPartnerAccountAfterPayment(hotelId, {
        previousBalance: openBalanceRef.current,
      });
      applySnapshot(snap);
    }
  );

  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;

  useFocusEffect(
    useCallback(() => {
      const warm = getPartnerAccountCache(hotelId);
      if (warm) applySnapshot(warm);
      void load({ force: true });
    }, [applySnapshot, hotelId, load])
  );

  const payWithStripe = async () => {
    if (openBalance <= 0 || payingKey) return;
    await startPayment({ amount: openBalance }, 'balance');
  };

  const hasCache = Boolean(getPartnerAccountCache(hotelId));

  return (
    <View style={styles.root}>
      <PartnerScreenTitle title="Cari hesabım" subtitle="Açık bakiye ve tahsilat geçmişi" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load({ force: true });
            }}
            tintColor={partnerTheme.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.body}>
          <LinearGradient colors={['rgba(245,158,11,0.18)', 'rgba(15,23,42,0.8)']} style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Açık bakiye</Text>
            {!hasCache && openBalance === 0 && payments.length === 0 ? (
              <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 16, alignSelf: 'flex-start' }} />
            ) : (
              <Text style={styles.balanceValue}>{fmtPartnerMoney(openBalance)}</Text>
            )}
            <Text style={styles.balanceHint}>Kahvaltı kayıtlarınız alacak olarak işlenir; tahsilatlar aşağıda listelenir.</Text>
            {openBalance > 0 ? (
              <View style={styles.payBlock}>
                <PartnerPrimaryButton
                  label={`Stripe ile öde · ${fmtPartnerMoney(openBalance)}`}
                  onPress={() => void payWithStripe()}
                  loading={payingKey === 'balance'}
                  disabled={payingKey === 'balance'}
                />
                <Text style={styles.payHint}>Ödeme uygulama içinde açılır; tamamlanınca bakiye otomatik güncellenir.</Text>
              </View>
            ) : null}
          </LinearGradient>

          <PartnerGlassCard style={{ marginBottom: 14 }}>
            <PartnerReportExportButtons
              hint="Günlük kayıtlar, tahsilatlar ve cari durumunuzun profesyonel PDF özeti."
              loadReport={() => loadPartnerPortalActivityReport(hotelId, 365)}
              disabled={refreshing}
            />
          </PartnerGlassCard>

          <View style={styles.grid}>
            <View style={styles.gridCard}>
              <Text style={styles.gridLabel}>Bu ay tutar</Text>
              <Text style={styles.gridValue}>{fmtPartnerMoney(monthAmount)}</Text>
            </View>
            <View style={styles.gridCard}>
              <Text style={styles.gridLabel}>Bu ay kişi</Text>
              <Text style={styles.gridValue}>{monthGuests}</Text>
            </View>
            <View style={styles.gridCard}>
              <Text style={styles.gridLabel}>Kişi başı kahvaltı</Text>
              <Text style={styles.gridValue}>{fmtPartnerMoney(partner.effectiveUnitPrice)}</Text>
            </View>
            <View style={styles.gridCard}>
              <Text style={styles.gridLabel}>Toplam kayıt</Text>
              <Text style={styles.gridValue}>{fmtPartnerMoney(totalAmount)}</Text>
            </View>
          </View>

          <PartnerGlassCard style={{ marginTop: 14 }}>
            <PartnerSectionTitle icon="wallet-outline" title="Tahsilat geçmişi" hint="Valoria tarafından kaydedilen ödemeler" />
            {!hasCache && payments.length === 0 ? (
              <ActivityIndicator color={partnerTheme.accent} style={{ marginVertical: 20 }} />
            ) : payments.length === 0 ? (
              <PartnerEmptyState icon="receipt-outline" title="Henüz tahsilat yok" body="Ödeme yapıldığında burada görünecek." />
            ) : (
              payments.map((row) => <PaymentRow key={row.id} row={row} />)
            )}
          </PartnerGlassCard>
        </View>
      </ScrollView>
      <PartnerStripeCheckoutHost checkout={checkout} onClose={dismissCheckout} onFinished={finishCheckout} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  scroll: { flex: 1, backgroundColor: partnerTheme.bg },
  body: { paddingHorizontal: 18, paddingTop: 14 },
  balanceCard: {
    borderRadius: partnerRadii.xl,
    padding: 22,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorderFocus,
    marginBottom: 14,
  },
  balanceLabel: { color: partnerTheme.muted, fontSize: 13, fontWeight: '600' },
  balanceValue: { color: partnerTheme.text, fontSize: 36, fontWeight: '900', marginTop: 8, letterSpacing: -0.5 },
  balanceHint: { color: partnerTheme.muted, fontSize: 13, marginTop: 12, lineHeight: 20 },
  payBlock: { marginTop: 18, gap: 10 },
  payHint: { color: partnerTheme.mutedSoft, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCard: {
    width: '48%',
    backgroundColor: partnerTheme.card,
    borderRadius: partnerRadii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  gridLabel: { color: partnerTheme.mutedSoft, fontSize: 12, fontWeight: '600' },
  gridValue: { color: partnerTheme.text, fontWeight: '800', fontSize: 17, marginTop: 8 },
  payRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: partnerTheme.cardBorder,
  },
  payIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: partnerTheme.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payTitle: { color: partnerTheme.text, fontWeight: '700' },
  payMeta: { color: partnerTheme.mutedSoft, fontSize: 12, marginTop: 2 },
  payAmount: { color: partnerTheme.success, fontWeight: '800', fontSize: 15 },
});
