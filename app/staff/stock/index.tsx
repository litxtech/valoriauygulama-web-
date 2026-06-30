import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { StockInventoryList, type StockInventoryListItem } from '@/components/stock/StockInventoryList';
import { StockHubCompact } from '@/components/stock/StockHubCompact';
import { buildLatestPhotoProofByProductId, resolveStockProductImageUrl } from '@/lib/stockProductImages';

type Product = {
  id: string;
  name: string;
  unit: string | null;
  current_stock: number | null;
  min_stock: number | null;
  image_url: string | null;
  created_at: string;
  created_by: string | null;
  category: { name: string } | null;
  creator: { full_name: string | null } | null;
};

type MovementRow = {
  id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  photo_proof: string | null;
  product: { name: string } | null;
  staff: { full_name: string | null } | null;
};

export default function StaffStockListScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const listBottomPad = getFloatingTabBarTotalHeight(insets) + 24;
  const palette = usePersonelDesign();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState<MovementRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [productModalProduct, setProductModalProduct] = useState<Product | null>(null);
  const [recentModalVisible, setRecentModalVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [photoByProductId, setPhotoByProductId] = useState<Record<string, string>>({});

  const load = async () => {
    const [prodRes, photoRes] = await Promise.all([
      supabase
        .from('stock_products')
        .select(
          'id, name, unit, current_stock, min_stock, image_url, created_at, created_by, category:stock_categories(name), creator:created_by(full_name)'
        )
        .order('name'),
      supabase
        .from('stock_movements')
        .select('product_id, photo_proof')
        .not('photo_proof', 'is', null)
        .order('created_at', { ascending: false })
        .limit(500),
    ]);
    setProducts((prodRes.data ?? []) as unknown as Product[]);
    setPhotoByProductId(
      buildLatestPhotoProofByProductId(
        (photoRes.data ?? []) as Array<{ product_id: string; photo_proof: string | null }>
      )
    );
  };

  const loadRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, created_at, status, photo_proof, product:stock_products(name), staff:staff_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(15);
    setRecent((data ?? []) as unknown as MovementRow[]);
    setLoadingRecent(false);
  };

  useEffect(() => {
    load();
    loadRecent();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadRecent()]);
    setRefreshing(false);
  };

  const filtered = products
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));

  const listItems: StockInventoryListItem[] = filtered.map((p) => {
    const cat = p.category as { name: string } | null;
    return {
      id: p.id,
      name: p.name,
      unit: p.unit,
      current_stock: p.current_stock,
      min_stock: p.min_stock,
      categoryName: cat?.name ?? null,
      imageUrl: resolveStockProductImageUrl(p.image_url, photoByProductId[p.id]),
    };
  });

  const openRecentModal = () => {
    setRecentModalVisible(true);
    loadRecent();
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.pageBg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPad }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StockHubCompact onNavigate={(route) => router.push(route as never)} />

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.search}
            placeholder="Ürün ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={12}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Stok listesi ({filtered.length})</Text>
          <Text style={styles.sectionHint}>Kaydırın — örn. Şampuan 1 adet, Domestos 3 adet</Text>
          <StockInventoryList
            items={listItems}
            onPress={(item) => {
              const p = products.find((x) => x.id === item.id);
              if (p) setProductModalProduct(p);
            }}
            showRowIndex
            emptyMessage="Ürün yok veya arama sonucu yok."
          />
        </View>

        <TouchableOpacity style={styles.sonIslemlerBtn} onPress={openRecentModal} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.sonIslemlerBtnText}>Son işlemler</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={!!productModalProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setProductModalProduct(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setProductModalProduct(null)}>
          <Pressable style={styles.productModalBox} onPress={(e) => e.stopPropagation()}>
            {productModalProduct && (
              <>
                <Text style={styles.productModalTitle} numberOfLines={2}>
                  {productModalProduct.name}
                </Text>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => {
                    setProductModalProduct(null);
                    router.push(`/staff/stock/product/${productModalProduct.id}`);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="open-outline" size={18} color={theme.colors.text} />
                  <Text style={styles.productModalBtnText}>Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.productModalBtn, styles.productModalBtnPrimary]}
                  onPress={() => {
                    setProductModalProduct(null);
                    router.push({ pathname: '/staff/stock/entry', params: { productId: productModalProduct.id } });
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-down-circle-outline" size={18} color="#fff" />
                  <Text style={styles.productModalBtnTextWhite}>Stok girişi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => {
                    setProductModalProduct(null);
                    router.push({ pathname: '/staff/stock/exit', params: { productId: productModalProduct.id } });
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up-circle-outline" size={18} color={theme.colors.text} />
                  <Text style={styles.productModalBtnText}>Stok çıkışı</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={recentModalVisible} transparent animationType="fade" onRequestClose={() => setRecentModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRecentModalVisible(false)}>
          <Pressable style={styles.recentModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.recentModalTitle}>Son işlemler</Text>
            {loadingRecent ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
            ) : recent.length === 0 ? (
              <Text style={styles.emptyText}>Henüz işlem yok.</Text>
            ) : (
              <ScrollView style={styles.recentModalScroll} showsVerticalScrollIndicator={false}>
                {recent.map((m) => {
                  const name = (m.product as { name?: string } | null)?.name ?? '—';
                  const staffName = (m.staff as { full_name?: string } | null)?.full_name ?? '—';
                  const typeLabel = m.movement_type === 'in' ? 'Giriş' : 'Çıkış';
                  const time = new Date(m.created_at).toLocaleTimeString('tr-TR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const statusLabel =
                    m.status === 'pending' ? 'Onay bekliyor' : m.status === 'approved' ? 'Onaylandı' : 'Reddedildi';
                  const hasPhoto = !!m.photo_proof;
                  return (
                    <View key={m.id} style={styles.recentRow}>
                      <View style={styles.recentRowMain}>
                        <View style={styles.recentRowTextBlock}>
                          <Text style={styles.recentText}>
                            {typeLabel} · {name} ({m.quantity})
                          </Text>
                          <Text style={styles.recentMeta}>
                            {time} · {statusLabel}
                          </Text>
                          <Text style={styles.recentStaff}>{staffName}</Text>
                        </View>
                        {hasPhoto ? (
                          <TouchableOpacity
                            style={styles.recentRowThumb}
                            onPress={() => setPreviewUri(m.photo_proof)}
                            activeOpacity={0.8}
                          >
                            <CachedImage uri={m.photo_proof!} style={styles.recentRowThumbImage} contentFit="cover" />
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.recentRowThumbPlaceholder}>
                            <Ionicons name="image-outline" size={22} color={theme.colors.textMuted} />
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.recentModalClose} onPress={() => setRecentModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.recentModalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 16,
  },
  search: { flex: 1, fontSize: 15, color: theme.colors.text },
  section: { marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  sectionHint: { fontSize: 13, fontWeight: '500', color: theme.colors.textMuted, marginBottom: 12 },
  sonIslemlerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sonIslemlerBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  productModalBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 10,
  },
  productModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  productModalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  productModalBtnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  productModalBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  productModalBtnTextWhite: { fontSize: 15, fontWeight: '700', color: '#fff' },
  recentModalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
  },
  recentModalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  recentModalScroll: { maxHeight: 400 },
  recentRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  recentRowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recentRowTextBlock: { flex: 1 },
  recentRowThumb: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.borderLight },
  recentRowThumbImage: { width: '100%', height: '100%' },
  recentRowThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentText: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  recentMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  recentStaff: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  recentModalClose: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  recentModalCloseText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
