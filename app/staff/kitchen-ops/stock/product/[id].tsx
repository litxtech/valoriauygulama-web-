import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { KitchenStockItemCard } from '@/components/kitchenOps/KitchenStockItemCard';
import { KitchenMultiPhotoPicker } from '@/components/kitchenOps/KitchenMultiPhotoPicker';
import { fetchKitchenItem, fetchKitchenItemMovements } from '@/lib/kitchenOps/api';
import { addKitchenStockItemImages, fetchKitchenStockItemImages } from '@/lib/kitchenOps/handover';
import type { KitchenStockItem, KitchenStockMovement } from '@/lib/kitchenOps/types';
import { KITCHEN_USAGE_REASONS } from '@/lib/kitchenOps/constants';
import { formatDateShort, formatTime } from '@/lib/date';
import { fmtKitchenQty } from '@/lib/kitchenOps/stockStatus';

const REASON_LABELS = Object.fromEntries(KITCHEN_USAGE_REASONS.map((r) => [r.value, r.label]));
const TYPE_LABELS: Record<string, string> = { in: 'Giriş', out: 'Çıkış', waste: 'Zayi', return: 'İade', correction: 'Düzeltme' };

export default function KitchenProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<KitchenStockItem | null>(null);
  const [extraImages, setExtraImages] = useState<{ id: string; image_url: string }[]>([]);
  const [movements, setMovements] = useState<KitchenStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [savingPhotos, setSavingPhotos] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [it, mv, imgs] = await Promise.all([
      fetchKitchenItem(id),
      fetchKitchenItemMovements(id),
      fetchKitchenStockItemImages(id),
    ]);
    setItem(it);
    setMovements(mv);
    setExtraImages(imgs.map((i) => ({ id: i.id, image_url: i.image_url })));
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const galleryUrls = useMemo(() => {
    const urls: string[] = [];
    if (item?.image_url) urls.push(item.image_url);
    for (const img of extraImages) {
      if (!urls.includes(img.image_url)) urls.push(img.image_url);
    }
    return urls;
  }, [item?.image_url, extraImages]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const saveExtraPhotos = async () => {
    if (!id || pendingPhotos.length === 0) return;
    setSavingPhotos(true);
    try {
      await addKitchenStockItemImages(id, pendingPhotos);
      setPendingPhotos([]);
      await load();
      Alert.alert('Tamam', 'Fotoğraflar eklendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSavingPhotos(false);
    }
  };

  if (loading || !item) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {galleryUrls.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
          {galleryUrls.map((uri) => (
            <TouchableOpacity key={uri} onPress={() => setPreviewUri(uri)} activeOpacity={0.9}>
              <CachedImage uri={uri} style={styles.hero} contentFit="cover" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <KitchenStockItemCard
        item={item}
        showQuickExit
        onQuickExit={() => router.push({ pathname: '/staff/kitchen-ops/stock/exit', params: { itemId: item.id } } as never)}
      />

      <Text style={styles.section}>Ürün fotoğrafları</Text>
      <KitchenMultiPhotoPicker
        photos={pendingPhotos}
        onChange={setPendingPhotos}
        subfolder="product"
        hint="Bu ürüne istediğiniz kadar fotoğraf ekleyebilirsiniz."
        onPreview={setPreviewUri}
      />
      {pendingPhotos.length > 0 ? (
        <TouchableOpacity style={styles.savePhotosBtn} onPress={saveExtraPhotos} disabled={savingPhotos}>
          <Text style={styles.savePhotosText}>{savingPhotos ? 'Kaydediliyor…' : 'Fotoğrafları kaydet'}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.section}>Hareket geçmişi</Text>
      {movements.length === 0 ? (
        <Text style={styles.empty}>Henüz hareket yok.</Text>
      ) : (
        movements.map((m) => {
          const staff = m.staff as { full_name: string | null } | null;
          return (
            <View key={m.id} style={styles.moveRow}>
              <Text style={styles.moveDate}>{formatDateShort(m.created_at)} {formatTime(m.created_at)}</Text>
              <Text style={styles.moveMain}>
                {TYPE_LABELS[m.movement_type] ?? m.movement_type}: {fmtKitchenQty(m.quantity, item.unit)}
                {m.reason ? ` · ${REASON_LABELS[m.reason] ?? m.reason}` : ''}
              </Text>
              {staff?.full_name ? <Text style={styles.moveStaff}>{staff.full_name}</Text> : null}
              {m.note ? <Text style={styles.moveNote}>{m.note}</Text> : null}
            </View>
          );
        })
      )}
      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gallery: { gap: 8, marginBottom: 12 },
  hero: { width: 160, height: 160, borderRadius: 14 },
  section: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginTop: 16, marginBottom: 10 },
  savePhotosBtn: {
    marginTop: 8,
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  savePhotosText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
  moveRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  moveDate: { fontSize: 11, color: theme.colors.textMuted },
  moveMain: { fontSize: 14, fontWeight: '700', color: theme.colors.text, marginTop: 4 },
  moveStaff: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  moveNote: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, fontStyle: 'italic' },
});
