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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()} ${h}:${min}`;
}

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

type IonIcon = ComponentProps<typeof Ionicons>['name'];

type StockHubAction = {
  key: string;
  label: string;
  sub: string;
  icon: IonIcon;
  route: string;
  colors?: [string, string];
  tint?: string;
  tintBg?: string;
  layout: 'hero' | 'gradient' | 'surface';
};

const STOCK_HUB_ACTIONS: StockHubAction[] = [
  {
    key: 'barcode',
    label: 'Barkod',
    sub: 'Okut ve ürünü bul',
    icon: 'scan',
    colors: ['#1e3a8a', '#2563eb'],
    route: '/staff/stock/scan',
    layout: 'hero',
  },
  {
    key: 'in',
    label: 'Stok girişi',
    sub: 'Depoya ekle',
    icon: 'arrow-down-circle',
    colors: ['#065f46', '#10b981'],
    route: '/staff/stock/entry',
    layout: 'gradient',
  },
  {
    key: 'out',
    label: 'Stok çıkışı',
    sub: 'Kullanım / satış',
    icon: 'arrow-up-circle',
    colors: ['#b45309', '#f59e0b'],
    route: '/staff/stock/exit',
    layout: 'gradient',
  },
  {
    key: 'mine',
    label: 'Stoklarım',
    sub: 'Hareket geçmişim',
    icon: 'folder-open-outline',
    tint: '#6d28d9',
    tintBg: '#ede9fe',
    route: '/staff/stock/my-movements',
    layout: 'surface',
  },
  {
    key: 'all',
    label: 'Tüm stoklar',
    sub: 'Tam envanter listesi',
    icon: 'layers',
    tint: '#0f766e',
    tintBg: '#ccfbf1',
    route: '/staff/stock/all',
    layout: 'surface',
  },
];

function StockHubActionButton({ action, onPress }: { action: StockHubAction; onPress: () => void }) {
  if (action.layout === 'hero') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.hubHero, pressed && styles.hubPressed]}
        android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      >
        <LinearGradient colors={action.colors!} style={styles.hubHeroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.5 }}>
          <View style={styles.hubHeroIcon}>
            <Ionicons name={action.icon} size={28} color="#fff" />
          </View>
          <View style={styles.hubHeroText}>
            <Text style={styles.hubHeroLabel}>{action.label}</Text>
            <Text style={styles.hubHeroSub}>{action.sub}</Text>
          </View>
          <View style={styles.hubHeroArrow}>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.95)" />
          </View>
        </LinearGradient>
      </Pressable>
    );
  }

  if (action.layout === 'gradient') {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.hubHalf, pressed && styles.hubPressed]}
        android_ripple={{ color: 'rgba(255,255,255,0.15)' }}
      >
        <LinearGradient colors={action.colors!} style={styles.hubHalfGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <View style={styles.hubHalfIcon}>
            <Ionicons name={action.icon} size={26} color="#fff" />
          </View>
          <Text style={styles.hubHalfLabel}>{action.label}</Text>
          <Text style={styles.hubHalfSub}>{action.sub}</Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.hubSurface, pressed && styles.hubSurfacePressed]}
      android_ripple={{ color: theme.colors.borderLight }}
    >
      <View style={[styles.hubSurfaceIcon, { backgroundColor: action.tintBg }]}>
        <Ionicons name={action.icon} size={22} color={action.tint} />
      </View>
      <View style={styles.hubSurfaceText}>
        <Text style={styles.hubSurfaceLabel}>{action.label}</Text>
        <Text style={styles.hubSurfaceSub}>{action.sub}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </Pressable>
  );
}

export default function StaffStockListScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState<MovementRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [productModalProduct, setProductModalProduct] = useState<Product | null>(null);
  const [recentModalVisible, setRecentModalVisible] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  /** Ürün listesinde önizleme: product_id -> son hareketin photo_proof URL'i (ürün resmi yoksa bunu gösteririz) */
  const [lastPhotoByProductId, setLastPhotoByProductId] = useState<Record<string, string>>({});

  const load = async () => {
    const { data } = await supabase
      .from('stock_products')
      .select('id, name, unit, current_stock, min_stock, image_url, created_at, created_by, category:stock_categories(name), creator:created_by(full_name)')
      .order('name');
    setProducts((data ?? []) as unknown as Product[]);
  };

  /** Stok sayfası ürün kartlarındaki önizleme için: her ürünün en son hareketindeki photo_proof */
  const loadLastPhotoPerProduct = async () => {
    const { data: movements } = await supabase
      .from('stock_movements')
      .select('product_id, photo_proof')
      .not('photo_proof', 'is', null)
      .order('created_at', { ascending: false });
    const byProduct: Record<string, string> = {};
    for (const m of movements ?? []) {
      const pid = (m as { product_id: string }).product_id;
      const url = (m as { photo_proof: string }).photo_proof;
      if (pid && url && !(pid in byProduct)) byProduct[pid] = url;
    }
    setLastPhotoByProductId(byProduct);
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
    loadLastPhotoPerProduct();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadRecent(), loadLastPhotoPerProduct()]);
    setRefreshing(false);
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const openRecentModal = () => {
    setRecentModalVisible(true);
    loadRecent();
  };

  return (
    <View style={styles.container}>
      <View style={styles.actionsPanel}>
        <Text style={styles.actionsTitle}>Stok işlemleri</Text>
        <View style={styles.hubGrid}>
          <StockHubActionButton
            action={STOCK_HUB_ACTIONS[0]}
            onPress={() => router.push(STOCK_HUB_ACTIONS[0].route as never)}
          />
          <View style={styles.hubHalfRow}>
            <StockHubActionButton
              action={STOCK_HUB_ACTIONS[1]}
              onPress={() => router.push(STOCK_HUB_ACTIONS[1].route as never)}
            />
            <StockHubActionButton
              action={STOCK_HUB_ACTIONS[2]}
              onPress={() => router.push(STOCK_HUB_ACTIONS[2].route as never)}
            />
          </View>
          <View style={styles.hubHalfRow}>
            <StockHubActionButton
              action={STOCK_HUB_ACTIONS[3]}
              onPress={() => router.push(STOCK_HUB_ACTIONS[3].route as never)}
            />
            <StockHubActionButton
              action={STOCK_HUB_ACTIONS[4]}
              onPress={() => router.push(STOCK_HUB_ACTIONS[4].route as never)}
            />
          </View>
        </View>
      </View>

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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 TÜM ÜRÜNLER ({filtered.length})</Text>
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>Ürün yok veya arama sonucu yok.</Text>
          )}
          {filtered.map((p) => {
            const cur = p.current_stock ?? 0;
            const min = p.min_stock ?? 0;
            const isLow = cur <= 3;
            const addedBy = p.creator?.full_name ?? '—';
            const addedAt = p.created_at ? formatShortDateTime(p.created_at) : '—';
            const previewImageUrl = p.image_url ?? lastPhotoByProductId[p.id] ?? null;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.productCard, isLow && styles.productCardLow]}
                onPress={() => setProductModalProduct(p)}
                activeOpacity={0.85}
              >
                <Text style={styles.cardName}>{p.name}</Text>
                <Text style={styles.cardStock}>Stok: {cur} {p.unit ?? 'adet'}{isLow ? '  ⚠️ Kritik' : ''}</Text>
                <View style={styles.cardImageWrap}>
                  {previewImageUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={(e) => { e.stopPropagation(); setPreviewUri(previewImageUrl); }}
                      style={styles.cardImageTouch}
                    >
                      <CachedImage
                        uri={previewImageUrl}
                        style={styles.cardImage}
                        contentFit="cover"
                      />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.cardImagePlaceholder}>
                      <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                      <Text style={styles.cardImagePlaceholderText}>Ürün resmi yok</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardMeta}>📦 Ekleyen: {addedBy}</Text>
                <Text style={styles.cardMeta}>📅 {addedAt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.sonIslemlerBtn} onPress={openRecentModal} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
          <Text style={styles.sonIslemlerBtnText}>Son İşlemler</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Ürün aksiyon modalı: boşluğa tıklayınca kapanır, büyük resim yok */}
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
                <Text style={styles.productModalTitle} numberOfLines={2}>{productModalProduct.name}</Text>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => { setProductModalProduct(null); router.push(`/staff/stock/product/${productModalProduct.id}`); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnText}>🔍 Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.productModalBtn, styles.productModalBtnPrimary]}
                  onPress={() => { setProductModalProduct(null); router.push({ pathname: '/staff/stock/entry', params: { productId: productModalProduct.id } }); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnTextWhite}>📥 Stok Girişi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => { setProductModalProduct(null); router.push({ pathname: '/staff/stock/exit', params: { productId: productModalProduct.id } }); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnText}>📤 Stok Çıkışı</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Son işlemler modalı */}
      <Modal
        visible={recentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecentModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRecentModalVisible(false)}>
          <Pressable style={styles.recentModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.recentModalTitle}>⚡ Son işlemler</Text>
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
                  const time = new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                  const statusLabel = m.status === 'pending' ? 'Onay bekliyor' : (m.status === 'approved' ? 'Onaylandı' : 'Reddedildi');
                  const hasPhoto = !!m.photo_proof;
                  return (
                    <View key={m.id} style={styles.recentRow}>
                      <View style={styles.recentRowMain}>
                        <View style={styles.recentRowTextBlock}>
                          <Text style={styles.recentText}>{typeLabel} · {name} ({m.quantity})</Text>
                          <Text style={styles.recentMeta}>{time} · {statusLabel}</Text>
                          <Text style={styles.recentStaff}>👤 {staffName}</Text>
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
                            <Ionicons name="image-outline" size={24} color={theme.colors.textMuted} />
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
  actionsPanel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  actionsTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  hubGrid: { gap: 10 },
  hubPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  hubHero: {
    borderRadius: 18,
    overflow: 'hidden',
    ...theme.shadows.md,
    ...(Platform.OS === 'android' ? { elevation: 4 } : {}),
  },
  hubHeroGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 14,
    minHeight: 76,
  },
  hubHeroIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubHeroText: { flex: 1, minWidth: 0 },
  hubHeroLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
  hubHeroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.88)', marginTop: 3 },
  hubHeroArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubHalfRow: { flexDirection: 'row', gap: 10 },
  hubHalf: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    ...theme.shadows.md,
  },
  hubHalfGrad: {
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'flex-start',
    minHeight: 118,
    justifyContent: 'space-between',
  },
  hubHalfIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  hubHalfLabel: { fontSize: 14, fontWeight: '800', color: '#fff' },
  hubHalfSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  hubSurface: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  hubSurfacePressed: { backgroundColor: theme.colors.backgroundSecondary },
  hubSurfaceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubSurfaceText: { flex: 1, minWidth: 0 },
  hubSurfaceLabel: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  hubSurfaceSub: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  sonIslemlerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sonIslemlerBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: theme.colors.text },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 100 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  productCard: {
    backgroundColor: theme.colors.surface,
    padding: 18,
    borderRadius: theme.radius.lg,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  productCardLow: { borderLeftWidth: 4, borderLeftColor: theme.colors.error },
  cardName: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  cardStock: { fontSize: 14, color: theme.colors.textMuted, marginTop: 6 },
  cardImageWrap: { width: '100%', height: 220, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.borderLight, marginVertical: 12 },
  cardImageTouch: { width: '100%', height: '100%' },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.borderLight, minHeight: 220 },
  cardImagePlaceholderText: { fontSize: 13, color: theme.colors.textMuted, marginTop: 8 },
  cardMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
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
    gap: 12,
  },
  productModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  productModalBtn: {
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
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
  recentRowThumb: { width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.colors.borderLight },
  recentRowThumbImage: { width: '100%', height: '100%' },
  recentRowThumbPlaceholder: { width: 56, height: 56, borderRadius: 8, backgroundColor: theme.colors.borderLight, alignItems: 'center', justifyContent: 'center' },
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
