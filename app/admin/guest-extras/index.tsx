import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Keyboard,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  EXTRA_CATEGORY_LABELS,
  deleteHotelExtraCatalogItem,
  listGuestExtraOrdersAdmin,
  listHotelExtraCatalogAdmin,
  resolveAdminOrganizationId,
  toggleHotelExtraCatalogAvailability,
  upsertHotelExtraCatalogItem,
  type GuestExtraOrderAdminRow,
} from '@/lib/guestExtraChargesAdmin';
import { formatExtraPrice, type HotelExtraCatalogItem, type HotelExtraCategory } from '@/lib/guestExtraCharges';

type Tab = 'catalog' | 'orders';

const CATEGORIES: HotelExtraCategory[] = ['amenity', 'beverage', 'minibar', 'laundry', 'other'];

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

const STATUS_LABELS: Record<string, string> = {
  pending_payment: 'Ödeme bekliyor',
  paid: 'Ödendi',
  cancelled: 'İptal',
  expired: 'Süresi doldu',
};

const SCREEN_H = Dimensions.get('window').height;

export default function AdminGuestExtrasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Platform.OS === 'ios' ? insets.top + 10 : insets.top + 12;
  const initialTab: Tab = params.tab === 'orders' ? 'orders' : 'catalog';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [catalog, setCatalog] = useState<HotelExtraCatalogItem[]>([]);
  const [orders, setOrders] = useState<GuestExtraOrderAdminRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const modalScrollRef = useRef<ScrollView>(null);
  const [itemModal, setItemModal] = useState<{
    id?: string;
    name: string;
    description: string;
    price: string;
    category: HotelExtraCategory;
    sort_order: string;
    is_available: boolean;
  } | null>(null);

  useEffect(() => {
    if (params.tab === 'orders' || params.tab === 'catalog') {
      setTab(params.tab);
    }
  }, [params.tab]);

  const load = useCallback(async () => {
    const oid = orgId ?? (await resolveAdminOrganizationId());
    if (!orgId && oid) setOrgId(oid);
    const [cat, ord] = await Promise.all([
      listHotelExtraCatalogAdmin(oid),
      listGuestExtraOrdersAdmin(),
    ]);
    setCatalog(cat);
    setOrders(ord);
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollModalToInput = useCallback((offsetY: number) => {
    requestAnimationFrame(() => {
      modalScrollRef.current?.scrollTo({ y: Math.max(0, offsetY), animated: true });
    });
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openNew = () => {
    setItemModal({
      name: '',
      description: '',
      price: '',
      category: 'amenity',
      sort_order: String((catalog.length + 1) * 10),
      is_available: true,
    });
  };

  const openEdit = (item: HotelExtraCatalogItem) => {
    setItemModal({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      category: item.category,
      sort_order: String(item.sort_order),
      is_available: item.is_available,
    });
  };

  const saveItem = async () => {
    if (!itemModal || !orgId) {
      Alert.alert('Hata', 'Otel bilgisi yüklenemedi. Personel kaydınızı kontrol edin.');
      return;
    }
    const name = itemModal.name.trim();
    const price = parseFloat(itemModal.price.replace(',', '.'));
    const sortOrder = parseInt(itemModal.sort_order, 10);
    if (name.length < 2) {
      Alert.alert('Eksik', 'Ürün adı girin.');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert('Eksik', 'Geçerli bir fiyat girin.');
      return;
    }
    setSaving(true);
    const { error } = await upsertHotelExtraCatalogItem({
      id: itemModal.id,
      organization_id: orgId,
      name,
      description: itemModal.description,
      price,
      category: itemModal.category,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      is_available: itemModal.is_available,
    });
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setItemModal(null);
    await load();
    Alert.alert('Tamam', itemModal.id ? 'Ürün güncellendi. Misafir hesaplarında anında görünür.' : 'Ürün eklendi.');
  };

  const confirmDelete = (item: HotelExtraCatalogItem) => {
    Alert.alert('Sil', `"${item.name}" katalogdan kaldırılsın mı?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteHotelExtraCatalogItem(item.id);
          if (error) Alert.alert('Hata', error.message);
          else await load();
        },
      },
    ]);
  };

  const paidToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return orders.filter((o) => o.status === 'paid' && o.paid_at && new Date(o.paid_at) >= start);
  }, [orders]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ekstra ücretler</Text>
        <TouchableOpacity onPress={openNew} hitSlop={12}>
          <Ionicons name="add-circle-outline" size={28} color={adminTheme.colors.primary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.sub}>
        Battaniye, su, havlu vb. fiyatları buradan girin. Misafir uygulamasında anında güncellenir; ödeme alındığında
        admin hesaplarına oda ve kalem detayıyla bildirim gider.
      </Text>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'catalog' && styles.tabActive]}
          onPress={() => setTab('catalog')}
        >
          <Text style={[styles.tabText, tab === 'catalog' && styles.tabTextActive]}>Katalog ({catalog.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'orders' && styles.tabActive]}
          onPress={() => setTab('orders')}
        >
          <Text style={[styles.tabText, tab === 'orders' && styles.tabTextActive]}>
            Ödemeler ({orders.filter((o) => o.status === 'paid').length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={adminTheme.colors.primary} />
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.scroll}
        >
          {tab === 'catalog' ? (
            catalog.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="pricetags-outline" size={40} color="#94a3b8" />
                <Text style={styles.emptyText}>Henüz ürün yok. Sağ üstten ekleyin.</Text>
              </View>
            ) : (
              catalog.map((item) => (
                <View key={item.id} style={[styles.card, !item.is_available && styles.cardOff]}>
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{item.name}</Text>
                      <Text style={styles.cardMeta}>
                        {EXTRA_CATEGORY_LABELS[item.category]} · {formatExtraPrice(item.price, item.currency)}
                      </Text>
                      {item.description ? <Text style={styles.cardDesc}>{item.description}</Text> : null}
                    </View>
                    <Switch
                      value={item.is_available}
                      onValueChange={async (v) => {
                        await toggleHotelExtraCatalogAvailability(item.id, v);
                        await load();
                      }}
                    />
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity style={styles.cardBtn} onPress={() => openEdit(item)}>
                      <Ionicons name="create-outline" size={18} color={adminTheme.colors.primary} />
                      <Text style={styles.cardBtnText}>Düzenle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cardBtn} onPress={() => confirmDelete(item)}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )
          ) : (
            <>
              <View style={styles.statsRow}>
                <Text style={styles.statsText}>Bugün {paidToday.length} ödeme</Text>
                <TouchableOpacity onPress={() => router.push('/admin/payments')}>
                  <Text style={styles.link}>Tüm ödemeler →</Text>
                </TouchableOpacity>
              </View>
              {orders.length === 0 ? (
                <Text style={styles.emptyText}>Henüz sipariş yok.</Text>
              ) : (
                orders.map((o) => (
                  <View key={o.id} style={styles.orderCard}>
                    <View style={styles.orderTop}>
                      <Text style={styles.orderAmount}>{formatExtraPrice(o.total_amount, o.currency)}</Text>
                      <Text
                        style={[
                          styles.orderStatus,
                          o.status === 'paid' && { color: '#16a34a' },
                          o.status === 'pending_payment' && { color: '#d97706' },
                        ]}
                      >
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Text>
                    </View>
                    <Text style={styles.orderGuest}>
                      {(o.guest as { full_name?: string | null } | null)?.full_name?.trim() || 'Misafir'}
                      {o.room_number ? ` · Oda ${o.room_number}` : ''}
                    </Text>
                    {o.items?.length ? (
                      <Text style={styles.orderItems}>
                        {o.items.map((i) => `${i.item_name} x${i.quantity}`).join(' · ')}
                      </Text>
                    ) : null}
                    <Text style={styles.orderTime}>{formatTrDateTime(o.paid_at ?? o.created_at)}</Text>
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}

      <Modal
        visible={!!itemModal}
        transparent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setItemModal(null);
        }}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
        >
          <Pressable
            style={styles.modalDismiss}
            onPress={() => {
              Keyboard.dismiss();
              setItemModal(null);
            }}
          />
          <View
            style={[
              styles.modalSheet,
              {
                paddingBottom: Math.max(insets.bottom, 20),
                marginBottom: keyboardHeight,
                maxHeight: keyboardHeight > 0 ? SCREEN_H - keyboardHeight - insets.top - 16 : SCREEN_H * 0.88,
              },
            ]}
          >
            <ScrollView
              ref={modalScrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.modalTitle}>{itemModal?.id ? 'Ürünü düzenle' : 'Yeni ekstra ürün'}</Text>
              <TextInput
                style={styles.input}
                placeholder="Ad (örn. Battaniye)"
                value={itemModal?.name ?? ''}
                onChangeText={(t) => setItemModal((m) => (m ? { ...m, name: t } : m))}
                onFocus={() => scrollModalToInput(0)}
              />
              <TextInput
                style={[styles.input, styles.inputMulti]}
                placeholder="Açıklama (isteğe bağlı)"
                multiline
                value={itemModal?.description ?? ''}
                onChangeText={(t) => setItemModal((m) => (m ? { ...m, description: t } : m))}
                onFocus={() => scrollModalToInput(72)}
              />
              <TextInput
                style={styles.input}
                placeholder="Fiyat (₺)"
                keyboardType="decimal-pad"
                value={itemModal?.price ?? ''}
                onChangeText={(t) => setItemModal((m) => (m ? { ...m, price: t } : m))}
                onFocus={() => scrollModalToInput(160)}
              />
              <Text style={styles.label}>Kategori</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catRow}>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, itemModal?.category === c && styles.catChipActive]}
                    onPress={() => setItemModal((m) => (m ? { ...m, category: c } : m))}
                  >
                    <Text style={[styles.catChipText, itemModal?.category === c && styles.catChipTextActive]}>
                      {EXTRA_CATEGORY_LABELS[c]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={styles.modalRow}>
                <Text style={styles.label}>Satışta</Text>
                <Switch
                  value={itemModal?.is_available ?? true}
                  onValueChange={(v) => setItemModal((m) => (m ? { ...m, is_available: v } : m))}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalCancel}
                  onPress={() => {
                    Keyboard.dismiss();
                    setItemModal(null);
                  }}
                >
                  <Text>İptal</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSave} onPress={() => void saveItem()} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalSaveText}>Kaydet</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text },
  sub: { paddingHorizontal: 16, fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 18, marginBottom: 8 },
  tabs: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 8, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: adminTheme.colors.primary + '22' },
  tabText: { fontWeight: '600', color: adminTheme.colors.textMuted },
  tabTextActive: { color: adminTheme.colors.primary },
  scroll: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { color: adminTheme.colors.textMuted, textAlign: 'center' },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: adminTheme.colors.border,
  },
  cardOff: { opacity: 0.55 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  cardMeta: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 2 },
  cardDesc: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  cardActions: { flexDirection: 'row', marginTop: 10, gap: 16 },
  cardBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardBtnText: { color: adminTheme.colors.primary, fontWeight: '600' },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statsText: { fontWeight: '600', color: adminTheme.colors.text },
  link: { color: adminTheme.colors.primary, fontWeight: '600' },
  orderCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderAmount: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  orderStatus: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  orderGuest: { marginTop: 6, fontWeight: '600', color: adminTheme.colors.text },
  orderItems: { marginTop: 4, fontSize: 13, color: adminTheme.colors.textMuted },
  orderTime: { marginTop: 6, fontSize: 12, color: '#94a3b8' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: SCREEN_H * 0.88,
  },
  modalScrollContent: { paddingBottom: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    fontSize: 16,
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  label: { fontWeight: '600', marginBottom: 6, color: '#334155' },
  catRow: { marginBottom: 12, maxHeight: 44 },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    marginRight: 8,
  },
  catChipActive: { backgroundColor: adminTheme.colors.primary },
  catChipText: { fontSize: 13, color: '#475569' },
  catChipTextActive: { color: '#fff', fontWeight: '600' },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  modalSave: {
    flex: 1,
    padding: 14,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});
