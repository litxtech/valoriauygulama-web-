import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${year} ${h}:${min}`;
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
  created_by: string | null;
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

export default function StockManagement() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [alerts, setAlerts] = useState<StockAlertRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [lastMovementByProduct, setLastMovementByProduct] = useState<Record<string, LastMovement>>({});
  const [recentMovements, setRecentMovements] = useState<RecentMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [recentDrawerOpen, setRecentDrawerOpen] = useState(false);
  /** Ürün resmi yoksa son hareketin photo_proof ile göster (admin panelde resim görünsün) */
  const [lastPhotoByProductId, setLastPhotoByProductId] = useState<Record<string, string>>({});
  const canUseAllOrganizations = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const loadData = async () => {
    setLoadError(null);
    const orgId = canUseAllOrganizations ? selectedOrganizationId : me?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    try {
      let productsQuery = supabase
        .from('stock_products')
        .select(
          'id, name, barcode, unit, current_stock, min_stock, max_stock, image_url, category_id, created_at, created_by, organization_id, category:stock_categories(id, name), creator:created_by(full_name), organization:organization_id(name)'
        )
        .order('name');
      if (orgScoped) productsQuery = productsQuery.eq('organization_id', orgScoped);
      const { data: productsData, error: productsError } = await productsQuery;
      if (productsError) {
        setLoadError(productsError.message || 'Ürünler yüklenemedi');
        setProducts([]);
      } else {
        setProducts((productsData ?? []) as unknown as Product[]);
      }

      const { data: categoriesData } = await supabase.from('stock_categories').select('id, name').order('name');
      setCategories(categoriesData ?? []);

      try {
        let alertsQuery = supabase
          .from('stock_alerts')
          .select('id, message, product_id, product:stock_products(name)')
          .eq('is_resolved', false);
        if (orgScoped) alertsQuery = alertsQuery.eq('organization_id', orgScoped);
        const { data: alertsData } = await alertsQuery;
        setAlerts((alertsData ?? []) as unknown as StockAlertRow[]);
      } catch {
        setAlerts([]);
      }

      try {
        let movementsQuery = supabase
          .from('stock_movements')
          .select('product_id, created_at, staff:staff_id(full_name)')
          .order('created_at', { ascending: false });
        if (orgScoped) movementsQuery = movementsQuery.eq('organization_id', orgScoped);
        const { data: movementsData } = await movementsQuery;
        const byProduct: Record<string, LastMovement> = {};
        for (const m of movementsData ?? []) {
          const pid = (m as { product_id: string }).product_id;
          if (pid && !byProduct[pid]) {
            const staff = (m as unknown as { staff?: { full_name: string | null } }).staff;
            byProduct[pid] = {
              staffName: staff?.full_name ?? '—',
              createdAt: (m as { created_at: string }).created_at,
            };
          }
        }
        setLastMovementByProduct(byProduct);
      } catch {
        setLastMovementByProduct({});
      }

      try {
        let recentQuery = supabase
          .from('stock_movements')
          .select('id, product_id, movement_type, quantity, created_at, photo_proof, product:stock_products(name), staff:staff_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(12);
        if (orgScoped) recentQuery = recentQuery.eq('organization_id', orgScoped);
        const { data: recentData } = await recentQuery;
        setRecentMovements((recentData ?? []) as unknown as RecentMovement[]);
      } catch {
        setRecentMovements([]);
      }

      try {
        let photoQuery = supabase
          .from('stock_movements')
          .select('product_id, photo_proof')
          .not('photo_proof', 'is', null)
          .order('created_at', { ascending: false });
        if (orgScoped) photoQuery = photoQuery.eq('organization_id', orgScoped);
        const { data: photoData } = await photoQuery;
        const byProduct: Record<string, string> = {};
        for (const m of photoData ?? []) {
          const pid = (m as { product_id: string }).product_id;
          const url = (m as { photo_proof: string }).photo_proof;
          if (pid && url && !(pid in byProduct)) byProduct[pid] = url;
        }
        setLastPhotoByProductId(byProduct);
      } catch {
        setLastPhotoByProductId({});
      }
    } catch (e) {
      setLoadError((e as Error)?.message ?? 'Veri yüklenirken hata oluştu');
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [selectedOrganizationId, canUseAllOrganizations, me?.organization_id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleDeleteProduct = (p: Product) => {
    Alert.alert(
      'Ürünü sil',
      `"${p.name}" ürününü silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      [
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
              await loadData();
            } catch (e) {
              Alert.alert('Hata', (e as Error)?.message ?? 'Ürün silinemedi.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteEntireStock = () => {
    Alert.alert(
      'Stoğu komple sil',
      'Tüm stok verileri (ürünler, hareketler, uyarılar) kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, hepsini sil',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.from('barcode_scan_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('stock_alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              await supabase.from('stock_counts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              const { error } = await supabase.from('stock_products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
              if (error) throw error;
              await loadData();
              Alert.alert('Tamam', 'Tüm stok verileri silindi.');
            } catch (e) {
              Alert.alert('Hata', (e as Error)?.message ?? 'Stok silinemedi.');
            }
          },
        },
      ]
    );
  };

  const filtered = products.filter((p) => {
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const q = search.trim().toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode != null && p.barcode.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });
  const criticalCount = products.filter((p) => (p.min_stock ?? 0) > 0 && (p.current_stock ?? 0) <= (p.min_stock ?? 0)).length;
  const emptyCount = products.filter((p) => (p.current_stock ?? 0) <= 0).length;
  const totalStockUnits = products.reduce((sum, p) => sum + (p.current_stock ?? 0), 0);

  const headerPaddingTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;
  const footerPaddingBottom = insets.bottom + 20;

  return (
    <View style={styles.container}>
      {/* Özel header: Stok Yönetimi + arama */}
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerBack}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityLabel="Geri"
          >
            <Ionicons name="arrow-back" size={24} color={adminTheme.colors.surface} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Stok Yönetimi</Text>
            <Text style={styles.headerSub}>
              {products.length} ürün · {alerts.length > 0 ? `${alerts.length} uyarı` : 'Uyarı yok'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push('/admin')}
            activeOpacity={0.8}
          >
            <Ionicons name="home-outline" size={22} color={adminTheme.colors.surface} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={adminTheme.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.search}
            placeholder="Ürün adı veya barkod ara..."
            placeholderTextColor={adminTheme.colors.textMuted}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={12} style={styles.searchClear}>
              <Ionicons name="close-circle" size={20} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={me?.organization_id} />
      </View>

      {/* Kritik uyarılar */}
      {alerts.length > 0 && (
        <View style={styles.alertBanner}>
          <View style={styles.alertBannerLeft}>
            <Ionicons name="warning" size={22} color="#fff" />
            <Text style={styles.alertBannerTitle}>Kritik stok ({alerts.length})</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.alertScroll}>
            {alerts.map((a) => (
              <TouchableOpacity
                key={a.id}
                style={styles.alertChip}
                onPress={() => router.push({ pathname: '/admin/stock/movement', params: { productId: a.product_id } })}
                activeOpacity={0.8}
              >
                <Text style={styles.alertChipText} numberOfLines={1}>
                  {(a.product as { name?: string })?.name ?? a.product_id}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.metricsWrap}>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{products.length}</Text>
          <Text style={styles.metricLabel}>Toplam Ürün</Text>
        </View>
        <View style={[styles.metricCard, styles.metricCardWarn]}>
          <Text style={styles.metricValue}>{criticalCount}</Text>
          <Text style={styles.metricLabel}>Kritik Ürün</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{emptyCount}</Text>
          <Text style={styles.metricLabel}>Stok Yok</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricValue}>{totalStockUnits}</Text>
          <Text style={styles.metricLabel}>Toplam Adet</Text>
        </View>
      </View>

      {/* Kategori filtreleri + üst aksiyon butonları */}
      <View style={styles.controlsCard}>
        <Text style={styles.controlsTitle}>Filtreler</Text>
        <ScrollView
          horizontal
          style={styles.categoriesWrap}
          contentContainerStyle={styles.categoriesContent}
          showsHorizontalScrollIndicator={false}
        >
          <TouchableOpacity
            style={[styles.chip, selectedCategory === 'all' && styles.chipActive]}
            onPress={() => setSelectedCategory('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, selectedCategory === 'all' && styles.chipTextActive]}>Tümü</Text>
          </TouchableOpacity>
          {categories.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, selectedCategory === c.id && styles.chipActive]}
              onPress={() => setSelectedCategory(c.id)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, selectedCategory === c.id && styles.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.topActionsWrap}>
          <TouchableOpacity style={[styles.topActionBtn, styles.topActionBtnDanger]} onPress={handleDeleteEntireStock} activeOpacity={0.86}>
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.topActionBtnText}>Stoğu sil</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topActionBtn, styles.topActionBtnPrimary]} onPress={() => router.push('/admin/stock/scan')} activeOpacity={0.86}>
            <Ionicons name="add-circle-outline" size={16} color="#fff" />
            <Text style={styles.topActionBtnText}>Yeni Ürün</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topActionBtn, styles.topActionBtnMint]} onPress={() => router.push({ pathname: '/admin/stock/movement', params: { type: 'in' } })} activeOpacity={0.86}>
            <Ionicons name="arrow-down-circle-outline" size={16} color="#fff" />
            <Text style={styles.topActionBtnText}>Stok Girişi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topActionBtn, styles.topActionBtnWarn]} onPress={() => router.push({ pathname: '/admin/stock/movement', params: { type: 'out' } })} activeOpacity={0.86}>
            <Ionicons name="arrow-up-circle-outline" size={16} color="#fff" />
            <Text style={styles.topActionBtnText}>Stok Çıkışı</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.topActionBtn, styles.topActionBtnPrimarySoft]} onPress={() => router.push('/admin/stock/approvals')} activeOpacity={0.86}>
            <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
            <Text style={styles.topActionBtnText}>Onaylar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Son İşlemler – çekmece butonu (tıklanınca açılır) */}
      <View style={styles.recentButtonWrap}>
        <TouchableOpacity
          style={styles.recentDrawerButton}
          onPress={() => setRecentDrawerOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="time-outline" size={20} color={adminTheme.colors.primary} />
          <Text style={styles.recentDrawerButtonText}>Son İşlemler</Text>
          {recentMovements.length > 0 && (
            <View style={styles.recentDrawerBadge}>
              <Text style={styles.recentDrawerBadgeText}>{Math.min(recentMovements.length, 99)}</Text>
            </View>
          )}
          <Ionicons name="chevron-up" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Liste alanı: bölüm başlığı + liste (aşağı kaydırın, alt butonlar en altta sabit) */}
        <View style={styles.listWrapper}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📋 TÜM ÜRÜNLER ({filtered.length})</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={adminTheme.colors.primary} />
              <Text style={styles.loadingText}>Yükleniyor...</Text>
            </View>
          ) : loadError ? (
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={56} color={adminTheme.colors.error} />
              <Text style={styles.emptyTitle}>Yükleme hatası</Text>
              <Text style={styles.emptySub}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoading(true); loadData(); }} activeOpacity={0.8}>
                <Text style={styles.retryBtnText}>Tekrar dene</Text>
              </TouchableOpacity>
            </View>
          ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: 24 + footerPaddingBottom }]}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.accent]} />}
          >
            {filtered.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={56} color={adminTheme.colors.textMuted} />
                <Text style={styles.emptyTitle}>
                  {products.length === 0 ? 'Henüz ürün yok' : 'Bu arama/kategoriye uygun ürün yok'}
                </Text>
                <Text style={styles.emptySub}>
                  {products.length === 0
                    ? 'Yeni Ürün veya Stok Girişi ile ürün ekleyebilirsiniz.'
                    : 'Arama kutusunu temizleyin veya "Tümü" kategorisini seçin.'}
                </Text>
                {search.length > 0 && (
                  <TouchableOpacity style={styles.retryBtn} onPress={() => setSearch('')} activeOpacity={0.8}>
                    <Text style={styles.retryBtnText}>Aramayı temizle</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
            filtered.map((p) => {
              const cur = p.current_stock ?? 0;
              const min = p.min_stock ?? 0;
              const max = p.max_stock ?? 1;
              const pct = max > 0 ? Math.min((cur / max) * 100, 100) : 0;
              const isLow = min > 0 && cur <= min;
              const addedBy = p.creator?.full_name ?? '—';
              const addedAt = p.created_at ? formatShortDateTime(p.created_at) : '—';
              return (
                <View key={p.id} style={[styles.card, isLow && styles.cardLow]}>
                  <TouchableOpacity
                    onPress={() => router.push(`/admin/stock/product/${p.id}`)}
                    activeOpacity={0.7}
                    accessibilityLabel={`${p.name} detayı`}
                  >
                    <View style={styles.cardTop}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.cardMetaLine}>
                        Stok: <Text style={[styles.stockHighlight, isLow && styles.stockLabelLow]}>{cur} {p.unit ?? 'adet'}</Text>
                        {isLow && <Text style={styles.kritikBadge}> · Kritik</Text>}
                      </Text>
                      {p.organization?.name ? (
                        <Text style={styles.cardOrgTag} numberOfLines={1}>
                          {p.organization.name}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.cardImageWrap}>
                      {(p.image_url ?? lastPhotoByProductId[p.id]) ? (
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => setPreviewUri(p.image_url ?? lastPhotoByProductId[p.id] ?? null)}
                          style={styles.cardImageTouch}
                        >
                          <CachedImage
                            uri={p.image_url ?? lastPhotoByProductId[p.id] ?? ''}
                            style={styles.cardImage}
                            contentFit="cover"
                          />
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.cardImagePlaceholder}>
                          <Ionicons name="image-outline" size={40} color={adminTheme.colors.textMuted} />
                          <Text style={styles.cardImagePlaceholderText}>Ürün resmi yok</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={styles.cardAddedBy}>📦 Ekleyen: {addedBy}</Text>
                      <Text style={styles.cardAddedAt}>📅 {addedAt}</Text>
                    </View>
                    <View style={styles.barBg}>
                      <View
                        style={[
                          styles.barFill,
                          isLow ? styles.barLow : styles.barOk,
                          { width: `${Math.max(pct, 2)}%` },
                        ]}
                      />
                    </View>
                  </TouchableOpacity>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardActionBtnPrimary]}
                      onPress={() => router.push(`/admin/stock/product/${p.id}`)}
                      activeOpacity={0.86}
                    >
                      <Text style={styles.cardActionBtnText}>🔍 Detay</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardActionBtnSoft]}
                      onPress={() => router.push(`/admin/stock/product/${p.id}`)}
                      activeOpacity={0.86}
                    >
                      <Text style={styles.cardActionBtnText}>✏️ Düzenle</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.cardActionBtn, styles.cardActionBtnDanger]}
                      onPress={() => handleDeleteProduct(p)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.cardActionBtnDangerText}>🗑️ Sil</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
            )}
          </ScrollView>
          )}
        </View>

      {/* Son İşlemler çekmecesi – tıklanınca açılır */}
      <Modal visible={recentDrawerOpen} transparent animationType="slide">
        <Pressable style={styles.drawerOverlay} onPress={() => setRecentDrawerOpen(false)}>
          <Pressable style={styles.drawerPanel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.drawerHandle} />
            <View style={styles.drawerHeader}>
              <Text style={styles.drawerTitle}>Son İşlemler</Text>
              <TouchableOpacity onPress={() => setRecentDrawerOpen(false)} hitSlop={12} style={styles.drawerCloseBtn}>
                <Ionicons name="close" size={24} color={adminTheme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {recentMovements.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Ionicons name="document-text-outline" size={48} color={adminTheme.colors.textMuted} />
                <Text style={styles.drawerEmptyText}>Henüz işlem yok</Text>
              </View>
            ) : (
              <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerScrollContent} showsVerticalScrollIndicator={true}>
                {recentMovements.map((m) => {
                  const name = (m.product as { name?: string })?.name ?? '—';
                  const staffName = (m.staff as { full_name?: string })?.full_name ?? '—';
                  const shortName = staffName.split(' ')[0] + (staffName.includes(' ') ? ' ' + staffName.split(' ')[1]?.charAt(0) + '.' : '');
                  const icon = m.movement_type === 'in' ? '📥' : '📤';
                  const sign = m.movement_type === 'in' ? '+' : '-';
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.recentRow}
                      onPress={() => {
                        setRecentDrawerOpen(false);
                        router.push(`/admin/stock/product/${m.product_id}`);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.recentRowText} numberOfLines={2}>
                        {icon} {m.movement_type === 'in' ? 'Giriş' : 'Çıkış'} — {shortName} · {name} {sign}{m.quantity}
                      </Text>
                      <Text style={styles.recentRowDate}>{formatShortDateTime(m.created_at)}{m.photo_proof ? ' · 📷' : ''}</Text>
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
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  header: {
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.lg,
    borderBottomLeftRadius: adminTheme.radius.lg,
    borderBottomRightRadius: adminTheme.radius.lg,
    ...adminTheme.shadow.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: adminTheme.spacing.md,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: adminTheme.colors.surface,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: adminTheme.radius.md,
    paddingHorizontal: adminTheme.spacing.md,
  },
  searchIcon: {
    marginRight: 8,
  },
  search: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.surface,
  },
  searchClear: {
    padding: 4,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.error,
    paddingVertical: 10,
    paddingHorizontal: adminTheme.spacing.lg,
    marginHorizontal: adminTheme.spacing.lg,
    marginTop: adminTheme.spacing.lg,
    borderRadius: adminTheme.radius.md,
    ...adminTheme.shadow.sm,
  },
  alertBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  alertBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 6,
  },
  alertScroll: {
    flex: 1,
    maxHeight: 36,
  },
  alertChip: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: adminTheme.radius.full,
    marginRight: 8,
    justifyContent: 'center',
  },
  alertChipText: {
    fontSize: 12,
    color: '#fff',
    maxWidth: 120,
  },
  categoriesWrap: {
    maxHeight: 52,
    flexShrink: 0,
  },
  orgPickerWrap: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: 10,
  },
  metricsWrap: {
    marginTop: adminTheme.spacing.md,
    marginHorizontal: adminTheme.spacing.lg,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flexBasis: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  metricCardWarn: {
    backgroundColor: '#fffbeb',
    borderColor: '#f59e0b',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '800',
    color: adminTheme.colors.text,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
  },
  controlsCard: {
    marginTop: adminTheme.spacing.md,
    marginHorizontal: adminTheme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
    paddingVertical: 10,
  },
  controlsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginBottom: 6,
    paddingHorizontal: adminTheme.spacing.md,
  },
  categoriesContent: {
    paddingHorizontal: adminTheme.spacing.md,
    paddingVertical: 4,
    gap: 8,
  },
  listWrapper: {
    flex: 1,
    minHeight: 200,
    overflow: 'hidden',
  },
  sectionHint: {
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    paddingHorizontal: adminTheme.spacing.lg,
    marginBottom: 4,
    flexShrink: 0,
  },
  sectionHeader: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.md,
    paddingBottom: adminTheme.spacing.sm,
    flexShrink: 0,
  },
  loadingBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: adminTheme.radius.md,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.surface,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: adminTheme.radius.full,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
  },
  chipTextActive: {
    color: adminTheme.colors.surface,
  },
  topActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: adminTheme.spacing.md,
  },
  topActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#0f172a',
    borderWidth: 0,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  topActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  topActionBtnPrimary: { backgroundColor: '#2563eb' },
  topActionBtnPrimarySoft: { backgroundColor: '#1d4ed8' },
  topActionBtnMint: { backgroundColor: '#059669' },
  topActionBtnWarn: { backgroundColor: '#d97706' },
  topActionBtnDanger: { backgroundColor: '#b91c1c' },
  list: {
    flex: 1,
    minHeight: 180,
  },
  listContent: {
    padding: adminTheme.spacing.lg,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
    marginTop: 12,
  },
  emptySub: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    marginTop: 4,
  },
  card: {
    backgroundColor: adminTheme.colors.surface,
    padding: adminTheme.spacing.md,
    borderRadius: adminTheme.radius.md,
    marginBottom: adminTheme.spacing.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
    ...adminTheme.shadow.sm,
  },
  cardLow: {
    borderLeftWidth: 4,
    borderLeftColor: adminTheme.colors.error,
  },
  cardTop: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  cardMetaLine: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginTop: 4,
  },
  cardOrgTag: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.colors.accent,
    marginTop: 4,
  },
  stockHighlight: {
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  stockLabelLow: {
    color: adminTheme.colors.error,
    fontWeight: '600',
  },
  kritikBadge: {
    color: adminTheme.colors.error,
    fontWeight: '600',
  },
  cardImageWrap: {
    width: '100%',
    height: 220,
    borderRadius: adminTheme.radius.sm,
    overflow: 'hidden',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    marginBottom: 10,
  },
  cardImageTouch: {
    width: '100%',
    height: '100%',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceTertiary,
    minHeight: 220,
  },
  cardImagePlaceholderText: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    marginTop: 8,
  },
  cardFooter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardAddedBy: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
  },
  cardAddedAt: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
  },
  cardActionBtn: {
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    borderWidth: 0,
  },
  cardActionBtnPrimary: { backgroundColor: '#2563eb' },
  cardActionBtnSoft: { backgroundColor: '#334155' },
  cardActionBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  cardActionBtnDanger: { backgroundColor: '#b91c1c' },
  cardActionBtnDangerText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  recentButtonWrap: {
    paddingHorizontal: adminTheme.spacing.lg,
    marginTop: adminTheme.spacing.md,
    marginBottom: adminTheme.spacing.sm,
    flexShrink: 0,
  },
  recentDrawerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    paddingVertical: 12,
    paddingHorizontal: adminTheme.spacing.lg,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 8,
    ...adminTheme.shadow.sm,
  },
  recentDrawerButtonText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  recentDrawerBadge: {
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: adminTheme.radius.full,
  },
  recentDrawerBadgeText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.surface },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  drawerPanel: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: adminTheme.radius.lg,
    borderTopRightRadius: adminTheme.radius.lg,
    maxHeight: '70%',
    minHeight: 200,
  },
  drawerHandle: {
    width: 40,
    height: 4,
    backgroundColor: adminTheme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: adminTheme.spacing.lg,
    paddingVertical: adminTheme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  drawerTitle: { fontSize: 18, fontWeight: '700', color: adminTheme.colors.text },
  drawerCloseBtn: { padding: 4 },
  drawerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  drawerEmptyText: { fontSize: 15, color: adminTheme.colors.textMuted, marginTop: 12 },
  drawerScroll: { maxHeight: 400 },
  drawerScrollContent: { paddingBottom: adminTheme.spacing.xl },
  recentRow: {
    paddingVertical: 12,
    paddingHorizontal: adminTheme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  recentRowText: { fontSize: 14, color: adminTheme.colors.text, fontWeight: '500' },
  recentRowDate: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
  barBg: {
    height: 5,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderRadius: 3,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  barOk: {
    backgroundColor: adminTheme.colors.success,
  },
  barLow: {
    backgroundColor: adminTheme.colors.error,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    flexDirection: 'column',
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: adminTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    gap: 10,
    ...adminTheme.shadow.lg,
    ...(Platform.OS === 'android' && { elevation: 8 }),
  },
  footerRow: { width: '100%', alignItems: 'center' },
  footerActions: { flexDirection: 'row', gap: 10 },
  deleteEntireBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.error || '#dc2626',
  },
  deleteEntireBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  footerBtn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  footerBtnPrimary: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  footerBtnOut: {
    backgroundColor: adminTheme.colors.error,
    borderColor: adminTheme.colors.error,
  },
  footerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  footerBtnTextWhite: {
    color: '#fff',
  },
});
