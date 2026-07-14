import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';
import {
  listSecurityCameraRecordings,
  type SecurityCameraRecordingRow,
} from '@/lib/securityCameraRecordings';

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function SecurityRecordingsIndex() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error } = await listSecurityCameraRecordings({ search: search.trim() || undefined });
    if (error) {
      setLoadError(error.message ?? 'Kayıtlar yüklenemedi');
      return [];
    }
    setLoadError(null);
    return ((data as SecurityCameraRecordingRow[]) ?? []) as SecurityCameraRecordingRow[];
  }, [search]);

  const { items, loading, refreshing, refresh, showList } = useCachedList<SecurityCameraRecordingRow>({
    cacheKey: `staff-security-recordings:${search.trim()}`,
    fetchItems,
  });

  const openNew = useCallback(() => router.push('/staff/security-recordings/new' as never), [router]);
  const openDetail = useCallback(
    (id: string) => router.push(`/staff/security-recordings/${id}` as never),
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: SecurityCameraRecordingRow }) => {
      const media = [...(item.media ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const thumb = media[0]?.thumbnail_url || media[0]?.public_url || null;
      const videoCount = media.filter((m) => m.media_type === 'video').length;
      return (
        <TouchableOpacity style={styles.card} onPress={() => openDetail(item.id)} activeOpacity={0.85}>
          <View style={styles.thumbWrap}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} />
            ) : (
              <View style={styles.thumbEmpty}>
                <Ionicons name="videocam-outline" size={28} color={theme.colors.textMuted} />
              </View>
            )}
            {videoCount > 0 ? (
              <View style={styles.videoBadge}>
                <Ionicons name="play" size={10} color="#fff" />
                <Text style={styles.videoBadgeText}>{videoCount}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {[item.camera_label, item.location_label].filter(Boolean).join(' · ') || 'Kamera belirtilmedi'}
            </Text>
            <Text style={styles.cardMeta}>
              {item.record_no ?? ''} · {formatDate(item.recorded_at || item.created_at)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      );
    },
    [openDetail]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.intro}>Önemli güvenlik kamerası kayıtlarını yükleyin ve arşivleyin.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={openNew} activeOpacity={0.9}>
          <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>Kayıt yükle</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Başlık, kamera, konum ara…"
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
          onSubmitEditing={() => void refresh()}
        />
      </View>

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}

      {!showList && loading ? (
        <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.colors.primary} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>Henüz kayıt yok. Kamera videosunu yüklemek için yukarıdaki butonu kullanın.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  headerBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, gap: 10 },
  intro: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
  },
  list: { padding: 16, paddingTop: 8, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  thumbWrap: { width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  videoBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  videoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  cardMeta: { fontSize: 12, color: '#64748b' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 48, paddingHorizontal: 24, lineHeight: 22 },
  error: { color: '#dc2626', paddingHorizontal: 16, marginBottom: 8 },
});
