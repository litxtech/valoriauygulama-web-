import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { theme } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/kbsApi';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { useTranslation } from 'react-i18next';

export default function RoomsLiveViewScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['kbs', 'rooms_summary'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/rooms/summary');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    ...kbsQueryOptions,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Canlı Oda Görünümü</Text>
      <Text style={styles.p}>Oda bazlı aktif misafirler ve KBS durumları (polling).</Text>

      {q.isError ? (
        <Text style={styles.error}>{(q.error as Error)?.message ?? t('requestFailed')}</Text>
      ) : null}

      <FlatList
        data={q.data ?? []}
        keyExtractor={(it) => it.roomId}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.roomTitle}>Oda {item.roomNumber}</Text>
            <Text style={styles.meta}>Aktif: {(item.guests ?? []).length}</Text>
            <Text style={styles.meta}>Ready: {item.counts?.ready_to_submit ?? 0} • Submitted: {item.counts?.submitted ?? 0} • Failed: {item.counts?.failed ?? 0}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q.isPending ? t('adminLoadingEllipsis') : q.isError ? '' : 'Oda yok.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  error: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 4 },
  roomTitle: { fontWeight: '900', color: theme.colors.text },
  meta: { color: theme.colors.textSecondary },
});

