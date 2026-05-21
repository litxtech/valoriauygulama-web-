import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { formatDateShort, formatTime } from '@/lib/date';
import { useTranslation } from 'react-i18next';

const EXIT_REASONS = [
  { value: 'room', label: 'Oda kullanımı' },
  { value: 'cleaning', label: 'Temizlik' },
  { value: 'kitchen', label: 'Mutfak' },
  { value: 'other', label: 'Diğer' },
] as const;

type Product = { id: string; name: string; unit: string | null; current_stock: number | null };
type ExitItem = { productId: string; name: string; currentStock: number; quantity: string; unit: string };
type RecentExit = {
  id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  product: { name: string } | null;
  staff: { full_name: string | null } | null;
};

export default function StaffStockExitScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ productId?: string }>();
  const { staff } = useAuthStore();

  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<ExitItem[]>([]);
  const [reason, setReason] = useState<(typeof EXIT_REASONS)[number]['value'] | ''>('');
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentExits, setRecentExits] = useState<RecentExit[]>([]);

  const now = new Date();
  const displayDate = formatDateShort(now.toISOString());
  const displayTime = formatTime(now.toISOString());

  useEffect(() => {
    supabase
      .from('stock_products')
      .select('id, name, unit, current_stock')
      .order('name')
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);

  useEffect(() => {
    supabase
      .from('stock_movements')
      .select('id, quantity, notes, created_at, product:stock_products(name), staff:staff_id(full_name)')
      .eq('movement_type', 'out')
      .order('created_at', { ascending: false })
      .limit(15)
      .then(({ data }) => setRecentExits((data ?? []) as RecentExit[]));
  }, []);

  useEffect(() => {
    const id = params.productId;
    if (!id) return;
    if (items.some((i) => i.productId === id)) {
      router.setParams({ productId: undefined });
      return;
    }

    const fromList = products.find((p) => p.id === id);
    if (fromList) {
      addProduct(fromList);
      router.setParams({ productId: undefined });
      return;
    }

    supabase
      .from('stock_products')
      .select('id, name, unit, current_stock')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (data) addProduct(data as Product);
        router.setParams({ productId: undefined });
      });
  }, [params.productId, products, items, router]);

  const addProduct = (p: Product) => {
    const cur = p.current_stock ?? 0;
    if (cur <= 0) {
      Alert.alert(t('stockListTitle'), t('productNotFoundStockExitMessage'));
      return;
    }
    if (items.some((i) => i.productId === p.id)) return;
    setItems((prev) => [
      ...prev,
      { productId: p.id, name: p.name, currentStock: cur, quantity: '', unit: p.unit ?? 'adet' },
    ]);
    setSearch('');
  };

  const removeItem = (productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId));

  const submit = async () => {
    if (!staff?.id) return Alert.alert(t('error'), t('loginRequiredTitle'));
    if (!reason) return Alert.alert(t('missingInfo'), t('required'));

    const valid = items
      .map((i) => ({ ...i, q: parseInt(i.quantity, 10) }))
      .filter((i) => !isNaN(i.q) && i.q > 0 && i.q <= i.currentStock);

    if (valid.length === 0) return Alert.alert(t('missingInfo'), t('required'));

    setLoading(true);
    try {
      const reasonLabel = EXIT_REASONS.find((r) => r.value === reason)?.label ?? reason;
      const movementNotes = notes.trim() ? `${reasonLabel}: ${notes.trim()}` : reasonLabel;

      for (const i of valid) {
        const { error } = await supabase.from('stock_movements').insert({
          product_id: i.productId,
          movement_type: 'out',
          quantity: i.q,
          staff_id: staff.id,
          notes: movementNotes,
          status: 'pending',
        });
        if (error) throw error;
      }

      const { data } = await supabase
        .from('stock_movements')
        .select('id, quantity, notes, created_at, product:stock_products(name), staff:staff_id(full_name)')
        .eq('movement_type', 'out')
        .order('created_at', { ascending: false })
        .limit(15);
      setRecentExits((data ?? []) as RecentExit[]);
      const { notifyAdminPanel } = await import('@/lib/notificationService');
      const names = valid.map((i) => i.name).slice(0, 3).join(', ');
      void notifyAdminPanel({
        title: `📤 ${t('pendingApproval')}`,
        body: valid.length === 1 ? `${names} · stok çıkışı onay bekliyor.` : `${valid.length} kalem çıkış onay bekliyor.`,
        href: '/admin/stock/approvals',
        notificationType: 'stock_pending_approval',
      });
      Alert.alert(t('saved'), t('pendingApproval'), () => router.back());
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('recordError'));
    }
    setLoading(false);
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📦 Çıkış yapılacak ürünler</Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push({ pathname: '/staff/stock/scan', params: { returnTo: 'exit' } })}
          activeOpacity={0.8}
        >
          <Ionicons name="barcode-outline" size={22} color="#fff" />
          <Text style={styles.primaryBtnText}>📸 Barkod Okut (Hızlı çıkış için)</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Ürün ara</Text>
        <TextInput
          style={styles.input}
          placeholder="Ürün adı yazın..."
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length >= 2 && (
          <View style={styles.searchList}>
            {filtered.slice(0, 10).map((p) => (
              <TouchableOpacity key={p.id} style={styles.searchItem} onPress={() => addProduct(p)} activeOpacity={0.8}>
                <Text style={styles.searchItemName}>{p.name}</Text>
                <Text style={styles.searchItemStock}>Stok: {p.current_stock ?? 0} {p.unit ?? 'adet'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {items.length > 0 && (
        <View style={styles.card}>
          <View style={styles.exitPromptCard}>
            <Text style={styles.exitPromptTitle}>Kaç adet çıkış yapacaksınız? Ne için?</Text>
            <Text style={styles.exitPromptHint}>Her ürün için çıkış miktarını girin ve aşağıdan çıkış nedenini seçin. Kaydettiğinizde stok düşecektir (onay sonrası).</Text>
          </View>
          <Text style={styles.sectionTitle}>📋 Çıkış yapılacak ürünler</Text>
          {items.map((i) => (
            <View key={i.productId} style={styles.exitBlock}>
              <Text style={styles.rowName}>{i.name}</Text>
              <Text style={styles.rowSub}>Stok: {i.currentStock} {i.unit}</Text>
              <View style={styles.qtyRow}>
                <Text style={styles.qtyLabel}>Çıkış miktarı:</Text>
                <TextInput
                  style={styles.qtyInput}
                  value={i.quantity}
                  onChangeText={(v) => setItems((prev) => prev.map((x) => (x.productId === i.productId ? { ...x, quantity: v } : x)))}
                  placeholder="0"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                />
                <Text style={styles.qtyUnit}>adet</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>👤 Çıkaran:</Text>
                <Text style={styles.metaValue}>{staff?.full_name ?? '—'}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>📅 Tarih:</Text>
                <Text style={styles.metaValue}>{displayDate}</Text>
                <Text style={[styles.metaLabel, { marginLeft: 12 }]}>🕒 Saat:</Text>
                <Text style={styles.metaValue}>{displayTime}</Text>
              </View>
              <TouchableOpacity onPress={() => removeItem(i.productId)} hitSlop={12} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {items.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>📝 Çıkış nedeni</Text>
          {EXIT_REASONS.map((r) => (
            <TouchableOpacity
              key={r.value}
              style={[styles.reasonRow, reason === r.value && styles.reasonRowSelected]}
              onPress={() => setReason(r.value)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={reason === r.value ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={reason === r.value ? theme.colors.primary : theme.colors.textMuted}
              />
              <Text style={styles.reasonLabel}>{r.label}</Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.label, { marginTop: 12 }]}>📝 Çıkış nedeni (detay)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Örn: Oda 102 temizliği için..."
            placeholderTextColor={theme.colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
          />

          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={submit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.submitBtnText}>✅ Çıkış yap</Text>}
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>📋 Son çıkışlar</Text>
        {recentExits.length === 0 ? (
          <Text style={styles.emptyText}>Henüz çıkış kaydı yok.</Text>
        ) : (
          <View style={styles.recentList}>
            {recentExits.map((m) => (
              <View key={m.id} style={styles.recentRow}>
                <Text style={styles.recentLeft}>
                  {formatDateShort(m.created_at)} · {(m.staff as { full_name?: string })?.full_name ?? '—'} · {(m.product as { name?: string })?.name ?? '—'} ({m.quantity})
                </Text>
                <Text style={styles.recentRight}>{formatTime(m.created_at)}</Text>
                {m.notes ? <Text style={styles.recentNotes} numberOfLines={1}>{m.notes}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 24 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  primaryBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  label: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  searchList: { marginTop: 10, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: theme.radius.md, overflow: 'hidden' },
  searchItem: { paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  searchItemName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  searchItemStock: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  exitPromptCard: {
    backgroundColor: `${theme.colors.primary}14`,
    padding: 14,
    borderRadius: theme.radius.md,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  exitPromptTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  exitPromptHint: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 6 },
  exitBlock: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    position: 'relative',
  },
  rowName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  rowSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  qtyLabel: { fontSize: 13, color: theme.colors.textMuted },
  qtyInput: {
    minWidth: 70,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    textAlign: 'center',
    color: '#111827',
    backgroundColor: theme.colors.surface,
  },
  qtyUnit: { fontSize: 13, color: theme.colors.textMuted },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6, gap: 4 },
  metaLabel: { fontSize: 12, color: theme.colors.textMuted },
  metaValue: { fontSize: 13, color: theme.colors.text },
  removeBtn: { position: 'absolute', top: 8, right: 0, padding: 6 },
  recentList: { marginTop: 4 },
  recentRow: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  recentLeft: { fontSize: 13, color: theme.colors.text },
  recentRight: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  recentNotes: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 6, borderRadius: theme.radius.md },
  reasonRowSelected: { backgroundColor: `${theme.colors.primary}14` },
  reasonLabel: { fontSize: 14, color: theme.colors.text },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

