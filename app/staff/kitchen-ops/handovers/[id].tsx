import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { fetchKitchenHandover, type KitchenHandoverDetail } from '@/lib/kitchenOps/handover';
import { formatDateShort } from '@/lib/date';
import { fmtKitchenQty } from '@/lib/kitchenOps/stockStatus';
import { Ionicons } from '@expo/vector-icons';

export default function KitchenHandoverDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<KitchenHandoverDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const data = await fetchKitchenHandover(id);
    setDetail(data);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading || !detail) {
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
      <View style={styles.hero}>
        <Text style={styles.heroDate}>{formatDateShort(detail.handover_date)}</Text>
        <Text style={styles.heroFlow}>{detail.handed_by_name} → {detail.received_by_name}</Text>
        <Text style={styles.heroMeta}>Valoria Hotel · Mutfak teslim kaydı</Text>
      </View>

      {detail.notes ? (
        <View style={styles.noteBox}>
          <Text style={styles.noteLabel}>Not</Text>
          <Text style={styles.noteText}>{detail.notes}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>{detail.items.length} malzeme</Text>

      {detail.items.map((item, idx) => (
        <View key={item.id} style={styles.itemCard}>
          <Text style={styles.itemTitle}>{idx + 1}. {item.material_name}</Text>
          {item.quantity != null ? (
            <Text style={styles.itemQty}>{fmtKitchenQty(item.quantity, item.unit)}</Text>
          ) : null}
          {item.note ? <Text style={styles.itemNote}>{item.note}</Text> : null}

          {item.images.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
              {item.images.map((img) => (
                <TouchableOpacity key={img.id} activeOpacity={0.9} onPress={() => setPreviewUri(img.image_url)}>
                  <CachedImage uri={img.image_url} style={styles.photo} contentFit="cover" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noPhoto}>
              <Ionicons name="image-outline" size={16} color={theme.colors.textMuted} />
              <Text style={styles.noPhotoText}>Fotoğraf yok</Text>
            </View>
          )}
        </View>
      ))}

      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: '#0d9488', borderRadius: 16, padding: 18, marginBottom: 12 },
  heroDate: { color: '#ccfbf1', fontSize: 13, fontWeight: '700' },
  heroFlow: { color: '#fff', fontSize: 20, fontWeight: '900', marginTop: 6 },
  heroMeta: { color: '#99f6e4', fontSize: 12, marginTop: 6 },
  noteBox: { backgroundColor: theme.colors.surface, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: theme.colors.borderLight },
  noteLabel: { fontSize: 11, fontWeight: '800', color: theme.colors.textMuted, textTransform: 'uppercase' },
  noteText: { fontSize: 14, color: theme.colors.text, marginTop: 4 },
  section: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  itemTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  itemQty: { fontSize: 14, fontWeight: '700', color: '#0d9488', marginTop: 4 },
  itemNote: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6 },
  photoRow: { gap: 8, paddingTop: 10 },
  photo: { width: 88, height: 88, borderRadius: 10, backgroundColor: theme.colors.borderLight },
  noPhoto: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  noPhotoText: { fontSize: 12, color: theme.colors.textMuted },
});
