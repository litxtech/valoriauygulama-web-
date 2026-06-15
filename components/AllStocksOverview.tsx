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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import {
  buildStockListHtml,
  shareStockListPdf,
  formatShortDateTime as formatShortDateTimeForPdf,
  type StockListPdfRow,
} from '@/lib/stockListPdf';
import { StockInventoryList, type StockInventoryListItem } from '@/components/stock/StockInventoryList';
import { buildLatestPhotoProofByProductId, resolveStockProductImageUrl } from '@/lib/stockProductImages';

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
  { value: 'all', label: 'Tümü', icon: 'list-outline', activeBg: '#1e3a5f' },
  { value: 'in_stock', label: 'Stokta', icon: 'checkmark-circle-outline', activeBg: '#047857' },
  { value: 'critical', label: 'Kritik', icon: 'warning-outline', activeBg: '#b45309' },
  { value: 'empty', label: 'Stoksuz', icon: 'close-circle-outline', activeBg: '#b91c1c' },
];

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
  const [pdfExporting, setPdfExporting] = useState(false);

  const load = async () => {
    try {
      const prodRes = await supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock, image_url, created_at, category:stock_categories(name)')
        .order('name');
      setProducts((prodRes.data ?? []) as Product[]);
      setLoading(false);
      setRefreshing(false);

      const movRes = await supabase
        .from('stock_movements')
        .select('id, product_id, movement_type, quantity, created_at, status, photo_proof, staff:staff_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(400);
      setMovements((movRes.data ?? []) as MovementRow[]);
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

  const photoByProductId = useMemo(
    () => buildLatestPhotoProofByProductId(movements),
    [movements]
  );

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

  const listItems = useMemo((): StockInventoryListItem[] => {
    return [...filtered]
      .sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }))
      .map((p) => {
        const catObj = Array.isArray(p.category) ? p.category[0] : p.category;
        const categoryName =
          catObj && typeof catObj === 'object' && 'name' in catObj ? String((catObj as { name: string }).name) : null;
        return {
          id: p.id,
          name: p.name,
          unit: p.unit,
          current_stock: p.current_stock,
          min_stock: p.min_stock,
          categoryName,
          imageUrl: resolveStockProductImageUrl(p.image_url, photoByProductId[p.id]),
        };
      });
  }, [filtered, photoByProductId]);

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
          <Ionicons name="list-outline" size={32} color={theme.colors.primary} />
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
              <Ionicons name="list" size={18} color="#fff" />
            </LinearGradient>
          </View>
          <View style={styles.listHeaderText}>
            <Text style={styles.sectionTitle}>Stok listesi</Text>
            <Text style={styles.sectionSub}>
              {filtered.length} ürün · kaydırarak miktarları görün
            </Text>
          </View>
        </View>

        <StockInventoryList
          items={listItems}
          onPress={(item) => router.push(productHref(item.id) as never)}
          showRowIndex
          emptyMessage="Aramayı veya filtreyi değiştirmeyi deneyin."
        />
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
});
