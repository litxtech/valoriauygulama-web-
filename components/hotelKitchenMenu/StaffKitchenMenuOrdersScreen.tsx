import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  STAFF_KITCHEN_ORDERS_FOCUS_REFRESH_MS,
  getStaffKitchenMenuOrdersCache,
  getStaffKitchenMenuOrdersCacheAgeMs,
  hydrateStaffKitchenMenuOrdersCache,
  setStaffKitchenMenuOrdersCache,
} from '@/lib/staffKitchenMenuOrdersCache';
import { useStaffKitchenMenuOrdersLive } from '@/hooks/useStaffKitchenMenuOrdersLive';
import { useAuthStore } from '@/stores/authStore';
import { canViewStaffKitchenMenuOrders } from '@/lib/staffPermissions';

const emptyBundle = (): StaffKitchenMenuOrdersBundle => ({ pending: [], paid: [] });

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

type OrdersTab = 'paid' | 'cart';

export function StaffKitchenMenuOrdersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id?.trim() || null;
  const allowed = canViewStaffKitchenMenuOrders(staff);

  const [loading, setLoading] = useState(
    () => !getStaffKitchenMenuOrdersCache(orgId ?? '')?.paid.length && !getStaffKitchenMenuOrdersCache(orgId ?? '')?.pending.length
  );
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<StaffKitchenMenuOrdersBundle>(
    () => getStaffKitchenMenuOrdersCache(orgId ?? '') ?? emptyBundle()
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<OrdersTab>('paid');
  const paidCountRef = useRef(0);
  const initialTabSetRef = useRef(false);
  const loadInFlightRef = useRef(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!orgId || loadInFlightRef.current) return;
      loadInFlightRef.current = true;
      try {
        const rows = await fetchStaffKitchenMenuOrders(orgId, { paidLimit: 60, pendingHours: 48 });
        const prevPaid = paidCountRef.current;
        setBundle(rows);
        setStaffKitchenMenuOrdersCache(orgId, rows);
        paidCountRef.current = rows.paid.length;
        if (rows.paid.length > prevPaid) setTab('paid');
        setLoadError(null);
      } catch (e) {
        if (!getStaffKitchenMenuOrdersCache(orgId)?.paid.length) {
          setLoadError((e as Error)?.message ?? t('staffKitchenMenuOrdersLoadError'));
        }
      } finally {
        loadInFlightRef.current = false;
        if (!opts?.silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, t]
  );

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void hydrateStaffKitchenMenuOrdersCache(orgId).then((cached) => {
      if (cancelled || !cached) return;
      setBundle(cached);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      if (!allowed || !orgId) {
        setLoading(false);
        return;
      }
      const mem = getStaffKitchenMenuOrdersCache(orgId);
      const age = getStaffKitchenMenuOrdersCacheAgeMs(orgId);
      if (mem && (mem.paid.length > 0 || mem.pending.length > 0)) {
        setBundle(mem);
        setLoading(false);
        if (age != null && age < STAFF_KITCHEN_ORDERS_FOCUS_REFRESH_MS) return;
        void load({ silent: true });
        return;
      }
      setLoading(true);
      void load();
    }, [allowed, orgId, load])
  );

  useStaffKitchenMenuOrdersLive(orgId, () => {
    void load({ silent: true });
  });

  const pendingCount = bundle.pending.length;
  const paidCount = bundle.paid.length;

  useEffect(() => {
    if (loading || initialTabSetRef.current) return;
    initialTabSetRef.current = true;
    if (paidCount > 0) setTab('paid');
    else if (pendingCount > 0) setTab('cart');
  }, [loading, paidCount, pendingCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
  };

  const activeOrders = tab === 'paid' ? bundle.paid : bundle.pending;

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.denied}>{t('staffKitchenMenuOrdersNoAccess')}</Text>
      </View>
    );
  }

  if (!orgId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="business-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.denied}>{t('staffKitchenMenuOrdersNoOrg')}</Text>
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

      {loadError ? (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={18} color="#b45309" />
          <Text style={styles.errorText}>{loadError}</Text>
        </View>
      ) : null}

      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'paid' && styles.tabBtnPaid]}
          onPress={() => setTab('paid')}
          activeOpacity={0.88}
        >
          <Ionicons name="checkmark-circle-outline" size={18} color={tab === 'paid' ? '#166534' : '#64748b'} />
          <Text style={[styles.tabBtnText, tab === 'paid' && styles.tabBtnTextPaid]}>
            {t('staffKitchenMenuOrdersPaidSection')}
          </Text>
          {paidCount > 0 ? (
            <View style={[styles.tabBadge, styles.tabBadgePaid]}>
              <Text style={[styles.tabBadgeText, styles.tabBadgeTextPaid]}>{paidCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'cart' && styles.tabBtnCart]}
          onPress={() => setTab('cart')}
          activeOpacity={0.88}
        >
          <Ionicons name="cart-outline" size={18} color={tab === 'cart' ? '#b45309' : '#64748b'} />
          <Text style={[styles.tabBtnText, tab === 'cart' && styles.tabBtnTextCart]}>
            {t('staffKitchenMenuOrdersCartSection')}
          </Text>
          {pendingCount > 0 ? (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{pendingCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {tab === 'cart' ? (
        <Text style={styles.sectionSub}>{t('staffKitchenMenuOrdersCartHint')}</Text>
      ) : null}

      {activeOrders.length === 0 ? (
        <Text style={styles.emptySection}>
          {tab === 'paid' ? t('staffKitchenMenuOrdersPaidEmpty') : t('staffKitchenMenuOrdersCartEmpty')}
        </Text>
      ) : (
        activeOrders.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            highlight={tab === 'cart'}
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: menuUi.border,
    backgroundColor: '#fff',
  },
  tabBtnPaid: { borderColor: menuUi.liveGreen, backgroundColor: menuUi.liveGreenBg },
  tabBtnCart: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  tabBtnText: { fontSize: 12, fontWeight: '800', color: '#64748b', flexShrink: 1 },
  tabBtnTextPaid: { color: '#166534' },
  tabBtnTextCart: { color: '#b45309' },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgePaid: { backgroundColor: '#dcfce7' },
  tabBadgeText: { fontSize: 11, fontWeight: '800', color: '#b45309' },
  tabBadgeTextPaid: { color: '#166534' },
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
