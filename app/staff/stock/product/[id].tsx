import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { formatDateTime } from '@/lib/date';
import { resolveStockProductImageUrl } from '@/lib/stockProductImages';

type Product = {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unit: string | null;
  min_stock: number | null;
  max_stock: number | null;
  current_stock: number | null;
  image_url: string | null;
  purchase_price: number | null;
  selling_price: number | null;
  created_at: string;
  category_id: string | null;
  created_by: string | null;
  category: { id: string; name: string } | null;
  creator: { full_name: string | null } | null;
  supplier: { name: string } | null;
};

type Movement = {
  id: string;
  movement_type: string;
  quantity: number;
  status: string;
  notes: string | null;
  staff_image: string | null;
  photo_proof: string | null;
  created_at: string;
  staff: { full_name: string | null } | null;
};

export default function StaffStockProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const load = async () => {
    if (!id) return;
    const { data: prod, error: prodErr } = await supabase
      .from('stock_products')
      .select(
        'id, name, description, barcode, unit, min_stock, max_stock, current_stock, image_url, purchase_price, selling_price, created_at, category_id, created_by, category:stock_categories(id, name), creator:created_by(full_name), supplier:supplier_id(name)'
      )
      .eq('id', id)
      .single();
    if (prodErr || !prod) {
      setProduct(null);
      setLoading(false);
      return;
    }
    setProduct(prod as unknown as Product);

    const { data: mov } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, status, notes, staff_image, photo_proof, created_at, staff:staff_id(full_name)')
      .eq('product_id', id)
      .order('created_at', { ascending: false })
      .limit(15);
    setMovements((mov ?? []) as Movement[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading && !product) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Ürün bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cur = product.current_stock ?? 0;
  const isLow = cur <= 3;
  const priceStr = product.purchase_price != null
    ? `${Number(product.purchase_price).toFixed(2)} TL`
    : product.selling_price != null
      ? `${Number(product.selling_price).toFixed(2)} TL`
      : '—';

  const displayImageUrl = resolveStockProductImageUrl(
    product.image_url,
    movements.find((m) => m.photo_proof)?.photo_proof
  );

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <Text style={styles.blockLabel}>🖼️ ÜRÜN RESMİ</Text>
        <View style={styles.heroImageWrap}>
          {displayImageUrl ? (
            <TouchableOpacity onPress={() => setPreviewUri(displayImageUrl)} activeOpacity={0.8}>
              <CachedImage uri={displayImageUrl} style={styles.heroImage} contentFit="cover" />
            </TouchableOpacity>
          ) : (
            <View style={styles.heroPlaceholder}>
              <Text style={styles.photoPlaceholder}>Fotoğraf yok</Text>
            </View>
          )}
        </View>

        <View style={[styles.stockBadge, isLow && styles.stockBadgeLow]}>
          <Text style={styles.stockBadgeText}>📊 Stok: {cur} {product.unit ?? 'adet'}</Text>
        </View>

        <Text style={styles.blockLabel}>📦 ÜRÜN BİLGİLERİ</Text>
        <View style={styles.card}>
          <Row label="🏷️ İsim" value={product.name} />
          <Row label="🔢 Barkod" value={product.barcode ?? '—'} />
          <Row label="📦 Kategori" value={product.category?.name ?? '—'} />
          <Row label="💰 Fiyat" value={priceStr} />
          <Row label="🏢 Tedarikçi" value={product.supplier?.name ?? '—'} />
          <Row label="Ekleyen" value={product.creator?.full_name ?? '—'} />
          <Row label="Eklenme" value={formatDateTime(product.created_at)} />
        </View>

        <Text style={styles.blockLabel}>📊 STOK HAREKETLERİ</Text>
        <View style={styles.card}>
          {movements.length === 0 ? (
            <Text style={styles.emptyText}>Henüz hareket yok</Text>
          ) : (
            movements.map((m) => (
              <View key={m.id} style={styles.movRow}>
                <View style={[styles.movIcon, m.movement_type === 'in' ? styles.movIn : styles.movOut]}>
                  <Ionicons name={m.movement_type === 'in' ? 'arrow-down' : 'arrow-up'} size={14} color="#fff" />
                </View>
                <View style={styles.movBody}>
                  <Text style={styles.movText}>
                    {m.movement_type === 'in' ? '📥 GİRİŞ' : '📤 ÇIKIŞ'} — {m.movement_type === 'in' ? '+' : '-'}{m.quantity} ({formatDateTime(m.created_at)})
                  </Text>
                  <Text style={styles.movMeta}>👤 {(m.staff as { full_name?: string })?.full_name ?? '—'}</Text>
                  {m.notes ? <Text style={styles.movNotes}>📝 {m.notes}</Text> : null}
                  <View style={styles.movThumbs}>
                    {m.photo_proof ? (
                      <TouchableOpacity onPress={() => setPreviewUri(m.photo_proof)} activeOpacity={0.8}>
                        <CachedImage uri={m.photo_proof} style={styles.movThumb} contentFit="cover" />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push({ pathname: '/staff/stock/entry', params: { productId: id } })}
            activeOpacity={0.8}
          >
            <Ionicons name="download-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>📥 Stok Girişi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push({ pathname: '/staff/stock/exit', params: { productId: id } })}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.secondaryBtnText}>📤 Stok Çıkışı</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 24 }} />
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 24 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, color: theme.colors.textSecondary },
  errorText: { fontSize: 16, color: theme.colors.error },
  backBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.border },
  backBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  blockLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8, marginTop: 16 },
  heroImageWrap: { width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.borderLight, marginBottom: 12 },
  heroImage: { width: '100%', height: 220 },
  heroPlaceholder: { width: '100%', height: 220, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.borderLight },
  stockBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: theme.colors.success,
    marginBottom: 12,
  },
  stockBadgeLow: { backgroundColor: theme.colors.error },
  stockBadgeText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  card: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 12,
  },
  row: { marginBottom: 10 },
  rowLabel: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 2 },
  rowValue: { fontSize: 15, fontWeight: '500', color: theme.colors.text },
  emptyText: { fontSize: 14, color: theme.colors.textMuted },
  photoPlaceholder: { fontSize: 14, color: theme.colors.textMuted, padding: 20 },
  movRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 10,
  },
  movIcon: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  movIn: { backgroundColor: theme.colors.success },
  movOut: { backgroundColor: theme.colors.error },
  movBody: { flex: 1, minWidth: 0 },
  movText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  movMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  movNotes: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  movThumbs: { flexDirection: 'row', gap: 8, marginTop: 4 },
  movThumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: theme.colors.borderLight },
  actions: { gap: 10, marginTop: 16 },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  secondaryBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
});
