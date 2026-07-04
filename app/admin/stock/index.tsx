import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { navigateAdminBack, ADMIN_TABS_FALLBACK } from '@/lib/adminStackBack';
import { usePathname } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';
import { StockProductCard, type StockProductCardData } from '@/components/admin/stock/StockProductCard';
import { getStockLevel, stockTheme, type StockLevel } from '@/components/admin/stock/stockUi';
import { buildLatestPhotoProofByProductId } from '@/lib/stockProductImages';
import {
  ADMIN_LIST_PERF,
  ADMIN_SCREEN_FOCUS_TTL_MS,
  getAdminScreenCache,
  setAdminScreenCache,
} from '@/lib/adminPerf';

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

type Category = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  barcode: string | null;
  category_id: string | null;
  unit: string | null;
  current_stock: number | null;
  min_stock: number | null;
  max_stock: number | null;
  image_url: string | null;
  created_at: string;
  organization_id: string;
  category: Category | null;
  creator: { full_name: string | null } | null;
  organization: { name: string } | null;
};
type StockAlertRow = { id: string; message: string | null; product_id: string; product?: { name: string } };
type LastMovement = { staffName: string; createdAt: string };
type RecentMovement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  created_at: string;
  product: { name: string } | null;
  staff: { full_name: string | null } | null;
  photo_proof: string | null;
};

type StatusFilter = 'all' | StockLevel;

type StockScreenCache = {
  products: Product[];
  categories: Category[];
  alerts: StockAlertRow[];
  pendingApprovals: number;
  lastMovementByProduct: Record<string, LastMovement>;
  recentMovements: RecentMovement[];
  lastPhotoByProductId: Record<string, string>;
};

const QUICK_ACTIONS = [
  { key: 'new', label: 'Yeni ürün', sub: 'Barkod tara', icon: 'scan-outline' as const, colors: ['#2563eb', '#3b82f6'] as [string, string], route: '/admin/stock/scan' },
  { key: 'in', label: 'Stok girişi', sub: 'Depoya ekle', icon: 'arrow-down-circle' as const, colors: ['#059669', '#10b981'] as [string, string], route: '/admin/stock/movement', params: { type: 'in' } },
  { key: 'out', label: 'Stok çıkışı', sub: 'Kullanım / satış', icon: 'arrow-up-circle' as const, colors: ['#d97706', '#f59e0b'] as [string, string], route: '/admin/stock/movement', params: { type: 'out' } },
  { key: 'approvals', label: 'Onaylar', sub: 'Bekleyenler', icon: 'checkmark-done' as const, colors: ['#7c3aed', '#8b5cf6'] as [string, string], route: '/admin/stock/approvals' },
] as const;

export default function StockManagement() {
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [alerts, setAlerts] = useState<StockAlertRow[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastMovementByProduct, setLastMovementByProduct] = useState<Record<string, LastMovement>>({});
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  const [lastPhotoByProductId, setLastPhotoByProductId] = useState<Record<string, string>>({});
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const applyStockCache = useCallback((cached: StockScreenCache) => {
    setProducts(cached.products);
    setCategories(cached.categories);
    setAlerts(cached.alerts);
    setPendingApprovals(cached.pendingApprovals);
    setLastMovementByProduct(cached.lastMovementByProduct);
    setRecentMovements(cached.recentMovements);
    setLastPhotoByProductId(cached.lastPhotoByProductId);
    setLoadError(null);
    setLoading(false);
  }, []);

  const loadData = useCallback(async (opts?: { force?: boolean }) => {
    setLoadError(null);
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    const cacheKey = `admin-stock:${orgScoped ?? 'all'}`;
    if (!opts?.force) {
      const hit = getAdminScreenCache<StockScreenCache>(cacheKey, ADMIN_SCREEN_FOCUS_TTL_MS);
      if (hit?.products) {
        applyStockCache(hit);
        return;
      }
    }
    try {
      let productsQuery = supabase
        .from('stock_products')
        .select(
          'id, name, barcode, unit, current_stock, min_stock, max_stock, image_url, category_id, created_at, organization_id, category:stock_categories(id, name), organization:organization_id(name)'
        )
        .order('name');
      if (orgScoped) productsQuery = productsQuery.eq('organization_id', orgScoped);

      let alertsQuery = supabase
        .from('stock_alerts')
        .select('id, message, product_id, product:stock_products(name)')
        .eq('is_resolved', false)
        .limit(50);
      if (orgScoped) alertsQuery = alertsQuery.eq('organization_id', orgScoped);

      let pendingQ = supabase
        .from('stock_movements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (orgScoped) pendingQ = pendingQ.eq('organization_id', orgScoped);

      // Son hareket / foto için tüm geçmişi çekme — son N kayıt yeterli
      let movementsQuery = supabase
        .from('stock_movements')
        .select('product_id, created_at, staff:staff_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(250);
      if (orgScoped) movementsQuery = movementsQuery.eq('organization_id', orgScoped);

      let recentQuery = supabase
        .from('stock_movements')
        .select(
          'id, product_id, movement_type, quantity, created_at, photo_proof, product:stock_products(name), staff:staff_id(full_name)'
        )
        .order('created_at', { ascending: false })
        .limit(15);
      if (orgScoped) recentQuery = recentQuery.eq('organization_id', orgScoped);

      let photoQuery = supabase
        .from('stock_movements')
        .select('product_id, photo_proof')
        .not('photo_proof', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (orgScoped) photoQuery = photoQuery.eq('organization_id', orgScoped);

      const [
        productsRes,
        categoriesRes,
        alertsRes,
        pendingRes,
        movementsRes,
        recentRes,
        photoRes,
      ] = await Promise.all([
        productsQuery,
        supabase.from('stock_categories').select('id, name').order('name'),
        alertsQuery,
        pendingQ,
        movementsQuery,
        recentQuery,
        photoQuery,
      ]);

      if (productsRes.error) {
        setLoadError(productsRes.error.message || 'Ürünler yüklenemedi');
        setProducts([]);
      } else {
        setProducts((productsRes.data ?? []) as unknown as Product[]);
      }
      const nextCategories = categoriesRes.data ?? [];
      const nextAlerts = (alertsRes.data ?? []) as unknown as StockAlertRow[];
      const nextPending = pendingRes.count ?? 0;
      setCategories(nextCategories);
      setAlerts(nextAlerts);
      setPendingApprovals(nextPending);

      const byProduct: Record<string, LastMovement> = {};
      for (const m of movementsRes.data ?? []) {
        const pid = (m as { product_id: string }).product_id;
        if (pid && !byProduct[pid]) {
          const staff = (m as unknown as { staff?: { full_name: string | null } }).staff;
          byProduct[pid] = {
            staffName: staff?.full_name ?? '—',
            createdAt: formatShortDateTime((m as { created_at: string }).created_at),
          };
        }
      }
      setLastMovementByProduct(byProduct);
      const nextRecent = (recentRes.data ?? []) as unknown as RecentMovement[];
      const nextPhotos = buildLatestPhotoProofByProductId(
        (photoRes.data ?? []) as Array<{ product_id: string; photo_proof: string | null }>
      );
      setRecentMovements(nextRecent);
      setLastPhotoByProductId(nextPhotos);

      if (!productsRes.error) {
        setAdminScreenCache(cacheKey, {
          products: (productsRes.data ?? []) as unknown as Product[],
          categories: nextCategories,
          alerts: nextAlerts,
          pendingApprovals: nextPending,
          lastMovementByProduct: byProduct,
          recentMovements: nextRecent,
          lastPhotoByProductId: nextPhotos,
        } satisfies StockScreenCache);
      }
    } catch (e) {
      setLoadError((e as Error)?.message ?? 'Veri yüklenirken hata oluştu');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [applyStockCache, canUseAllOrganizations, me?.organization_id, selectedOrganizationId]);

  useEffect(() => {
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    const hit = getAdminScreenCache<StockScreenCache>(`admin-stock:${orgScoped ?? 'all'}`, ADMIN_SCREEN_FOCUS_TTL_MS);
    if (hit?.products?.length) {
      applyStockCache(hit);
      return;
    }
    setLoading(true);
    void loadData();
  }, [applyStockCache, canUseAllOrganizations, loadData, me?.organization_id, selectedOrganizationId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData({ force: true });
    setRefreshing(false);
  };

  const handleDeleteProduct = (p: Product) => {
    Alert.alert('Ürünü sil', `"${p.name}" kalıcı olarak silinsin mi?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('barcode_scan_history').delete().eq('product_id', p.id);
            await supabase.from('stock_alerts').delete().eq('product_id', p.id);
            await supabase.from('stock_counts').delete().eq('product_id', p.id);
            await supabase.from('stock_movements').delete().eq('product_id', p.id);
            const { error } = await supabase.from('stock_products').delete().eq('id', p.id);
            if (error) throw error;
            await loadData({ force: true });
          } catch (e) {
            Alert.alert('Hata', (e as Error)?.message ?? 'Ürün silinemedi.');
          }
        },
      },
    ]);
  };

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) {
      const key = p.category_id ?? '_none';
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode?.toLowerCase().includes(q) ?? false);
      if (!matchCat || !matchSearch) return false;
      if (statusFilter === 'all') return true;
      const cur = p.current_stock ?? 0;
      const min = p.min_stock ?? 0;
      const max = p.max_stock ?? Math.max(cur, min, 1);
      return getStockLevel(cur, min, max) === statusFilter;
    });
  }, [products, search, selectedCategory, statusFilter]);

  const stats = useMemo(() => {
    let critical = 0;
    let empty = 0;
    let ok = 0;
    let totalUnits = 0;
    for (const p of products) {
      const cur = p.current_stock ?? 0;
      totalUnits += cur;
      const level = getStockLevel(cur, p.min_stock ?? 0, p.max_stock ?? Math.max(cur, 1));
      if (level === 'empty') empty++;
      else if (level === 'critical' || level === 'low') critical++;
      else ok++;
    }
    return { total: products.length, critical, empty, ok, totalUnits, alerts: alerts.length, pending: pendingApprovals };
  }, [products, alerts.length, pendingApprovals]);

  const cardData = useCallback(
    (p: Product): StockProductCardData => {
      const last = lastMovementByProduct[p.id];
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        unit: p.unit,
        current_stock: p.current_stock,
        min_stock: p.min_stock,
        max_stock: p.max_stock,
        image_url: p.image_url,
        categoryName: p.category?.name ?? null,
        organizationName: p.organization?.name ?? null,
        fallbackImageUrl: lastPhotoByProductId[p.id] ?? null,
        lastStaffName: last?.staffName ?? null,
        lastMovementAt: last?.createdAt ?? null,
      };
    },
    [lastMovementByProduct, lastPhotoByProductId]
  );

  const headerPaddingTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  const renderHero = () => (
    <LinearGradient colors={stockTheme.headerGrad} style={[styles.hero, { paddingTop: headerPaddingTop }]}>
      <View style={styles.heroRow}>
        <TouchableOpacity
          style={styles.heroBtn}
          onPress={() => navigateAdminBack(router, navigation, pathname, ADMIN_TABS_FALLBACK)}
          accessibilityLabel="Geri"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.heroCenter}>
          <Text style={styles.heroTitle}>Stok yönetimi</Text>
          <Text style={styles.heroSub}>Hangi üründen ne kadar kaldığını tek bakışta görün</Text>
        </View>
        <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/admin/stock/all')} accessibilityLabel="Stok listesi">
          <Ionicons name="list-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color="rgba(255,255,255,0.65)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Ürün adı veya barkod..."
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        ) : null}
      </View>
    </LinearGradient>
  );

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      <View style={{ marginHorizontal: -16 }}>{renderHero()}</View>

      {canUseAllOrganizations ? (
        <View style={styles.orgWrap}>
          <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={me?.organization_id} />
        </View>
      ) : null}

      {alerts.length > 0 ? (
        <View style={styles.alertBox}>
          <View style={styles.alertHead}>
            <Ionicons name="warning" size={20} color="#fff" />
            <Text style={styles.alertTitle}>{alerts.length} kritik uyarı</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.alertScroll}>
            {alerts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.alertChip}
                onPress={() => router.push({ pathname: '/admin/stock/movement', params: { productId: a.product_id } })}
              >
                <Text style={styles.alertChipText} numberOfLines={1}>
                  {(a.product as { name?: string })?.name ?? 'Ürün'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {QUICK_ACTIONS.map((a) => {
          const tint =
            a.key === 'new'
              ? { color: '#2563eb', bg: '#eff6ff' }
              : a.key === 'in'
                ? { color: '#059669', bg: '#ecfdf5' }
                : a.key === 'out'
                  ? { color: '#d97706', bg: '#fffbeb' }
                  : { color: '#7c3aed', bg: '#f5f3ff' };
          return (
            <TouchableOpacity
              key={a.key}
              style={styles.quickChip}
              activeOpacity={0.88}
              onPress={() => {
                if ('params' in a && a.params) router.push({ pathname: a.route as never, params: a.params as never });
                else router.push(a.route as never);
              }}
            >
              <View style={[styles.quickChipIcon, { backgroundColor: tint.bg }]}>
                <Ionicons name={a.icon} size={18} color={tint.color} />
                {a.key === 'approvals' && pendingApprovals > 0 ? (
                  <View style={styles.quickBadge}>
                    <Text style={styles.quickBadgeText}>{pendingApprovals > 99 ? '99+' : pendingApprovals}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.quickChipLabel}>{a.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.total}</Text>
          <Text style={styles.statLbl}>Ürün çeşidi</Text>
        </View>
        <View style={[styles.statCard, styles.statOk]}>
          <Text style={[styles.statVal, { color: '#047857' }]}>{stats.ok}</Text>
          <Text style={styles.statLbl}>Yeterli stok</Text>
        </View>
        <View style={[styles.statCard, styles.statWarn]}>
          <Text style={[styles.statVal, { color: '#b45309' }]}>{stats.critical}</Text>
          <Text style={styles.statLbl}>Dikkat</Text>
        </View>
        <View style={[styles.statCard, styles.statDanger]}>
          <Text style={[styles.statVal, { color: '#b91c1c' }]}>{stats.empty}</Text>
          <Text style={styles.statLbl}>Tükendi</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statVal}>{stats.totalUnits}</Text>
          <Text style={styles.statLbl}>Toplam adet</Text>
        </View>
      </ScrollView>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>Durum</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {(
            [
              { id: 'all', label: 'Tümü' },
              { id: 'ok', label: 'Yeterli' },
              { id: 'low', label: 'Azalıyor' },
              { id: 'critical', label: 'Kritik' },
              { id: 'empty', label: 'Tükendi' },
            ] as { id: StatusFilter; label: string }[]
          ).map((f) => (
            <TouchableOpacity
              key={f.id}
              style={[styles.chip, statusFilter === f.id && styles.chipOn]}
              onPress={() => setStatusFilter(f.id)}
            >
              <Text style={[styles.chipTxt, statusFilter === f.id && styles.chipTxtOn]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.filterTitle, { marginTop: 12 }]}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, selectedCategory === 'all' && styles.chipOn]} onPress={() => setSelectedCategory('all')}>
            <Text style={[styles.chipTxt, selectedCategory === 'all' && styles.chipTxtOn]}>Tümü ({products.length})</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, selectedCategory === c.id && styles.chipOn]}
              onPress={() => setSelectedCategory(c.id)}
            >
              <Text style={[styles.chipTxt, selectedCategory === c.id && styles.chipTxtOn]}>
                {c.name} ({categoryCounts[c.id] ?? 0})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.listTitleRow}>
        <Text style={styles.listTitle}>Ürünler</Text>
        <Text style={styles.listCount}>{filtered.length} kayıt</Text>
        <TouchableOpacity style={styles.recentBtn} onPress={() => setRecentDrawerOpen(true)}>
          <Ionicons name="time-outline" size={16} color={adminTheme.colors.accent} />
          <Text style={styles.recentBtnText}>Son işlemler</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={{ flex: 1 }}>
          {renderHero()}
          <View style={styles.center}>
            <ActivityIndicator size="large" color={adminTheme.colors.accent} />
            <Text style={styles.centerTxt}>Stoklar yükleniyor…</Text>
          </View>
        </View>
      ) : loadError ? (
        <View style={{ flex: 1 }}>
          {renderHero()}
          <View style={styles.center}>
            <Ionicons name="cloud-offline-outline" size={48} color={adminTheme.colors.error} />
            <Text style={styles.centerTitle}>Yüklenemedi</Text>
            <Text style={styles.centerSub}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); void loadData({ force: true }); }}>
              <Text style={styles.retryTxt}>Tekrar dene</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          initialNumToRender={ADMIN_LIST_PERF.initialNumToRender}
          maxToRenderPerBatch={ADMIN_LIST_PERF.maxToRenderPerBatch}
          windowSize={ADMIN_LIST_PERF.windowSize}
          updateCellsBatchingPeriod={ADMIN_LIST_PERF.updateCellsBatchingPeriod}
          removeClippedSubviews={ADMIN_LIST_PERF.removeClippedSubviews}
          renderItem={({ item }) => (
            <StockProductCard
              product={cardData(item)}
              onPress={() => router.push(`/admin/stock/product/${item.id}`)}
              onImagePress={setPreviewUri}
              onEntry={() => router.push({ pathname: '/admin/stock/movement', params: { type: 'in', productId: item.id } })}
              onExit={() => router.push({ pathname: '/admin/stock/movement', params: { type: 'out', productId: item.id } })}
              onDelete={() => handleDeleteProduct(item)}
            />
          )}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={52} color={adminTheme.colors.textMuted} />
              <Text style={styles.emptyTitle}>{products.length === 0 ? 'Henüz ürün yok' : 'Eşleşen ürün yok'}</Text>
              <Text style={styles.emptySub}>
                {products.length === 0 ? 'Yeni ürün ekleyerek başlayın.' : 'Filtreleri veya aramayı değiştirin.'}
              </Text>
              {products.length === 0 ? (
                <TouchableOpacity style={styles.retryBtn} onPress={() => router.push('/admin/stock/scan')}>
                  <Text style={styles.retryTxt}>Ürün ekle</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={recentDrawerOpen} transparent animationType="slide">
        <Pressable style={styles.drawerOverlay} onPress={() => setRecentDrawerOpen(false)}>
          <Pressable style={styles.drawer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.drawerHandle} />
            <View style={styles.drawerHead}>
              <Text style={styles.drawerTitle}>Son stok hareketleri</Text>
              <TouchableOpacity onPress={() => setRecentDrawerOpen(false)}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>
            {recentMovements.length === 0 ? (
              <Text style={styles.drawerEmpty}>Henüz hareket kaydı yok</Text>
            ) : (
              <ScrollView style={styles.drawerScroll}>
                {recentMovements.map((m) => {
                  const isIn = m.movement_type === 'in';
                  const name = (m.product as { name?: string })?.name ?? 'Ürün';
                  const staff = (m.staff as { full_name?: string })?.full_name ?? '—';
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.moveRow}
                      onPress={() => {
                        setRecentDrawerOpen(false);
                        router.push(`/admin/stock/product/${m.product_id}`);
                      }}
                    >
                      <View style={[styles.moveIcon, { backgroundColor: isIn ? '#d1fae5' : '#ffedd5' }]}>
                        <Ionicons name={isIn ? 'arrow-down' : 'arrow-up'} size={18} color={isIn ? '#059669' : '#d97706'} />
                      </View>
                      <View style={styles.moveBody}>
                        <Text style={styles.moveName} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={styles.moveMeta}>
                          {isIn ? 'Giriş' : 'Çıkış'} · {staff} · {isIn ? '+' : '-'}
                          {m.quantity}
                        </Text>
                        <Text style={styles.moveDate}>{formatShortDateTime(m.created_at)}</Text>
                      </View>
                      {m.photo_proof ? <Ionicons name="camera" size={16} color={adminTheme.colors.textMuted} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  hero: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCenter: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2, lineHeight: 16 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#fff', fontWeight: '500' },
  listHeader: {},
  orgWrap: { marginBottom: 4, marginTop: 16 },
  alertBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#b91c1c',
    borderRadius: 14,
    padding: 12,
  },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  alertTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  alertScroll: { gap: 8 },
  alertChip: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  alertChipText: { color: '#fff', fontSize: 12, fontWeight: '600', maxWidth: 140 },
  quickRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    minWidth: 118,
  },
  quickChipIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  quickBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  quickChipLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  statsRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  statCard: {
    minWidth: 100,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statOk: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  statWarn: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  statDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  statVal: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  statLbl: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 2 },
  filterSection: { paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  filterTitle: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipTxt: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary },
  chipTxtOn: { color: '#fff' },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  listTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, flex: 1 },
  listCount: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  recentBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  recentBtnText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  listContent: { paddingHorizontal: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerTxt: { marginTop: 12, color: adminTheme.colors.textMuted },
  centerTitle: { fontSize: 17, fontWeight: '700', marginTop: 12 },
  centerSub: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 6 },
  retryBtn: { marginTop: 16, backgroundColor: adminTheme.colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  retryTxt: { color: '#fff', fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 12, color: adminTheme.colors.text },
  emptySub: { fontSize: 14, color: adminTheme.colors.textMuted, marginTop: 4, textAlign: 'center' },
  drawerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  drawer: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '72%', minHeight: 200 },
  drawerHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: adminTheme.colors.border, alignSelf: 'center', marginTop: 10 },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.border },
  drawerTitle: { fontSize: 17, fontWeight: '800' },
  drawerEmpty: { textAlign: 'center', padding: 32, color: adminTheme.colors.textMuted },
  drawerScroll: { maxHeight: 400 },
  moveRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.border },
  moveIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  moveBody: { flex: 1, minWidth: 0 },
  moveName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  moveMeta: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  moveDate: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
});
