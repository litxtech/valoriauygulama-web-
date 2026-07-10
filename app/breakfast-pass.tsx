import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GuestSignOneWebShell } from '@/components/guest/GuestSignOneWebShell';
import {
  breakfastGuestPassStatusLabel,
  canRedeemBreakfastGuestPass,
  fetchBreakfastGuestPassPublic,
  formatBreakfastPassDate,
  formatBreakfastPassTime,
  redeemBreakfastGuestPass,
  type BreakfastGuestPassPublic,
} from '@/lib/breakfastGuestPass';
import { useAuthStore } from '@/stores/authStore';

function resolveTokenFromLocation(paramsToken?: string | string[]): string {
  const fromParams = Array.isArray(paramsToken) ? paramsToken[0] : paramsToken;
  if (fromParams?.trim()) return fromParams.trim();
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search);
    return (q.get('token') ?? q.get('t') ?? '').trim();
  }
  return '';
}

function statusMeta(status: BreakfastGuestPassPublic['status']) {
  if (status === 'redeemed') {
    return { color: '#15803d', bg: '#dcfce7', icon: 'checkmark-circle' as const, label: 'Kahvaltı onaylandı' };
  }
  if (status === 'cancelled') {
    return { color: '#64748b', bg: '#f1f5f9', icon: 'close-circle' as const, label: 'Bilet iptal edildi' };
  }
  return { color: '#b45309', bg: '#fef3c7', icon: 'time' as const, label: 'Resepsiyon onayı bekliyor' };
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function BreakfastPassPublicScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ token?: string }>();
  const staff = useAuthStore((s) => s.staff);
  const token = useMemo(() => resolveTokenFromLocation(params.token), [params.token]);
  const [pass, setPass] = useState<BreakfastGuestPassPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const canRedeem = canRedeemBreakfastGuestPass(staff);

  const load = useCallback(async () => {
    if (!token) {
      setPass(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPass(await fetchBreakfastGuestPassPublic(token));
    } catch {
      setPass(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const redeem = async () => {
    if (!token || !pass || pass.status !== 'pending') return;
    setRedeeming(true);
    const result = await redeemBreakfastGuestPass(token);
    setRedeeming(false);
    if ('error' in result) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(result.error);
      } else {
        Alert.alert('Onaylanamadı', result.error);
      }
      return;
    }
    void load();
  };

  const meta = pass ? statusMeta(pass.status) : null;

  const header = (
    <View>
      <Text style={styles.eyebrow}>Valoria · Partner kahvaltı</Text>
      <Text style={styles.pageTitle}>Misafir kahvaltı bileti</Text>
      <Text style={styles.pageSub}>QR ile açılan misafir bilgi kartı</Text>
    </View>
  );

  const footer = (
    <Text style={styles.footerNote}>
      Bu bilet partner otel tarafından oluşturulmuştur. Sorularınız için resepsiyona başvurun.
    </Text>
  );

  let body: ReactNode;

  if (!token) {
    body = (
      <View style={[styles.card, styles.cardCentered]}>
        <Ionicons name="alert-circle-outline" size={40} color="#94a3b8" />
        <Text style={styles.errorTitle}>Geçersiz bağlantı</Text>
        <Text style={styles.errorBody}>QR kodunda bilet bilgisi bulunamadı.</Text>
      </View>
    );
  } else if (loading) {
    body = (
      <View style={[styles.card, styles.cardCentered]}>
        <ActivityIndicator size="large" color="#166534" />
        <Text style={styles.loadingText}>Misafir bilgileri yükleniyor…</Text>
      </View>
    );
  } else if (!pass) {
    body = (
      <View style={[styles.card, styles.cardCentered]}>
        <Ionicons name="search-outline" size={40} color="#94a3b8" />
        <Text style={styles.errorTitle}>Bilet bulunamadı</Text>
        <Text style={styles.errorBody}>QR kodu geçersiz, süresi dolmuş veya iptal edilmiş olabilir.</Text>
      </View>
    );
  } else {
    body = (
      <>
        {meta ? (
          <View style={[styles.statusBanner, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={22} color={meta.color} />
            <Text style={[styles.statusBannerText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <LinearGradient colors={['#14532d', '#166534']} style={styles.hero}>
            <Text style={styles.heroLabel}>Misafir</Text>
            <Text style={styles.heroName}>{pass.guestName}</Text>
            {pass.roomNumber ? <Text style={styles.heroRoom}>Oda {pass.roomNumber}</Text> : null}
          </LinearGradient>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kahvaltı bilgileri</Text>
            <InfoRow label="Kahvaltı tarihi" value={formatBreakfastPassDate(pass.recordDate)} />
            <InfoRow label="Durum" value={breakfastGuestPassStatusLabel(pass.status)} />
            <InfoRow label="Bilet oluşturma" value={formatBreakfastPassTime(pass.createdAt)} />
            {pass.redeemedAt ? (
              <InfoRow label="Resepsiyon onayı" value={formatBreakfastPassTime(pass.redeemedAt)} />
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Partner otel</Text>
            <InfoRow label="Otel adı" value={pass.partnerHotelName || '—'} />
            {pass.partnerHotelCity ? <InfoRow label="Şehir" value={pass.partnerHotelCity} /> : null}
            {pass.partnerHotelContact ? (
              <InfoRow label="Yetkili" value={pass.partnerHotelContact} />
            ) : null}
            {pass.partnerHotelPhone ? <InfoRow label="Telefon" value={pass.partnerHotelPhone} /> : null}
          </View>
        </View>

        {pass.status === 'pending' && canRedeem ? (
          <TouchableOpacity
            style={styles.redeemBtn}
            onPress={() => void redeem()}
            disabled={redeeming}
            activeOpacity={0.88}
          >
            <LinearGradient colors={['#16a34a', '#15803d']} style={styles.redeemBtnInner}>
              {redeeming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={22} color="#fff" />
                  <Text style={styles.redeemBtnText}>Kahvaltıyı onayla</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        ) : null}

        {pass.status === 'redeemed' ? (
          <View style={styles.okBox}>
            <Text style={styles.okText}>✓ Misafir kahvaltı yapabilir</Text>
          </View>
        ) : null}
      </>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <GuestSignOneWebShell header={header} footer={footer}>
        {body}
      </GuestSignOneWebShell>
    );
  }

  return (
    <View style={[styles.mobileRoot, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.mobileHeader}>{header}</View>
      <View style={styles.mobileBody}>{body}</View>
      <View style={styles.mobileFooter}>{footer}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileRoot: { flex: 1, backgroundColor: '#eef2f7', paddingHorizontal: 16 },
  mobileHeader: { paddingVertical: 12 },
  mobileBody: { flex: 1 },
  mobileFooter: { paddingTop: 8 },
  eyebrow: { fontSize: 12, fontWeight: '700', color: '#64748b', letterSpacing: 0.4, textTransform: 'uppercase' },
  pageTitle: { fontSize: 26, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  pageSub: { fontSize: 14, color: '#64748b', marginTop: 4 },
  footerNote: { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    width: '100%',
  },
  cardCentered: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  loadingText: { color: '#64748b', fontSize: 14 },
  errorTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  errorBody: { color: '#64748b', textAlign: 'center', lineHeight: 22 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  statusBannerText: { fontWeight: '700', fontSize: 14 },
  hero: { padding: 20, alignItems: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  heroName: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  heroRoom: { color: '#bbf7d0', fontSize: 16, fontWeight: '600', marginTop: 6 },
  section: { paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e2e8f0' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  infoLabel: { color: '#64748b', fontSize: 14, flex: 1 },
  infoValue: { color: '#0f172a', fontSize: 14, fontWeight: '700', flex: 1.2, textAlign: 'right' },
  redeemBtn: { marginTop: 14, borderRadius: 14, overflow: 'hidden' },
  redeemBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  redeemBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  okBox: {
    marginTop: 14,
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  okText: { color: '#166534', fontWeight: '800', fontSize: 16, textAlign: 'center' },
});
