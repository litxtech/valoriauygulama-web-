import { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { stockProductImagePatchFromEntry } from '@/lib/stockProductImages';

type Movement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  staff_image: string | null;
  photo_proof: string | null;
  notes: string | null;
  created_at: string;
  product: { name: string; unit: string | null; current_stock: number | null; barcode: string | null } | null;
  staff: { full_name: string | null } | null;
};

export default function StockApprovalsScreen() {
  const router = useRouter();
  const { staff: currentStaff } = useAuthStore();
  const [pending, setPending] = useState<Movement[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from('stock_movements')
      .select('id, product_id, movement_type, quantity, staff_image, photo_proof, notes, created_at, product:stock_products(name, unit, current_stock, barcode), staff:staff_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    setPending(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const approve = async (movement: Movement) => {
    if (!currentStaff?.id) return;
    const { data: prod } = await supabase.from('stock_products').select('current_stock').eq('id', movement.product_id).single();
    const cur = (prod?.current_stock ?? 0) as number;
    const newStock = movement.movement_type === 'in' ? cur + movement.quantity : cur - movement.quantity;
    if (movement.movement_type === 'out' && newStock < 0) {
      Alert.alert('Hata', 'Stok yetersiz.');
      return;
    }
    await supabase.from('stock_movements').update({ status: 'approved', approved_by: currentStaff.id, approved_at: new Date().toISOString() }).eq('id', movement.id);
    const imagePatch = stockProductImagePatchFromEntry(movement.photo_proof, movement.movement_type);
    await supabase
      .from('stock_products')
      .update({ current_stock: newStock, ...(imagePatch ?? {}) })
      .eq('id', movement.product_id);
    load();
  };

  const reject = async (id: string) => {
    await supabase.from('stock_movements').update({ status: 'rejected' }).eq('id', id);
    load();
  };

  return (
    <View style={styles.container}>
      {pending.length > 0 && (
        <View style={styles.subBar}>
          <Text style={styles.subBarText}>{pending.length} işlem</Text>
        </View>
      )}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {pending.map((m) => (
          <View key={m.id} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.productName}>{(m.product as { name?: string })?.name ?? m.product_id}</Text>
              <Text style={[styles.quantity, m.movement_type === 'in' ? styles.qtyIn : styles.qtyOut]}>
                {m.movement_type === 'in' ? '+' : '-'}{m.quantity} {(m.product as { unit?: string })?.unit ?? 'adet'}
              </Text>
            </View>
            <View style={styles.staffRow}>
              <Text style={styles.staffLabel}>Teslim alan: {(m.staff as { full_name?: string })?.full_name ?? '—'}</Text>
              {(m.product as { barcode?: string | null })?.barcode && (
                <Text style={styles.barcodeLabel}>Barkod: {(m.product as { barcode?: string }).barcode}</Text>
              )}
            </View>
            {(m.staff_image || m.photo_proof) && (
              <View style={styles.photoRow}>
                {m.staff_image && (
                  <TouchableOpacity onPress={() => setPreviewUri(m.staff_image)} activeOpacity={0.8}>
                    <CachedImage uri={m.staff_image} style={styles.thumb} contentFit="cover" />
                  </TouchableOpacity>
                )}
                {m.photo_proof && (
                  <TouchableOpacity onPress={() => setPreviewUri(m.photo_proof)} activeOpacity={0.8}>
                    <CachedImage uri={m.photo_proof} style={styles.thumb} contentFit="cover" />
                  </TouchableOpacity>
                )}
              </View>
            )}
            {m.notes ? <Text style={styles.notes}>{m.notes}</Text> : null}
            <Text style={styles.time}>{new Date(m.created_at).toLocaleString('tr-TR')}</Text>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btnApprove} onPress={() => approve(m)}>
                <Text style={styles.btnText}>ONAYLA</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnReject} onPress={() => reject(m.id)}>
                <Text style={styles.btnText}>REDDET</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
        {pending.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Onay bekleyen işlem yok</Text>
          </View>
        )}
      </ScrollView>
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  subBar: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  subBarText: { fontSize: 14, color: '#6b7280' },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productName: { fontSize: 16, fontWeight: '700' },
  quantity: { fontSize: 16, fontWeight: '700' },
  qtyIn: { color: '#16a34a' },
  qtyOut: { color: '#dc2626' },
  staffRow: { marginTop: 8 },
  staffLabel: { fontSize: 13, color: '#6b7280' },
  barcodeLabel: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  photoRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  notes: { fontSize: 13, color: '#374151', marginTop: 8 },
  time: { fontSize: 11, color: '#9ca3af', marginTop: 6 },
  actions: { flexDirection: 'row', marginTop: 12, gap: 12 },
  btnApprove: { flex: 1, backgroundColor: '#16a34a', padding: 12, borderRadius: 8 },
  btnReject: { flex: 1, backgroundColor: '#dc2626', padding: 12, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, color: '#6b7280' },
});
