import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canAccessReservationSales } from '@/lib/staffPermissions';
import { useTranslation } from 'react-i18next';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type SaleDetail = {
  id: string;
  created_by_staff_id?: string | null;
  closed_by_staff_id?: string | null;
  commission_earner_staff_id?: string | null;
  created_at: string;
  updated_at: string;
  customer_full_name: string;
  customer_phone: string;
  customer_phone2: string | null;
  customer_email: string | null;
  people_count: number;
  customer_note: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights_count: number | null;
  room_type: string | null;
  reservation_status: string;
  source_type: string;
  sale_amount: number;
  discount_amount: number;
  extra_service_amount: number;
  net_amount: number;
  total_due_amount: number;
  payment_status: string;
  payment_place: string | null;
  paid_amount: number;
  remaining_amount: number;
  commission_enabled: boolean;
  commission_type: string | null;
  commission_rate: number | null;
  commission_amount: number;
  commission_status: string;
  commission_note: string | null;
  brought_by?: { full_name: string | null } | null;
  intermediary?: { full_name: string | null } | null;
  closed_by?: { full_name: string | null } | null;
  hotel_responsible?: { full_name: string | null } | null;
  commission_earner?: { full_name: string | null } | null;
};

function fmtMoneyTry(n: number): string {
  try {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' ₺';
  } catch {
    return `${Math.round(n)} ₺`;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function SaleDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const canUse = canAccessReservationSales(staff);
  const [saving, setSaving] = useState(false);
  const [sale, setSale] = useState<SaleDetail | null>(null);

  const fetchData = useCallback(async (): Promise<SaleDetail | null> => {
    if (!id || !canUse) return null;
    const { data, error } = await supabase
      .from('reservation_sales')
      .select(
        [
          'id, created_by_staff_id, closed_by_staff_id, commission_earner_staff_id, created_at, updated_at, customer_full_name, customer_phone, customer_phone2, customer_email, people_count, customer_note',
          'check_in_date, check_out_date, nights_count, room_type, reservation_status, source_type',
          'sale_amount, discount_amount, extra_service_amount, net_amount, total_due_amount',
          'payment_status, payment_place, paid_amount, remaining_amount',
          'commission_enabled, commission_type, commission_rate, commission_amount, commission_status, commission_note',
          'brought_by:brought_by_staff_id(full_name)',
          'intermediary:intermediary_staff_id(full_name)',
          'closed_by:closed_by_staff_id(full_name)',
          'hotel_responsible:hotel_responsible_staff_id(full_name)',
          'commission_earner:commission_earner_staff_id(full_name)',
        ].join(', ')
      )
      .eq('id', id)
      .single();
    if (error) throw error;
    return (data as unknown as SaleDetail) ?? null;
  }, [id, canUse]);

  const { data: cachedSale, reload, showContent } = useCachedFocusLoad({
    cacheKey: id ? `staff-sale-detail:${id}` : 'staff-sale-detail:none',
    enabled: !!id && canUse,
    fetchData,
  });

  useEffect(() => {
    setSale(cachedSale);
  }, [cachedSale]);

  const load = useCallback(async () => {
    try {
      await reload();
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
    }
  }, [reload, t]);

  const canEditCommissionStatus = useMemo(() => {
    if (!sale || !staff?.id) return false;
    if (staff.role === 'admin' || staff.role === 'reception_chief') return true;
    return (
      sale.created_by_staff_id === staff.id ||
      sale.closed_by_staff_id === staff.id ||
      sale.commission_earner_staff_id === staff.id
    );
  }, [sale, staff?.id, staff?.role]);

  const setCommissionStatus = useCallback(
    async (next: 'pending' | 'approved' | 'paid' | 'rejected') => {
      if (!sale?.id) return;
      if (!canEditCommissionStatus) return;
      setSaving(true);
      try {
        const patch: Record<string, unknown> = { commission_status: next };
        if (next === 'paid') patch.commission_paid_at = new Date().toISOString();
        const { error } = await supabase.from('reservation_sales').update(patch).eq('id', sale.id);
        if (error) throw error;
        await load();
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
      } finally {
        setSaving(false);
      }
    },
    [sale?.id, canEditCommissionStatus, load]
  );

  if (!canUse) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>Bu ekrana erişim için admin, resepsiyon şefi veya “Satış / komisyon” yetkisi gerekir.</Text>
      </View>
    );
  }

  if (!showContent && !sale) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!sale) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={26} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Kayıt bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.85}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{sale.customer_full_name}</Text>
        <Text style={styles.sub}>{sale.customer_phone}</Text>
        <View style={styles.split}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{sale.reservation_status}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: theme.colors.surfaceTertiary }]}>
            <Text style={styles.pillText}>{sale.source_type}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Sorumlular</Text>
      <View style={styles.card}>
        <Row label="Getiren" value={sale.brought_by?.full_name ?? '-'} />
        <Row label={t('staffSalesIntermediary')} value={sale.intermediary?.full_name ?? '-'} />
        <Row label={t('staffSalesClosedBy')} value={sale.closed_by?.full_name ?? '-'} />
        <Row label="Otel sorumlusu" value={sale.hotel_responsible?.full_name ?? '-'} />
        <Row label="Komisyon hak edeni" value={sale.commission_earner?.full_name ?? '-'} />
      </View>

      <Text style={styles.sectionTitle}>Rezervasyon</Text>
      <View style={styles.card}>
        <Row label={t('staffSalesCheckIn')} value={sale.check_in_date ?? '-'} />
        <Row label={t('staffSalesCheckOut')} value={sale.check_out_date ?? '-'} />
        <Row label="Gece" value={sale.nights_count != null ? String(sale.nights_count) : '-'} />
        <Row label="Oda tipi" value={sale.room_type ?? '-'} />
        <Row label={t('staffSalesPeopleCount')} value={String(sale.people_count ?? 1)} />
      </View>

      <Text style={styles.sectionTitle}>Fiyat & Ödeme</Text>
      <View style={styles.card}>
        <Row label={t('staffSalesAmount')} value={fmtMoneyTry(sale.sale_amount ?? 0)} />
        <Row label={t('staffSalesDiscount')} value={fmtMoneyTry(sale.discount_amount ?? 0)} />
        <Row label="Ek hizmet" value={fmtMoneyTry(sale.extra_service_amount ?? 0)} />
        <Row label="Net" value={fmtMoneyTry(sale.net_amount ?? 0)} />
        <View style={styles.hr} />
        <Row label={t('staffSalesPaymentStatus')} value={sale.payment_status} />
        <Row label={t('staffSalesPaymentPlace')} value={sale.payment_place ?? '-'} />
        <Row label={t('staffSalesPaid')} value={fmtMoneyTry(sale.paid_amount ?? 0)} />
        <Row label="Kalan" value={fmtMoneyTry(sale.remaining_amount ?? 0)} />
      </View>

      <Text style={styles.sectionTitle}>Komisyon</Text>
      <View style={styles.card}>
        <Row
          label={t('staffSalesHasCommission')}
          value={sale.commission_enabled ? t('staffSalesYes') : t('staffSalesNo')}
        />
        <Row label={t('staffSalesCommissionType')} value={sale.commission_type ?? '-'} />
        <Row label="Oran/Tutar" value={sale.commission_rate != null ? String(sale.commission_rate) : '-'} />
        <Row label={t('staffSalesCommissionAmount')} value={fmtMoneyTry(sale.commission_amount ?? 0)} />
        <Row label="Durum" value={sale.commission_status} />
        {sale.commission_note ? <Text style={styles.note}>{sale.commission_note}</Text> : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnGhost]}
          onPress={() => load().catch(() => undefined)}
          activeOpacity={0.85}
          disabled={saving}
        >
          <Ionicons name="refresh" size={18} color={theme.colors.primary} />
          <Text style={styles.actionBtnGhostText}>Yenile</Text>
        </TouchableOpacity>
        {canEditCommissionStatus ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnPrimary]}
            onPress={() =>
              Alert.alert(t('status'), t('required'), [
                { text: t('pendingApproval'), onPress: () => setCommissionStatus('pending') },
                { text: t('approved'), onPress: () => setCommissionStatus('approved') },
                { text: t('save'), onPress: () => setCommissionStatus('paid') },
                { text: t('rejected'), style: 'destructive', onPress: () => setCommissionStatus('rejected') },
                { text: t('cancel'), style: 'cancel' },
              ])
            }
            activeOpacity={0.9}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-done-outline" size={18} color="#fff" />}
            <Text style={styles.actionBtnPrimaryText}>Komisyon durum</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 16, paddingBottom: 44 },
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  sub: { marginTop: 4, color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
  split: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.primary },
  pillText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  sectionTitle: { marginTop: 10, marginBottom: 8, fontSize: 15, fontWeight: '900', color: theme.colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8 },
  rowLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.textMuted, flex: 1 },
  rowValue: { fontSize: 13, fontWeight: '900', color: theme.colors.text, flex: 1, textAlign: 'right' },
  hr: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: 10 },
  note: { marginTop: 10, fontSize: 12, color: theme.colors.textMuted, lineHeight: 18 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  actionBtn: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  actionBtnPrimary: { backgroundColor: theme.colors.primary },
  actionBtnPrimaryText: { color: '#fff', fontWeight: '900' },
  actionBtnGhost: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.borderLight },
  actionBtnGhostText: { color: theme.colors.primary, fontWeight: '900' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: theme.colors.background },
  deniedTitle: { marginTop: 10, fontSize: 16, fontWeight: '900', color: theme.colors.text },
  deniedDesc: { marginTop: 6, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
  backBtn: { marginTop: 14, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.colors.primary },
  backBtnText: { color: '#fff', fontWeight: '900' },
});

