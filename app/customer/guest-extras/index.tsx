import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import {
  createGuestExtraStripePayment,
  fetchGuestExtraCatalog,
  fetchMyGuestExtraOrders,
  formatExtraPrice,
  subscribeGuestExtraCatalog,
  type HotelExtraCatalogItem,
  type GuestExtraOrderRow,
} from '@/lib/guestExtraCharges';
import { EXTRA_CATEGORY_LABELS } from '@/lib/guestExtraChargesAdmin';
import { useCachedList } from '@/hooks/useCachedList';

type CartLine = { item: HotelExtraCatalogItem; quantity: number };

export default function CustomerGuestExtrasScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paying, setPaying] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const fetchCatalog = useCallback(async () => {
    try {
      return await fetchGuestExtraCatalog();
    } catch {
      return [];
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      return await fetchMyGuestExtraOrders();
    } catch {
      return [];
    }
  }, []);

  const {
    items: catalog,
    loading: catalogLoading,
    refreshing: catalogRefreshing,
    refresh: refreshCatalog,
    load: reloadCatalog,
  } = useCachedList<HotelExtraCatalogItem>({
    cacheKey: 'customer-guest-extras-catalog',
    fetchItems: fetchCatalog,
  });

  const {
    items: orders,
    refreshing: ordersRefreshing,
    refresh: refreshOrders,
  } = useCachedList<GuestExtraOrderRow>({
    cacheKey: 'customer-guest-extras-orders',
    fetchItems: fetchOrders,
  });

  const loading = catalogLoading;
  const refreshing = catalogRefreshing || ordersRefreshing;
  const refresh = useCallback(() => {
    refreshCatalog();
    refreshOrders();
  }, [refreshCatalog, refreshOrders]);

  useEffect(() => subscribeGuestExtraCatalog(() => void reloadCatalog({ silent: true })), [reloadCatalog]);

  const addToCart = (item: HotelExtraCatalogItem) => {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.item.id === item.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + 1 };
        return next;
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const adjustQty = (itemId: string, delta: number) => {
    setCart((prev) => {
      const i = prev.findIndex((c) => c.item.id === itemId);
      if (i < 0) return prev;
      const next = [...prev];
      const q = next[i].quantity + delta;
      if (q <= 0) {
        next.splice(i, 1);
        return next;
      }
      next[i] = { ...next[i], quantity: q };
      return next;
    });
  };

  const total = useMemo(
    () => cart.reduce((s, c) => s + Number(c.item.price) * c.quantity, 0),
    [cart]
  );

  const currency = cart[0]?.item.currency ?? catalog[0]?.currency ?? 'try';

  const checkout = async () => {
    if (cart.length === 0) {
      Alert.alert('Sepet boş', 'Ödeme için en az bir ürün seçin.');
      return;
    }
    setPaying(true);
    try {
      const payment = await createGuestExtraStripePayment(
        cart.map((c) => ({ catalogId: c.item.id, quantity: c.quantity }))
      );
      const canOpen = await Linking.canOpenURL(payment.payUrl);
      if (!canOpen) {
        Alert.alert('Hata', 'Ödeme sayfası açılamadı.');
        setPaying(false);
        return;
      }
      setCart([]);
      await Linking.openURL(payment.payUrl);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Ödeme başlatılamadı');
    } finally {
      setPaying(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, HotelExtraCatalogItem[]>();
    for (const item of catalog) {
      const key = item.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, [catalog]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ekstra hizmetler</Text>
        <TouchableOpacity onPress={() => setShowHistory((v) => !v)} hitSlop={12}>
          <Ionicons name="receipt-outline" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Battaniye, su ve diğer ekstralar otel tarafından güncellenir. Ödeme sonrası resepsiyon bilgilendirilir.
      </Text>

      {loading && catalog.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={theme.colors.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, cart.length > 0 && { paddingBottom: 120 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {showHistory ? (
            <View style={styles.historyBlock}>
              <Text style={styles.sectionTitle}>Ödeme geçmişim</Text>
              {orders.filter((o) => o.status === 'paid').length === 0 ? (
                <Text style={styles.muted}>Henüz ödenmiş sipariş yok.</Text>
              ) : (
                orders
                  .filter((o) => o.status === 'paid')
                  .map((o) => (
                    <View key={o.id} style={styles.historyCard}>
                      <Text style={styles.historyAmount}>{formatExtraPrice(o.total_amount, o.currency)}</Text>
                      {o.room_number ? <Text style={styles.muted}>Oda {o.room_number}</Text> : null}
                      {o.paid_at ? (
                        <Text style={styles.muted}>
                          {new Date(o.paid_at).toLocaleString('tr-TR', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      ) : null}
                    </View>
                  ))
              )}
            </View>
          ) : null}

          {catalog.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={40} color="#94a3b8" />
              <Text style={styles.muted}>Şu an satışta ekstra ürün yok.</Text>
            </View>
          ) : (
            grouped.map(([cat, items]) => (
              <View key={cat} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {EXTRA_CATEGORY_LABELS[cat as keyof typeof EXTRA_CATEGORY_LABELS] ?? cat}
                </Text>
                {items.map((item) => {
                  const inCart = cart.find((c) => c.item.id === item.id);
                  return (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemPrice}>{formatExtraPrice(item.price, item.currency)}</Text>
                        {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
                      </View>
                      {inCart ? (
                        <View style={styles.qtyRow}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(item.id, -1)}>
                            <Ionicons name="remove" size={18} color={theme.colors.primary} />
                          </TouchableOpacity>
                          <Text style={styles.qtyVal}>{inCart.quantity}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => adjustQty(item.id, 1)}>
                            <Ionicons name="add" size={18} color={theme.colors.primary} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity style={styles.addBtn} onPress={() => addToCart(item)}>
                          <Ionicons name="add" size={20} color="#fff" />
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      )}

      {cart.length > 0 ? (
        <View style={[styles.cartBar, { paddingBottom: insets.bottom + 12 }]}>
          <View>
            <Text style={styles.cartTotal}>{formatExtraPrice(total, currency)}</Text>
            <Text style={styles.cartMeta}>{cart.length} kalem</Text>
          </View>
          <TouchableOpacity
            style={[styles.payBtn, paying && styles.payBtnDisabled]}
            onPress={() => void checkout()}
            disabled={paying}
          >
            {paying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="card-outline" size={20} color="#fff" />
                <Text style={styles.payBtnText}>Öde</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  hint: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  scroll: { padding: 16, paddingBottom: 32 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  itemPrice: { fontSize: 14, fontWeight: '700', color: theme.colors.primary, marginTop: 2 },
  itemDesc: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyVal: { fontWeight: '700', minWidth: 20, textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  muted: { color: theme.colors.textMuted, textAlign: 'center' },
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  cartTotal: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  cartMeta: { fontSize: 12, color: theme.colors.textMuted },
  payBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  payBtnDisabled: { opacity: 0.7 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  historyBlock: { marginBottom: 24 },
  historyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  historyAmount: { fontWeight: '700', fontSize: 16 },
});
