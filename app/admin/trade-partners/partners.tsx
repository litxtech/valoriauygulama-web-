import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TradePartnerAdminGate } from '@/components/tradePartner/TradePartnerAdminGate';
import { useTradePartnerProviderOrgId } from '@/hooks/useTradePartnerProviderOrgId';
import { fetchTradePartners, type TradePartnerRow } from '@/lib/tradePartner';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';

export default function AdminTradePartnersListScreen() {
  return (
    <TradePartnerAdminGate>
      <AdminTradePartnersList />
    </TradePartnerAdminGate>
  );
}

function AdminTradePartnersList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId } = useTradePartnerProviderOrgId();
  const [rows, setRows] = useState<TradePartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      setRows(await fetchTradePartners(orgId));
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (orgId) void load();
  }, [orgId, load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Partner firmalar</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/trade-partners/new')}>
          <Ionicons name="add" size={22} color="#0f172a" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} tintColor={theme.accent} />
          }
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>Henüz partner eklenmemiş.</Text>
          ) : (
            rows.map((row) => (
              <TouchableOpacity
                key={row.id}
                style={styles.card}
                onPress={() => router.push(`/admin/trade-partners/${row.id}`)}
                activeOpacity={0.85}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.company}>{row.company_name}</Text>
                  <Text style={styles.meta}>{row.partner_trade_categories?.name ?? 'Kategori'}</Text>
                  <Text style={styles.meta}>{row.contact_name ?? row.email}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.mutedSoft} />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.cardElevated },
  addBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.accent },
  title: { flex: 1, color: theme.text, fontSize: 20, fontWeight: '800' },
  empty: { color: theme.muted, textAlign: 'center', marginTop: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.cardBorder,
  },
  company: { color: theme.text, fontWeight: '800', fontSize: 16 },
  meta: { color: theme.muted, fontSize: 13, marginTop: 2 },
});
