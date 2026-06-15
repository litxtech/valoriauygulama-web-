import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canAccessReservationSales } from '@/lib/staffPermissions';
import { useTranslation } from 'react-i18next';

type SummaryRow = {
  sales_count: number;
  total_net_amount: number;
  total_commission_amount: number;
  pending_commission_amount: number;
  paid_commission_amount: number;
};

type SaleRow = {
  id: string;
  created_at: string;
  customer_full_name: string;
  customer_phone: string;
  check_in_date: string | null;
  check_out_date: string | null;
  reservation_status: string;
  net_amount: number;
  commission_amount: number;
  commission_status: string;
};

function fmtMoneyTry(n: number): string {
  try {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' ₺';
  } catch {
    return `${Math.round(n)} ₺`;
  }
}

function formatDate(d: string | null): string {
  if (!d) return '-';
  return d;
}

function StatCard({ title, value, icon }: { title: string; value: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIcon}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statTitle}>{title}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function StaffSalesHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const canUse = canAccessReservationSales(staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const headerRight = useMemo(() => {
    return (
      <TouchableOpacity
        onPress={() => router.push('/staff/sales/new')}
        style={styles.addBtn}
        activeOpacity={0.85}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.addBtnText}>Yeni</Text>
      </TouchableOpacity>
    );
  }, [router]);

  const load = useCallback(async () => {
    if (!staff?.id || !canUse) return;
    const [{ data: sumData }, { data: listData }] = await Promise.all([
      supabase.rpc('my_sales_commission_summary', { p_from: null, p_to: null }),
      supabase
        .from('reservation_sales')
        .select('id, created_at, customer_full_name, customer_phone, check_in_date, check_out_date, reservation_status, net_amount, commission_amount, commission_status')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);
    const sumRow = (Array.isArray(sumData) ? sumData[0] : sumData) as unknown as SummaryRow | null;
    setSummary(sumRow ?? null);
    setSales(((listData ?? []) as unknown as SaleRow[]) ?? []);
  }, [staff?.id, canUse]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!canUse) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>Admin, resepsiyon şefi veya “Satış / komisyon” uygulama yetkisi gerekir.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.textMuted }}>Yükleniyor…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.h1}>Satış & Komisyon</Text>
          <Text style={styles.h2}>Kendi satışların, komisyonların ve müşteri kayıtların.</Text>
        </View>
        {headerRight}
      </View>

      <View style={styles.statsGrid}>
        <StatCard title={t('staffSalesCount')} value={String(summary?.sales_count ?? 0)} icon="receipt-outline" />
        <StatCard title="Toplam net" value={fmtMoneyTry(summary?.total_net_amount ?? 0)} icon="trending-up-outline" />
        <StatCard title="Toplam komisyon" value={fmtMoneyTry(summary?.total_commission_amount ?? 0)} icon="cash-outline" />
        <StatCard title="Bekleyen" value={fmtMoneyTry(summary?.pending_commission_amount ?? 0)} icon="time-outline" />
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Son kayıtlar</Text>
        <TouchableOpacity onPress={onRefresh} activeOpacity={0.85} style={styles.linkBtn}>
          <Ionicons name="refresh" size={16} color={theme.colors.primary} />
          <Text style={styles.linkBtnText}>Yenile</Text>
        </TouchableOpacity>
      </View>

      {sales.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={28} color={theme.colors.textMuted} />
          <Text style={styles.emptyTitle}>Henüz kayıt yok</Text>
          <Text style={styles.emptyDesc}>Yeni satış kaydı oluşturarak başlayın.</Text>
        </View>
      ) : (
        sales.map((s) => (
          <TouchableOpacity
            key={s.id}
            onPress={() => router.push(`/staff/sales/${s.id}`)}
            activeOpacity={0.85}
            style={styles.saleCard}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.saleName} numberOfLines={1}>
                  {s.customer_full_name}
                </Text>
                <Text style={styles.saleMeta} numberOfLines={1}>
                  {s.customer_phone} • {formatDate(s.check_in_date)} → {formatDate(s.check_out_date)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.saleMoney}>{fmtMoneyTry(s.net_amount ?? 0)}</Text>
                <Text style={styles.saleComm}>
                  Komisyon: {fmtMoneyTry(s.commission_amount ?? 0)} • {s.commission_status}
                </Text>
              </View>
            </View>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: theme.colors.surfaceTertiary }]}>
                <Text style={styles.badgeText}>{s.reservation_status}</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 44 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  h2: { marginTop: 4, color: theme.colors.textMuted, fontSize: 13, lineHeight: 18, maxWidth: 280 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '800' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, marginBottom: 18 },
  statCard: {
    width: '48%',
    minWidth: 160,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTitle: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '700' },
  statValue: { marginTop: 2, fontSize: 16, color: theme.colors.text, fontWeight: '900' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: theme.colors.text },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  linkBtnText: { color: theme.colors.primary, fontWeight: '800' },
  saleCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  saleName: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  saleMeta: { marginTop: 4, color: theme.colors.textMuted, fontSize: 12 },
  saleMoney: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  saleComm: { marginTop: 4, fontSize: 11, color: theme.colors.textMuted },
  badgeRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  empty: { alignItems: 'center', paddingVertical: 26, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight },
  emptyTitle: { marginTop: 10, fontSize: 15, fontWeight: '900', color: theme.colors.text },
  emptyDesc: { marginTop: 6, fontSize: 12, color: theme.colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.colors.background },
  deniedTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: theme.colors.text },
  deniedDesc: { marginTop: 6, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
});

