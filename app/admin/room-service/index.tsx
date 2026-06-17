import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  Switch,
  ActivityIndicator,
  FlatList,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  ROOM_SERVICE_NEXT_STATUS,
  ROOM_SERVICE_STATUS_LABELS,
  deleteRoomServiceCategory,
  deleteRoomServiceMenuItem,
  getRoomServiceOrderItems,
  listRoomServiceCategories,
  listRoomServiceMenuItems,
  listRoomServiceOrders,
  toggleRoomServiceMenuItemAvailability,
  updateRoomServiceOrderStatus,
  upsertRoomServiceCategory,
  upsertRoomServiceMenuItem,
  type RoomServiceCategory,
  type RoomServiceMenuItem,
  type RoomServiceOrderRow,
  type RoomServiceOrderStatus,
} from '@/lib/roomServiceAdmin';

type Tab = 'orders' | 'menu' | 'categories';

const STATUS_COLORS: Record<RoomServiceOrderStatus, string> = {
  pending: '#d97706',
  confirmed: '#2563eb',
  preparing: '#7c3aed',
  delivered: '#059669',
  cancelled: '#dc2626',
};

function formatTrDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminRoomServiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Platform.OS === 'ios' ? insets.top + 10 : insets.top + 12;
  const [tab, setTab] = useState<Tab>('orders');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<RoomServiceOrderRow[]>([]);
  const [categories, setCategories] = useState<RoomServiceCategory[]>([]);
  const [items, setItems] = useState<RoomServiceMenuItem[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderItemsMap, setOrderItemsMap] = useState<Record<string, Awaited<ReturnType<typeof getRoomServiceOrderItems>>['data']>>({});

  const [categoryModal, setCategoryModal] = useState<{ id?: string; name: string; sort_order: string } | null>(null);
  const [itemModal, setItemModal] = useState<{
    id?: string;
    category_id: string;
    name: string;
    description: string;
    price: string;
    sort_order: string;
    is_available: boolean;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const pendingCount = useMemo(() => orders.filter((o) => o.status === 'pending').length, [orders]);

  const load = useCallback(async () => {
    const [orderRes, catRes, itemRes] = await Promise.all([
      listRoomServiceOrders(),
      listRoomServiceCategories(),
      listRoomServiceMenuItems(),
    ]);
    setOrders((orderRes.data as RoomServiceOrderRow[]) ?? []);
    setCategories((catRes.data as RoomServiceCategory[]) ?? []);
    setItems((itemRes.data as RoomServiceMenuItem[]) ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleOrderExpand = async (orderId: string) => {
    if (expandedOrderId === orderId) {
      setExpandedOrderId(null);
      return;
    }
    setExpandedOrderId(orderId);
    if (!orderItemsMap[orderId]) {
      const res = await getRoomServiceOrderItems(orderId);
      setOrderItemsMap((prev) => ({ ...prev, [orderId]: res.data ?? [] }));
    }
  };

  const advanceOrder = (order: RoomServiceOrderRow) => {
    const next = ROOM_SERVICE_NEXT_STATUS[order.status];
    if (!next) return;
    Alert.alert('Durum güncelle', `${ROOM_SERVICE_STATUS_LABELS[order.status]} → ${ROOM_SERVICE_STATUS_LABELS[next]}?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Güncelle',
        onPress: async () => {
          const { error } = await updateRoomServiceOrderStatus(order.id, next);
          if (error) Alert.alert('Hata', error.message);
          else await load();
        },
      },
    ]);
  };

  const cancelOrder = (order: RoomServiceOrderRow) => {
    Alert.alert('Siparişi iptal et', 'Bu sipariş iptal edilsin mi?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'İptal et',
        style: 'destructive',
        onPress: async () => {
          const { error } = await updateRoomServiceOrderStatus(order.id, 'cancelled');
          if (error) Alert.alert('Hata', error.message);
          else await load();
        },
      },
    ]);
  };

  const saveCategory = async () => {
    if (!categoryModal?.name.trim()) {
      Alert.alert('Kategori adı gerekli');
      return;
    }
    setSaving(true);
    const sort = Number(categoryModal.sort_order) || 0;
    const { error } = await upsertRoomServiceCategory({
      id: categoryModal.id,
      name: categoryModal.name,
      sort_order: sort,
    });
    setSaving(false);
    if (error) Alert.alert('Hata', error.message);
    else {
      setCategoryModal(null);
      await load();
    }
  };

  const saveItem = async () => {
    if (!itemModal?.name.trim()) {
      Alert.alert('Ürün adı gerekli');
      return;
    }
    const price = Number(String(itemModal.price).replace(',', '.'));
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Geçerli bir fiyat girin');
      return;
    }
    setSaving(true);
    const { error } = await upsertRoomServiceMenuItem({
      id: itemModal.id,
      category_id: itemModal.category_id || null,
      name: itemModal.name,
      description: itemModal.description,
      price,
      is_available: itemModal.is_available,
      sort_order: Number(itemModal.sort_order) || 0,
    });
    setSaving(false);
    if (error) Alert.alert('Hata', error.message);
    else {
      setItemModal(null);
      await load();
    }
  };

  const openNewCategory = () => setCategoryModal({ name: '', sort_order: String(categories.length + 1) });
  const openEditCategory = (cat: RoomServiceCategory) =>
    setCategoryModal({ id: cat.id, name: cat.name, sort_order: String(cat.sort_order) });

  const openNewItem = () =>
    setItemModal({
      category_id: categories[0]?.id ?? '',
      name: '',
      description: '',
      price: '',
      sort_order: String(items.length + 1),
      is_available: true,
    });

  const openEditItem = (item: RoomServiceMenuItem) =>
    setItemModal({
      id: item.id,
      category_id: item.category_id ?? '',
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      sort_order: String(item.sort_order),
      is_available: item.is_available,
    });

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, RoomServiceMenuItem[]>();
    for (const cat of categories) map.set(cat.id, []);
    map.set('_none', []);
    for (const item of items) {
      const key = item.category_id ?? '_none';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [categories, items]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.85}>
          <Ionicons name="arrow-back" size={18} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Oda servisi</Text>
          <Text style={styles.subtitle}>Siparişler, menü ve kategoriler</Text>
        </View>
        {pendingCount > 0 ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount} bekleyen</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.tabs}>
        {(
          [
            ['orders', 'Siparişler', 'receipt-outline'],
            ['menu', 'Menü', 'restaurant-outline'],
            ['categories', 'Kategoriler', 'folder-outline'],
          ] as const
        ).map(([key, label, icon]) => (
          <TouchableOpacity
            key={key}
            style={[styles.tab, tab === key && styles.tabActive]}
            onPress={() => setTab(key)}
            activeOpacity={0.86}
          >
            <Ionicons name={icon} size={15} color={tab === key ? adminTheme.colors.primary : adminTheme.colors.textMuted} />
            <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      >
        {tab === 'orders' ? (
          orders.length === 0 ? (
            <Text style={styles.empty}>Henüz sipariş yok.</Text>
          ) : (
            orders.map((order) => {
              const expanded = expandedOrderId === order.id;
              const lines = orderItemsMap[order.id] ?? [];
              const guestLabel = order.guest?.full_name?.trim() || order.guest?.email || 'Misafir';
              const roomLabel = order.room?.room_number ? `Oda ${order.room.room_number}` : 'Oda —';
              const next = ROOM_SERVICE_NEXT_STATUS[order.status];
              return (
                <View key={order.id} style={styles.card}>
                  <TouchableOpacity activeOpacity={0.88} onPress={() => void toggleOrderExpand(order.id)}>
                    <View style={styles.cardTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{guestLabel}</Text>
                        <Text style={styles.cardMeta}>
                          {roomLabel} · {formatTrDateTime(order.created_at)}
                        </Text>
                      </View>
                      <View style={[styles.statusPill, { backgroundColor: STATUS_COLORS[order.status] + '18' }]}>
                        <Text style={[styles.statusPillText, { color: STATUS_COLORS[order.status] }]}>
                          {ROOM_SERVICE_STATUS_LABELS[order.status]}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.cardTotal}>{Number(order.total_amount).toFixed(2)} ₺</Text>
                  </TouchableOpacity>

                  {expanded ? (
                    <View style={styles.orderLines}>
                      {lines.length === 0 ? (
                        <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                      ) : (
                        lines.map((line) => (
                          <Text key={line.id} style={styles.orderLine}>
                            {line.quantity}× {(line.menu_item as { name?: string } | null)?.name ?? 'Ürün'} —{' '}
                            {Number(line.unit_price).toFixed(2)} ₺
                          </Text>
                        ))
                      )}
                    </View>
                  ) : null}

                  {order.status !== 'delivered' && order.status !== 'cancelled' ? (
                    <View style={styles.cardActions}>
                      {next ? (
                        <TouchableOpacity style={styles.primaryBtn} onPress={() => advanceOrder(order)} activeOpacity={0.86}>
                          <Text style={styles.primaryBtnText}>→ {ROOM_SERVICE_STATUS_LABELS[next]}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.dangerBtn} onPress={() => cancelOrder(order)} activeOpacity={0.86}>
                        <Text style={styles.dangerBtnText}>İptal</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })
          )
        ) : null}

        {tab === 'menu' ? (
          <>
            <TouchableOpacity style={styles.addFab} onPress={openNewItem} activeOpacity={0.86}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addFabText}>Yeni ürün</Text>
            </TouchableOpacity>
            {categories.map((cat) => {
              const catItems = itemsByCategory.get(cat.id) ?? [];
              if (catItems.length === 0) return null;
              return (
                <View key={cat.id} style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>{cat.name}</Text>
                  {catItems.map((item) => (
                    <View key={item.id} style={styles.menuRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.menuName}>{item.name}</Text>
                        <Text style={styles.menuPrice}>{Number(item.price).toFixed(2)} ₺</Text>
                      </View>
                      <Switch
                        value={item.is_available}
                        onValueChange={async (v) => {
                          await toggleRoomServiceMenuItemAvailability(item.id, v);
                          await load();
                        }}
                      />
                      <TouchableOpacity onPress={() => openEditItem(item)} style={styles.iconBtn}>
                        <Ionicons name="create-outline" size={18} color={adminTheme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert('Sil', `${item.name} silinsin mi?`, [
                            { text: 'Vazgeç', style: 'cancel' },
                            {
                              text: 'Sil',
                              style: 'destructive',
                              onPress: async () => {
                                const { error } = await deleteRoomServiceMenuItem(item.id);
                                if (error) Alert.alert('Hata', error.message);
                                else await load();
                              },
                            },
                          ])
                        }
                        style={styles.iconBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color="#dc2626" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
            {(itemsByCategory.get('_none') ?? []).length > 0 ? (
              <View style={styles.menuSection}>
                <Text style={styles.menuSectionTitle}>Kategorisiz</Text>
                {(itemsByCategory.get('_none') ?? []).map((item) => (
                  <View key={item.id} style={styles.menuRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.menuName}>{item.name}</Text>
                      <Text style={styles.menuPrice}>{Number(item.price).toFixed(2)} ₺</Text>
                    </View>
                    <TouchableOpacity onPress={() => openEditItem(item)} style={styles.iconBtn}>
                      <Ionicons name="create-outline" size={18} color={adminTheme.colors.primary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
            {items.length === 0 ? <Text style={styles.empty}>Menüde ürün yok. Yeni ürün ekleyin.</Text> : null}
          </>
        ) : null}

        {tab === 'categories' ? (
          <>
            <TouchableOpacity style={styles.addFab} onPress={openNewCategory} activeOpacity={0.86}>
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addFabText}>Yeni kategori</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <View key={cat.id} style={styles.menuRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName}>{cat.name}</Text>
                  <Text style={styles.cardMeta}>Sıra: {cat.sort_order}</Text>
                </View>
                <TouchableOpacity onPress={() => openEditCategory(cat)} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={18} color={adminTheme.colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Sil', `${cat.name} silinsin mi?`, [
                      { text: 'Vazgeç', style: 'cancel' },
                      {
                        text: 'Sil',
                        style: 'destructive',
                        onPress: async () => {
                          const { error } = await deleteRoomServiceCategory(cat.id);
                          if (error) Alert.alert('Hata', error.message);
                          else await load();
                        },
                      },
                    ])
                  }
                  style={styles.iconBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#dc2626" />
                </TouchableOpacity>
              </View>
            ))}
            {categories.length === 0 ? <Text style={styles.empty}>Kategori yok.</Text> : null}
          </>
        ) : null}
      </ScrollView>

      <Modal visible={!!categoryModal} transparent animationType="fade" onRequestClose={() => setCategoryModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{categoryModal?.id ? 'Kategori düzenle' : 'Yeni kategori'}</Text>
            <TextInput
              style={styles.input}
              placeholder="Kategori adı"
              value={categoryModal?.name ?? ''}
              onChangeText={(name) => setCategoryModal((p) => (p ? { ...p, name } : p))}
            />
            <TextInput
              style={styles.input}
              placeholder="Sıra"
              keyboardType="number-pad"
              value={categoryModal?.sort_order ?? ''}
              onChangeText={(sort_order) => setCategoryModal((p) => (p ? { ...p, sort_order } : p))}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCategoryModal(null)}>
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => void saveCategory()} disabled={saving}>
                <Text style={styles.primaryBtnText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!itemModal} transparent animationType="fade" onRequestClose={() => setItemModal(null)}>
        <View style={styles.modalBackdrop}>
          <ScrollView contentContainerStyle={styles.modalScroll}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>{itemModal?.id ? 'Ürün düzenle' : 'Yeni ürün'}</Text>
              <Text style={styles.fieldLabel}>Kategori</Text>
              <FlatList
                horizontal
                data={categories}
                keyExtractor={(c) => c.id}
                showsHorizontalScrollIndicator={false}
                style={styles.catPicker}
                renderItem={({ item: cat }) => {
                  const selected = itemModal?.category_id === cat.id;
                  return (
                    <TouchableOpacity
                      style={[styles.catChip, selected && styles.catChipOn]}
                      onPress={() => setItemModal((p) => (p ? { ...p, category_id: cat.id } : p))}
                    >
                      <Text style={[styles.catChipText, selected && styles.catChipTextOn]}>{cat.name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
              <TextInput
                style={styles.input}
                placeholder="Ürün adı"
                value={itemModal?.name ?? ''}
                onChangeText={(name) => setItemModal((p) => (p ? { ...p, name } : p))}
              />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Açıklama"
                multiline
                value={itemModal?.description ?? ''}
                onChangeText={(description) => setItemModal((p) => (p ? { ...p, description } : p))}
              />
              <TextInput
                style={styles.input}
                placeholder="Fiyat (₺)"
                keyboardType="decimal-pad"
                value={itemModal?.price ?? ''}
                onChangeText={(price) => setItemModal((p) => (p ? { ...p, price } : p))}
              />
              <TextInput
                style={styles.input}
                placeholder="Sıra"
                keyboardType="number-pad"
                value={itemModal?.sort_order ?? ''}
                onChangeText={(sort_order) => setItemModal((p) => (p ? { ...p, sort_order } : p))}
              />
              <View style={styles.switchRow}>
                <Text style={styles.fieldLabel}>Misafire açık</Text>
                <Switch
                  value={itemModal?.is_available ?? true}
                  onValueChange={(is_available) => setItemModal((p) => (p ? { ...p, is_available } : p))}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setItemModal(null)}>
                  <Text style={styles.modalCancelText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={() => void saveItem()} disabled={saving}>
                  <Text style={styles.primaryBtnText}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  subtitle: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  pendingBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  pendingBadgeText: { fontSize: 11, fontWeight: '800', color: '#b45309' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12, backgroundColor: '#fff' },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tabActive: { borderColor: adminTheme.colors.primary, backgroundColor: adminTheme.colors.primary + '10' },
  tabText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  tabTextActive: { color: adminTheme.colors.primary },
  content: { paddingHorizontal: 14, paddingTop: 18, paddingBottom: 28, gap: 10 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24, fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  cardMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  cardTotal: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.primary, marginTop: 8 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  orderLines: { marginTop: 10, gap: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: adminTheme.colors.border },
  orderLine: { fontSize: 13, color: adminTheme.colors.text },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  primaryBtn: {
    flex: 1,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dangerBtn: {
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    justifyContent: 'center',
  },
  dangerBtnText: { color: '#dc2626', fontWeight: '800', fontSize: 13 },
  addFab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 11,
    marginBottom: 4,
  },
  addFabText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  menuSection: { gap: 8 },
  menuSectionTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
  },
  menuName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  menuPrice: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  iconBtn: { padding: 4 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalScroll: { flexGrow: 1, justifyContent: 'center' },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: adminTheme.colors.text,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  catPicker: { maxHeight: 44, marginBottom: 4 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginRight: 8,
  },
  catChipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  catChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  catChipTextOn: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  modalCancel: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10, borderWidth: 1, borderColor: adminTheme.colors.border },
  modalCancelText: { fontWeight: '700', color: adminTheme.colors.textMuted },
});
