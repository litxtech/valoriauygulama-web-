import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()} ${h}:${min}`;
}

type MovementRow = {
  id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  notes: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  has_photo: boolean;
  product: { id: string; name: string; unit: string | null } | null;
};

type FilterType = 'all' | 'in' | 'out';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
};

const STATUS_COLOR: Record<string, string> = {
  approved: theme.colors.success,
  rejected: theme.colors.error,
  pending: '#ca8a04',
};

export default function StaffMyMovementsScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!staff?.id) return;
      if (!opts?.silent) setInitialLoading(true);
      const { data, error } = await supabase
        .from('stock_movements')
        .select(
          'id, movement_type, quantity, notes, created_at, status, photo_proof, product:stock_products(id, name, unit)'
        )
        .eq('staff_id', staff.id)
        .order('created_at', { ascending: false })
        .limit(120);
      if (error) {
        setMovements([]);
      } else {
        setMovements(
          (data ?? []).map((row) => {
            const r = row as MovementRow & { photo_proof?: string | null };
            return {
              id: r.id,
              movement_type: r.movement_type,
              quantity: r.quantity,
              notes: r.notes,
              created_at: r.created_at,
              status: r.status,
              has_photo: !!r.photo_proof,
              product: r.product,
            };
          })
        );
      }
      setInitialLoading(false);
      setRefreshing(false);
    },
    [staff?.id]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load({ silent: true });
  };

  const handleDeleteMovement = useCallback((m: MovementRow) => {
    const isAdmin = staff?.role === 'admin';
    if (m.status === 'approved' && !isAdmin) {
      Alert.alert('Silinemez', 'Onaylanmış hareket silinemez. Stoğa işlenmiş kayıtları admin panelinden yönetin.');
      return;
    }
    const typeLabel = m.movement_type === 'in' ? 'giriş' : 'çıkış';
    const productName = m.product?.name ?? 'ürün';
    Alert.alert(
      'Hareketi sil',
      `"${productName}" ${typeLabel} hareketini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(m.id);
            try {
              const { error } = await supabase.from('stock_movements').delete().eq('id', m.id);
              if (error) throw error;
              setMovements((prev) => prev.filter((x) => x.id !== m.id));
            } catch (e) {
              Alert.alert('Hata', (e as Error)?.message ?? 'Silinemedi.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  }, [staff?.role]);

  const openPhoto = useCallback(async (movementId: string) => {
    setLoadingPhotoId(movementId);
    try {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('photo_proof')
        .eq('id', movementId)
        .maybeSingle();
      if (error) throw error;
      if (data?.photo_proof) setPreviewUri(data.photo_proof);
      else Alert.alert('Fotoğraf yok', 'Bu hareket için kayıtlı görsel bulunamadı.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setLoadingPhotoId(null);
    }
  }, []);

  const filtered = useMemo(() => {
    let list = movements;
    if (filter === 'in') list = list.filter((m) => m.movement_type === 'in');
    else if (filter === 'out') list = list.filter((m) => m.movement_type === 'out');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.product?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [movements, filter, search]);

  const stats = useMemo(() => {
    let inCount = 0;
    let outCount = 0;
    let inQty = 0;
    let outQty = 0;
    for (const m of movements) {
      if (m.movement_type === 'in') {
        inCount++;
        inQty += m.quantity;
      } else {
        outCount++;
        outQty += m.quantity;
      }
    }
    return { inCount, outCount, inQty, outQty };
  }, [movements]);

  const renderItem = useCallback(
    ({ item: m }: { item: MovementRow }) => {
      const productName = m.product?.name ?? '—';
      const unit = m.product?.unit ?? 'adet';
      const isIn = m.movement_type === 'in';
      const productId = m.product?.id;
      const statusColor = STATUS_COLOR[m.status] ?? STATUS_COLOR.pending;

      return (
        <View style={[styles.card, isIn ? styles.cardIn : styles.cardOut]}>
          <View style={styles.cardTop}>
            <View style={[styles.typePill, isIn ? styles.typePillIn : styles.typePillOut]}>
              <Ionicons name={isIn ? 'arrow-down' : 'arrow-up'} size={14} color="#fff" />
              <Text style={styles.typePillText}>
                {isIn ? '+' : '-'}
                {m.quantity} {unit}
              </Text>
            </View>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[m.status]}</Text>
          </View>
          <Text style={styles.productName} numberOfLines={2}>
            {productName}
          </Text>
          <Text style={styles.dateText}>{formatShortDateTime(m.created_at)}</Text>
          {m.notes ? (
            <Text style={styles.notesText} numberOfLines={2}>
              {m.notes}
            </Text>
          ) : null}
          <View style={styles.cardActions}>
            {m.has_photo ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => openPhoto(m.id)}
                disabled={loadingPhotoId === m.id}
              >
                {loadingPhotoId === m.id ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <>
                    <Ionicons name="image-outline" size={16} color={theme.colors.primary} />
                    <Text style={styles.actionBtnTextPrimary}>Fotoğraf</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {productId ? (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push(`/staff/stock/product/${productId}`)}
              >
                <Ionicons name="open-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.actionBtnTextPrimary}>Ürün</Text>
              </TouchableOpacity>
            ) : null}
            {(m.status !== 'approved' || staff?.role === 'admin') && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handleDeleteMovement(m)}
                disabled={deletingId === m.id}
              >
                {deletingId === m.id ? (
                  <ActivityIndicator size="small" color={theme.colors.error} />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                    <Text style={styles.actionBtnTextDanger}>Sil</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [deletingId, loadingPhotoId, staff?.role, router, openPhoto, handleDeleteMovement]
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardIn]}>
            <Text style={[styles.statValue, { color: theme.colors.success }]}>+{stats.inQty}</Text>
            <Text style={styles.statLabel}>Eklenen · {stats.inCount} işlem</Text>
          </View>
          <View style={[styles.statCard, styles.statCardOut]}>
            <Text style={[styles.statValue, { color: theme.colors.error }]}>-{stats.outQty}</Text>
            <Text style={styles.statLabel}>Çıkarılan · {stats.outCount} işlem</Text>
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

        <View style={styles.filterRow}>
          {(
            [
              { value: 'all' as FilterType, label: 'Tümü' },
              { value: 'in' as FilterType, label: 'Eklediğim' },
              { value: 'out' as FilterType, label: 'Çıkardığım' },
            ] as const
          ).map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.filterChip, filter === opt.value && styles.filterChipActive]}
              onPress={() => setFilter(opt.value)}
              activeOpacity={0.85}
            >
              <Text style={[styles.filterChipText, filter === opt.value && styles.filterChipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Hareketler ({filtered.length})</Text>
      </>
    ),
    [stats, search, filter, filtered.length]
  );

  if (!staff?.id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Oturum gerekli.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          initialLoading ? (
            <View style={styles.listLoading}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Hareketler yükleniyor…</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>
                {movements.length === 0
                  ? 'Henüz stok girişi veya çıkışı yapmadınız.'
                  : 'Arama veya filtreye uygun hareket yok.'}
              </Text>
              {movements.length === 0 && (
                <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/staff/stock/entry')}>
                  <Text style={styles.emptyBtnText}>Stok girişi yap</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={8}
        removeClippedSubviews
      />
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  listContent: { padding: 16, paddingBottom: 32 },
  listLoading: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: theme.colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  statCardIn: { borderColor: theme.colors.success + '55' },
  statCardOut: { borderColor: theme.colors.error + '55' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, marginTop: 4 },
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
    marginBottom: 10,
  },
  search: { flex: 1, fontSize: 15, color: theme.colors.text },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  emptyCard: {
    alignItems: 'center',
    padding: 28,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 10 },
  emptyBtn: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: theme.colors.borderLight,
  },
  cardIn: { borderLeftColor: theme.colors.success },
  cardOut: { borderLeftColor: theme.colors.error },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typePillIn: { backgroundColor: theme.colors.success },
  typePillOut: { backgroundColor: theme.colors.error },
  typePillText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  statusText: { fontSize: 11, fontWeight: '700' },
  productName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  dateText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  notesText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtnTextPrimary: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  actionBtnTextDanger: { fontSize: 13, fontWeight: '600', color: theme.colors.error },
});
