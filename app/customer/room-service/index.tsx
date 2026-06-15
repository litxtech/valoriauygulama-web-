import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { useTranslation } from 'react-i18next';
import { guestServiceText } from '@/lib/guestServiceRequestsI18n';

type Category = { id: string; name: string; sort_order: number };
type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  is_available: boolean;
  sort_order: number;
};

type CartItem = { item: MenuItem; quantity: number };

export default function RoomServiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuthStore();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [catRes, itemRes] = await Promise.all([
        supabase.from('room_service_categories').select('id, name, sort_order').order('sort_order'),
        supabase
          .from('room_service_menu_items')
          .select('id, category_id, name, description, price, image_url, is_available, sort_order')
          .eq('is_available', true)
          .order('sort_order'),
      ]);
      setCategories((catRes.data as Category[]) ?? []);
      setItems((itemRes.data as MenuItem[]) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  const addToCart = (item: MenuItem) => {
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

  const removeFromCart = (itemId: string) => {
    setCart((prev) => prev.filter((c) => c.item.id !== itemId));
  };

  const adjustQuantity = (itemId: string, delta: number) => {
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

  const total = cart.reduce((s, c) => s + c.item.price * c.quantity, 0);

  const placeOrder = async () => {
    if (cart.length === 0) {
      Alert.alert(t('roomServiceCartEmptyTitle'), t('roomServiceCartEmptyBody'));
      return;
    }
    setSubmitting(true);
    try {
      let guestId: string | null = null;
      let roomId: string | null = null;
      if (user?.email) {
        const { data: guest } = await supabase
          .from('guests')
          .select('id, room_id')
          .eq('email', user.email)
          .eq('status', 'checked_in')
          .order('check_in_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (guest) {
          guestId = (guest as { id: string }).id;
          roomId = (guest as { room_id: string | null }).room_id;
        }
      }
      if (!guestId) {
        Alert.alert(t('roomServiceNotEligibleTitle'), t('roomServiceNotEligibleBody'));
        setSubmitting(false);
        return;
      }

      const { data: order, error: orderErr } = await supabase
        .from('room_service_orders')
        .insert({ guest_id: guestId, room_id: roomId, total_amount: total, status: 'pending' })
        .select('id')
        .single();

      if (orderErr || !order) {
        Alert.alert(
          t('error'),
          t('roomServiceOrderFailed') + ': ' + (orderErr?.message ?? t('unknownErrorShort'))
        );
        setSubmitting(false);
        return;
      }

      const orderId = (order as { id: string }).id;
      const rows = cart.map((c) => ({
        order_id: orderId,
        menu_item_id: c.item.id,
        quantity: c.quantity,
        unit_price: c.item.price,
      }));
      const { error: itemsErr } = await supabase.from('room_service_order_items').insert(rows);

      if (itemsErr) {
        Alert.alert(t('error'), t('roomServiceItemsAddFailed'));
        setSubmitting(false);
        return;
      }

      const { notifyAdmins } = await import('@/lib/notificationService');
      notifyAdmins({
        title: t('roomServiceAdminNotifyTitle'),
        body: t('roomServiceAdminNotifyBody'),
        data: { url: '/admin/room-service' },
      }).catch(() => {});

      setCart([]);
      Alert.alert(t('roomServicePlacedTitle'), t('roomServicePlacedBody'));
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  const byCategory = categories.map((cat) => ({
    ...cat,
    items: items.filter((i) => i.category_id === cat.id),
  }));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>🍽️ {guestServiceText('roomServiceScreenTitle')}</Text>
        <Text style={styles.subtitle}>{t('roomServiceScreenSubtitle')}</Text>

        {byCategory.map(
          (cat) =>
            cat.items.length > 0 && (
              <View key={cat.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{cat.name}</Text>
                {cat.items.map((item) => (
                  <View key={item.id} style={styles.itemRow}>
                    {item.image_url ? (
                      <CachedImage uri={item.image_url} style={styles.itemImage} contentFit="cover" />
                    ) : (
                      <View style={styles.itemImagePlaceholder}>
                        <Text style={styles.itemImageIcon}>🍽️</Text>
                      </View>
                    )}
                    <View style={styles.itemBody}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.description ? (
                        <Text style={styles.itemDesc} numberOfLines={2}>{item.description}</Text>
                      ) : null}
                      <Text style={styles.itemPrice}>{Number(item.price).toFixed(2)} ₺</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => addToCart(item)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.addBtnText}>+ {guestServiceText('roomServiceAdd')}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )
        )}
      </ScrollView>

      {cart.length > 0 && (
        <View style={styles.cartBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cartScroll}>
            {cart.map((c) => (
              <View key={c.item.id} style={styles.cartChip}>
                <Text style={styles.cartChipName}>{c.item.name} x{c.quantity}</Text>
                <View style={styles.cartChipQty}>
                  <TouchableOpacity onPress={() => adjustQuantity(c.item.id, -1)}>
                    <Text style={styles.cartQtyBtn}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.cartQtyNum}>{c.quantity}</Text>
                  <TouchableOpacity onPress={() => adjustQuantity(c.item.id, 1)}>
                    <Text style={styles.cartQtyBtn}>+</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => removeFromCart(c.item.id)}>
                  <Text style={styles.cartRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
          <View style={styles.cartFooter}>
            <Text style={styles.cartTotal}>{t('guestRoomServiceTotal', { total: total.toFixed(2) })}</Text>
            <TouchableOpacity
              style={[styles.orderBtn, submitting && styles.orderBtnDisabled]}
              onPress={placeOrder}
              disabled={submitting}
            >
              <Text style={styles.orderBtnText}>
                {submitting ? t('guestRoomServiceSubmitting') : t('guestRoomServiceOrder')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: theme.spacing.lg, paddingBottom: 120 },
  title: { ...theme.typography.title, color: theme.colors.text, marginBottom: 4 },
  subtitle: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, marginBottom: theme.spacing.xl },
  section: { marginBottom: theme.spacing.xl },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.md },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  itemImage: { width: 64, height: 64, borderRadius: theme.radius.sm },
  itemImagePlaceholder: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemImageIcon: { fontSize: 28 },
  itemBody: { flex: 1, marginLeft: theme.spacing.md },
  itemName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  itemDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  itemPrice: { fontSize: 15, fontWeight: '600', color: theme.colors.primary, marginTop: 4 },
  addBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
  },
  addBtnText: { color: theme.colors.white, fontWeight: '600', fontSize: 14 },
  cartBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  cartScroll: { maxHeight: 56, marginBottom: 8 },
  cartChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.sm,
    marginRight: 8,
  },
  cartChipName: { fontSize: 13, color: theme.colors.text, marginRight: 8 },
  cartChipQty: { flexDirection: 'row', alignItems: 'center', marginRight: 6 },
  cartQtyBtn: { fontSize: 18, color: theme.colors.primary, paddingHorizontal: 4 },
  cartQtyNum: { fontSize: 14, fontWeight: '600', minWidth: 20, textAlign: 'center' },
  cartRemove: { fontSize: 14, color: theme.colors.error },
  cartFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cartTotal: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  orderBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: theme.radius.md,
  },
  orderBtnDisabled: { opacity: 0.7 },
  orderBtnText: { color: theme.colors.white, fontWeight: '700', fontSize: 15 },
});
