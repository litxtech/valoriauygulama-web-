import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  buildStockListHtml,
  shareStockListPdf,
  formatShortDateTime as formatShortDateTimeForPdf,
  type StockListPdfRow,
} from '@/lib/stockListPdf';

const CARD_GAP = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - CARD_GAP) / 2;

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
  category: { name: string } | null;
};

type MovementRow = {
  id: string;
  product_id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  created_at: string;
  status: string;
  photo_proof: string | null;
  staff: { full_name: string | null } | null;
};

type StockFilter = 'all' | 'in_stock' | 'critical' | 'empty';

const FILTER_LABELS: Record<StockFilter, string> = {
  all: 'Tümü',
  in_stock: 'Stokta var',
  critical: 'Kritik (≤3)',
  empty: 'Stoksuz',
};

type IonIcon = ComponentProps<typeof Ionicons>['name'];

const FILTER_OPTIONS: { value: StockFilter; label: string; icon: IonIcon; activeBg: string }[] = [
  { value: 'all', label: 'Tümü', icon: 'grid-outline', activeBg: '#1e3a5f' },
  { value: 'in_stock', label: 'Stokta', icon: 'checkmark-circle-outline', activeBg: '#047857' },
  { value: 'critical', label: 'Kritik', icon: 'warning-outline', activeBg: '#b45309' },
  { value: 'empty', label: 'Stoksuz', icon: 'close-circle-outline', activeBg: '#b91c1c' },
];

function stockLevelMeta(current: number): { label: string; color: string; bg: string } {
  if (current <= 0) return { label: 'Stoksuz', color: '#b91c1c', bg: '#fee2e2' };
  if (current <= 3) return { label: 'Kritik', color: '#b45309', bg: '#fef3c7' };
  return { label: 'Yeterli', color: '#047857', bg: '#d1fae5' };
}

type Props = {
  /** Ürün kartına tıklanınca açılacak ürün detay path öneki, örn. /admin/stock/product veya /staff/stock/product */
  productPathPrefix: string;
};

export function AllStocksOverview({ productPathPrefix }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastPhotoByProductId, setLastPhotoByProductId] = useState<Record<string, string>>({});
  const [pdfExporting, setPdfExporting] = useState(false);

  const load = async () => {
    try {
      // Önce ürünler: grid hemen görünsün (Instagram benzeri stale-while-revalidate)
      const prodRes = await supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock, image_url, created_at, category:stock_categories(name)')
        .order('name');
      setProducts((prodRes.data ?? []) as Product[]);
      setLoading(false);
      setRefreshing(false);

      /** Limit yoktu: tüm fotoğraflı hareketler çekiliyordu → büyük otelde timeout / "girilmiyor" hissi */
      const [movRes, photoRes] = await Promise.all([
        supabase
          .from('stock_movements')
          .select('id, product_id, movement_type, quantity, created_at, status, photo_proof, staff:staff_id(full_name)')
          .order('created_at', { ascending: false })
          .limit(400),
        supabase
          .from('stock_movements')
          .select('product_id, photo_proof')
          .not('photo_proof', 'is', null)
          .order('created_at', { ascending: false })
          .limit(2500),
      ]);
      setMovements((movRes.data ?? []) as MovementRow[]);
      const byProduct: Record<string, string> = {};
      for (const m of photoRes.data ?? []) {
        const pid = (m as { product_id: string }).product_id;
        const url = (m as { photo_proof: string }).photo_proof;
        if (pid && url && !(pid in byProduct)) byProduct[pid] = url;
      }
      setLastPhotoByProductId(byProduct);
    } catch {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const lastMovementByProductId = useMemo(() => {
    const map: Record<string, MovementRow> = {};
    for (const m of movements) {
      if (!m.product_id || m.product_id in map) continue;
      map[m.product_id] = m;
    }
    return map;
  }, [movements]);

  const filtered = useMemo(() => {
    let list = products;
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    switch (stockFilter) {
      case 'in_stock':
        list = list.filter((p) => (p.current_stock ?? 0) > 0);
        break;
      case 'critical': {
        list = list.filter((p) => (p.current_stock ?? 0) <= 3);
        break;
      }
      case 'empty':
        list = list.filter((p) => (p.current_stock ?? 0) <= 0);
        break;
      default:
        break;
    }
    return list;
  }, [products, nameSearch, stockFilter]);

  const filterCounts = useMemo(() => {
    let inStock = 0;
    let critical = 0;
    let empty = 0;
    for (const p of products) {
      const cur = p.current_stock ?? 0;
      if (cur > 0) inStock++;
      if (cur <= 3) critical++;
      if (cur <= 0) empty++;
    }
    return { all: products.length, in_stock: inStock, critical, empty };
  }, [products]);

  const summary = useMemo(() => {
    let ok = 0;
    let low = 0;
    let out = 0;
    for (const p of products) {
      const cur = p.current_stock ?? 0;
      if (cur <= 0) out++;
      else if (cur <= 3) low++;
      else ok++;
    }
    return { ok, low, out, total: products.length };
  }, [products]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <View style={styles.loadingIconWrap}>
          <Ionicons name="layers-outline" size={32} color={theme.colors.primary} />
        </View>
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 16 }} />
        <Text style={styles.loadingText}>Envanter yükleniyor…</Text>
      </View>
    );
  }

  const productHref = (id: string) => `${productPathPrefix}/${id}`;

  const exportPdf = async () => {
    const list = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    if (list.length === 0) {
      Alert.alert('Liste boş', 'PDF oluşturmak için en az bir ürün görünmeli; filtreyi veya aramayı gevşetin.');
      return;
    }
    setPdfExporting(true);
    try {
      const rows: StockListPdfRow[] = list.map((p) => {
        const cur = p.current_stock ?? 0;
        const isLow = cur <= 3;
        const lastMov = lastMovementByProductId[p.id];
        let lastMovementLine: string | null = null;
        if (lastMov) {
          const t = lastMov.movement_type === 'in' ? 'Giriş' : 'Çıkış';
          const sign = lastMov.movement_type === 'in' ? '+' : '-';
          const staffName = (lastMov.staff as { full_name?: string } | null)?.full_name?.trim();
          lastMovementLine = `${t} ${sign}${lastMov.quantity} · ${formatShortDateTimeForPdf(lastMov.created_at)}${staffName ? ` · ${staffName}` : ''}`;
        }
        const catObj = Array.isArray(p.category) ? p.category[0] : p.category;
        const categoryName = catObj && typeof catObj === 'object' && 'name' in catObj ? String((catObj as { name: string }).name) : null;
        return {
          name: p.name,
          category: categoryName,
          unit: p.unit,
          current_stock: cur,
          min_stock: p.min_stock,
          lastMovementLine,
          critical: isLow,
        };
      });
      const generatedAtLabel = new Date().toLocaleString('tr-TR');
      const searchHint = nameSearch.trim() ? `"${nameSearch.trim()}"` : 'Yok';
      const html = buildStockListHtml(rows, {
        filterLabel: FILTER_LABELS[stockFilter],
        searchHint,
        generatedAtLabel,
      });
      await shareStockListPdf(html);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={20} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Ürün adı ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={nameSearch}
            onChangeText={setNameSearch}
          />
          {nameSearch.length > 0 ? (
            <TouchableOpacity onPress={() => setNameSearch('')} hitSlop={10}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.pdfBtn, pdfExporting && styles.pdfBtnDisabled]}
          onPress={exportPdf}
          disabled={pdfExporting}
          activeOpacity={0.88}
        >
          {pdfExporting ? (
            <ActivityIndicator size="small" color="#0f766e" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={20} color="#0f766e" />
              <Text style={styles.pdfBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.statsRow}
        style={styles.statsScroll}
      >
        <View style={styles.statPill}>
          <Text style={styles.statVal}>{summary.total}</Text>
          <Text style={styles.statLbl}>Ürün</Text>
        </View>
        <View style={[styles.statPill, styles.statOk]}>
          <Text style={[styles.statVal, { color: '#047857' }]}>{summary.ok}</Text>
          <Text style={styles.statLbl}>Yeterli</Text>
        </View>
        <View style={[styles.statPill, styles.statWarn]}>
          <Text style={[styles.statVal, { color: '#b45309' }]}>{summary.low}</Text>
          <Text style={styles.statLbl}>Kritik</Text>
        </View>
        <View style={[styles.statPill, styles.statDanger]}>
          <Text style={[styles.statVal, { color: '#b91c1c' }]}>{summary.out}</Text>
          <Text style={styles.statLbl}>Stoksuz</Text>
        </View>
      </ScrollView>

      <View style={styles.filterSection}>
        <Text style={styles.filterTitle}>Filtrele</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {FILTER_OPTIONS.map((opt) => {
            const active = stockFilter === opt.value;
            const count = filterCounts[opt.value];
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.chip, active && { backgroundColor: opt.activeBg, borderColor: opt.activeBg }]}
                onPress={() => setStockFilter(opt.value)}
                activeOpacity={0.88}
              >
                <Ionicons name={opt.icon} size={16} color={active ? '#fff' : theme.colors.textSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
                <View style={[styles.chipCount, active && styles.chipCountActive]}>
                  <Text style={[styles.chipCountText, active && styles.chipCountTextActive]}>{count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.listHeader}>
          <View style={styles.listHeaderIcon}>
            <LinearGradient colors={['#0f766e', '#14b8a6']} style={styles.listHeaderGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="layers" size={18} color="#fff" />
            </LinearGradient>
          </View>
          <View style={styles.listHeaderText}>
            <Text style={styles.sectionTitle}>Envanter</Text>
            <Text style={styles.sectionSub}>{filtered.length} ürün görüntüleniyor</Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Ürün bulunamadı</Text>
            <Text style={styles.emptyText}>Aramayı veya filtreyi değiştirmeyi deneyin.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {filtered.map((p) => {
              const cur = p.current_stock ?? 0;
              const level = stockLevelMeta(cur);
              const lastMov = lastMovementByProductId[p.id];
              const previewUrl = p.image_url ?? lastPhotoByProductId[p.id] ?? null;
              const catObj = Array.isArray(p.category) ? p.category[0] : p.category;
              const categoryName =
                catObj && typeof catObj === 'object' && 'name' in catObj ? String((catObj as { name: string }).name) : null;
              const isIn = lastMov?.movement_type === 'in';
              const staffName = (lastMov?.staff as { full_name?: string } | null)?.full_name?.trim();
              return (
                <TouchableOpacity
                  key={p.id}
                  style={styles.card}
                  onPress={() => router.push(productHref(p.id) as any)}
                  activeOpacity={0.88}
                >
                  <View style={styles.cardImageWrap}>
                    {previewUrl ? (
                      <CachedImage uri={previewUrl} style={styles.cardImage} contentFit="cover" />
                    ) : (
                      <LinearGradient colors={['#f1f5f9', '#e2e8f0']} style={styles.cardImagePlaceholder}>
                        <Ionicons name="cube-outline" size={32} color={theme.colors.textMuted} />
                      </LinearGradient>
                    )}
                    <View style={[styles.stockBadge, { backgroundColor: level.bg }]}>
                      <Text style={[styles.stockBadgeText, { color: level.color }]}>{level.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {p.name}
                  </Text>
                  {categoryName ? (
                    <Text style={styles.cardCategory} numberOfLines={1}>
                      {categoryName}
                    </Text>
                  ) : null}
                  <View style={styles.stockRow}>
                    <Text style={styles.cardStock}>
                      {cur} <Text style={styles.cardUnit}>{p.unit ?? 'adet'}</Text>
                    </Text>
                  </View>
                  {lastMov ? (
                    <View style={styles.lastMovWrap}>
                      <View style={[styles.lastMovIcon, { backgroundColor: isIn ? '#d1fae5' : '#ffedd5' }]}>
                        <Ionicons name={isIn ? 'arrow-down' : 'arrow-up'} size={12} color={isIn ? '#047857' : '#b45309'} />
                      </View>
                      <View style={styles.lastMovBody}>
                        <Text style={styles.lastMovText} numberOfLines={1}>
                          {isIn ? 'Giriş' : 'Çıkış'} {isIn ? '+' : '-'}
                          {lastMov.quantity}
                        </Text>
                        <Text style={styles.lastMovMeta} numberOfLines={1}>
                          {formatShortDateTime(lastMov.created_at)}
                          {staffName ? ` · ${staffName}` : ''}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.lastMovNone}>Son işlem yok</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  loadingIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: theme.colors.text },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f0fdfa',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    minWidth: 80,
    justifyContent: 'center',
  },
  pdfBtnDisabled: { opacity: 0.65 },
  pdfBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 14 },
  statsScroll: { backgroundColor: theme.colors.surface, maxHeight: 72 },
  statsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  statPill: {
    minWidth: 88,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  statOk: { borderColor: '#a7f3d0', backgroundColor: '#f0fdf4' },
  statWarn: { borderColor: '#fde68a', backgroundColor: '#fffbeb' },
  statDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  statVal: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  statLbl: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  filterSection: {
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  filterTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  filterChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingRight: 24 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextActive: { color: '#fff' },
  chipCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  chipCountActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
  chipCountText: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted },
  chipCountTextActive: { color: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  listHeaderIcon: { borderRadius: 12, overflow: 'hidden', ...theme.shadows.sm },
  listHeaderGrad: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  listHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  sectionSub: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginTop: 14 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  cardImageWrap: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: theme.colors.borderLight,
  },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  stockBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stockBadgeText: { fontSize: 10, fontWeight: '800' },
  cardName: { fontSize: 13, fontWeight: '800', color: theme.colors.text, marginTop: 10, minHeight: 34, lineHeight: 17 },
  cardCategory: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  stockRow: { marginTop: 6 },
  cardStock: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  cardUnit: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  lastMovWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  lastMovIcon: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lastMovBody: { flex: 1, minWidth: 0 },
  lastMovText: { fontSize: 11, fontWeight: '700', color: theme.colors.text },
  lastMovMeta: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  lastMovNone: { fontSize: 10, color: theme.colors.textMuted, marginTop: 10, fontStyle: 'italic' },
});
