import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { formatMenuPrice } from '@/lib/hotelKitchenMenu';
import { orderStatusLabelKey, type KitchenMenuOrderRecord } from '@/lib/publicKitchenMenuOrderHistory';
import {
  fetchStaffKitchenMenuOrders,
  kitchenMenuOrderLocation,
  type StaffKitchenMenuOrdersBundle,
} from '@/lib/staffKitchenMenuOrders';
import { useStaffKitchenMenuOrdersLive } from '@/hooks/useStaffKitchenMenuOrdersLive';
import { useAuthStore } from '@/stores/authStore';
import { canViewStaffKitchenMenuOrders } from '@/lib/staffPermissions';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function OrderCard({
  order,
  highlight,
  expanded,
  onToggle,
}: {
  order: KitchenMenuOrderRecord;
  highlight?: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const loc = kitchenMenuOrderLocation(order);
  const when = order.paid_at ?? order.created_at;
  const itemSummary = order.items.map((l) => `${l.item_name} ×${l.quantity}`).join(' · ');

  return (
    <TouchableOpacity
      style={[styles.card, highlight && styles.cardHighlight]}
      onPress={onToggle}
      activeOpacity={0.9}
    >
      <View style={styles.cardHead}>
        <View style={styles.cardHeadLeft}>
          <Text style={styles.cardAmount}>{formatMenuPrice(order.total_amount, order.currency === 'try' ? '₺' : order.currency.toUpperCase())}</Text>
          <Text style={styles.cardName} numberOfLines={1}>
            {order.customer_name?.trim() || t('staffKitchenMenuOrdersGuest')}
          </Text>
        </View>
        <View style={[styles.statusPill, highlight ? styles.statusPending : styles.statusPaid]}>
          <Text style={[styles.statusText, highlight ? styles.statusTextPending : styles.statusTextPaid]}>
            {t(orderStatusLabelKey(order.status))}
          </Text>
        </View>
      </View>
      {loc ? <Text style={styles.cardLoc} numberOfLines={2}>{loc}</Text> : null}
      <Text style={styles.cardItems} numberOfLines={expanded ? undefined : 2}>
        {itemSummary}
      </Text>
      <View style={styles.cardFoot}>
        <Text style={styles.cardTime}>{formatWhen(when)}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={theme.colors.textMuted} />
      </View>
      {expanded ? (
        <View style={styles.detailBlock}>
          {order.items.map((line, i) => (
            <View key={`${line.item_name}-${i}`} style={styles.detailRow}>
              <Text style={styles.detailName}>{line.item_name}</Text>
              <Text style={styles.detailQty}>×{line.quantity}</Text>
              <Text style={styles.detailPrice}>{formatMenuPrice(line.line_total)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function StaffKitchenMenuOrdersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;
  const allowed = canViewStaffKitchenMenuOrders(staff);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundle, setBundle] = useState<StaffKitchenMenuOrdersBundle>({ pending: [], paid: [] });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const rows = await fetchStaffKitchenMenuOrders(orgId);
      setBundle(rows);
    } catch {
      /* ağ — mevcut listeyi koru */
    }
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      if (!allowed || !orgId) {
        setLoading(false);
        return undefined;
      }
      setLoading(true);
      void load().finally(() => setLoading(false));
      return undefined;
    }, [allowed, orgId, load])
  );

  useStaffKitchenMenuOrdersLive(orgId, () => {
    void load();
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.denied}>{t('staffKitchenMenuOrdersNoAccess')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const pendingCount = bundle.pending.length;
  const paidCount = bundle.paid.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.liveBanner}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>{t('staffKitchenMenuOrdersLive')}</Text>
      </View>
      <Text style={styles.lead}>{t('staffKitchenMenuOrdersLead')}</Text>

      <View style={styles.sectionHead}>
        <Ionicons name="cart-outline" size={18} color="#d97706" />
        <Text style={styles.sectionTitle}>{t('staffKitchenMenuOrdersCartSection')}</Text>
        {pendingCount > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{pendingCount}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.sectionSub}>{t('staffKitchenMenuOrdersCartHint')}</Text>
      {pendingCount === 0 ? (
        <Text style={styles.emptySection}>{t('staffKitchenMenuOrdersCartEmpty')}</Text>
      ) : (
        bundle.pending.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            highlight
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId((id) => (id === order.id ? null : order.id))}
          />
        ))
      )}

      <View style={[styles.sectionHead, styles.sectionHeadSpaced]}>
        <Ionicons name="checkmark-circle-outline" size={18} color={menuUi.liveGreen} />
        <Text style={styles.sectionTitle}>{t('staffKitchenMenuOrdersPaidSection')}</Text>
        {paidCount > 0 ? (
          <View style={[styles.countBadge, styles.countBadgePaid]}>
            <Text style={[styles.countBadgeText, styles.countBadgeTextPaid]}>{paidCount}</Text>
          </View>
        ) : null}
      </View>
      {paidCount === 0 ? (
        <Text style={styles.emptySection}>{t('staffKitchenMenuOrdersPaidEmpty')}</Text>
      ) : (
        bundle.paid.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            expanded={expandedId === order.id}
            onToggle={() => setExpandedId((id) => (id === order.id ? null : order.id))}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: menuUi.warmBg },
  content: { padding: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: menuUi.warmBg },
  denied: { marginTop: 12, fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  liveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    backgroundColor: menuUi.liveGreenBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: menuUi.liveGreen },
  liveText: { fontSize: 12, fontWeight: '800', color: '#166534' },
  lead: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  sectionHeadSpaced: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, flex: 1 },
  sectionSub: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 10, lineHeight: 17 },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgePaid: { backgroundColor: menuUi.liveGreenBg },
  countBadgeText: { fontSize: 12, fontWeight: '800', color: '#b45309' },
  countBadgeTextPaid: { color: '#166534' },
  emptySection: {
    fontSize: 14,
    color: theme.colors.textMuted,
    fontStyle: 'italic',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: menuUi.border,
    ...menuUi.shadowSm,
  },
  cardHighlight: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardHeadLeft: { flex: 1, minWidth: 0 },
  cardAmount: { fontSize: 17, fontWeight: '800', color: menuUi.price },
  cardName: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 2 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusPending: { backgroundColor: '#fef3c7' },
  statusPaid: { backgroundColor: menuUi.liveGreenBg },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusTextPending: { color: '#b45309' },
  statusTextPaid: { color: '#166534' },
  cardLoc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8, lineHeight: 17 },
  cardItems: { fontSize: 13, color: theme.colors.text, marginTop: 8, lineHeight: 18 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  cardTime: { fontSize: 11, color: theme.colors.textMuted },
  detailBlock: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: menuUi.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailName: { flex: 1, fontSize: 13, color: theme.colors.text },
  detailQty: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  detailPrice: { fontSize: 13, fontWeight: '700', color: menuUi.price },
});
