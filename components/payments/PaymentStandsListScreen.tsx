import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { formatPaymentAmount } from '@/lib/payments';
import { fetchPaymentQrStands, isVariablePaymentQrStand, type PaymentQrStandRow } from '@/lib/paymentQrStands';
import { paymentKindLabel, paymentText } from '@/lib/paymentsI18n';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  basePath: '/admin/payments' | '/staff/payments';
};

export function PaymentStandsListScreen({ basePath }: Props) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [rows, setRows] = useState<PaymentQrStandRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const orgId = basePath.startsWith('/staff') ? staff?.organization_id ?? null : null;
      const data = await fetchPaymentQrStands(orgId, 100);
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [basePath, staff?.organization_id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#635bff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor="#635bff"
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.intro}>
              Restoran, bar ve resepsiyon için sabit veya serbest tutarlı QR kodlar. Kapatana kadar aktif kalır;
              serbest QR'da müşteri tutarı kendisi girer.
            </Text>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push(`${basePath}/new?mode=standing&kind=food` as never)}
            >
              <LinearGradient colors={['#635bff', '#4f46e5']} style={styles.newBtn}>
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
                <Text style={styles.newBtnText}>Yeni sabit QR</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => router.push(`${basePath}/new?mode=standing_variable&kind=food` as never)}
              style={styles.newBtnSecondaryWrap}
            >
              <View style={styles.newBtnSecondary}>
                <Ionicons name="create-outline" size={22} color="#635bff" />
                <Text style={styles.newBtnSecondaryText}>Yeni serbest QR</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Aktif ve geçmiş noktalar</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="qr-code-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Henüz sabit QR yok</Text>
            <Text style={styles.emptySub}>Restoran masası veya bar için sabit tutarlı QR oluşturun.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: `${basePath}/stand/[id]`,
                params: { id: item.id },
              } as Href)
            }
          >
            <View style={[styles.statusDot, item.status === 'active' ? styles.statusActive : styles.statusClosed]} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {paymentKindLabel(item.service_kind)} ·{' '}
                {isVariablePaymentQrStand(item)
                  ? paymentText('paymentsQrModeStandingVariable')
                  : paymentText('paymentsQrModeStanding')}{' '}
                · {item.status === 'active' ? 'Aktif' : 'Kapatıldı'}
              </Text>
            </View>
            <Text style={styles.rowAmount}>
              {isVariablePaymentQrStand(item)
                ? paymentText('paymentsStandingVariableAmount')
                : formatPaymentAmount(Number(item.amount), item.currency)}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  intro: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 19, marginBottom: 14 },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  newBtnSecondaryWrap: { marginBottom: 16 },
  newBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#635bff44',
    backgroundColor: theme.colors.surface,
  },
  newBtnSecondaryText: { color: '#635bff', fontSize: 16, fontWeight: '900' },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusActive: { backgroundColor: '#16a34a' },
  statusClosed: { backgroundColor: '#94a3b8' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  rowMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  rowAmount: { fontSize: 13, fontWeight: '900', color: '#635bff' },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingHorizontal: 24 },
});
