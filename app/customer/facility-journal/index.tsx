import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { FacilityJournalListCard } from '@/components/facilityJournal/FacilityJournalListCard';
import { listFacilityJournalRecordsForGuest, type FacilityJournalRecordRow } from '@/lib/facilityJournal';
import { theme } from '@/constants/theme';

export default function CustomerFacilityJournalIndex() {
  const router = useRouter();
  const [items, setItems] = useState<FacilityJournalRecordRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await listFacilityJournalRecordsForGuest();
    if (err) {
      setError(err.message ?? 'Liste yüklenemedi');
      setItems([]);
    } else {
      setError(null);
      setItems(data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading((prev) => (items.length ? prev : true));
      void load();
    }, [load, items.length])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openRecord = useCallback(
    (id: string) => {
      router.push(`/customer/facility-journal/${id}` as never);
    },
    [router]
  );

  if (loading && items.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>Otel yönetiminin sizinle paylaştığı tesis kayıtları.</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        renderItem={({ item }) => <FacilityJournalListCard item={item} onPress={openRecord} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{error ?? 'Henüz sizinle paylaşılan kayıt yok.'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  list: { paddingHorizontal: 16, paddingBottom: 28 },
  emptyList: { flexGrow: 1, padding: 24 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15, lineHeight: 22 },
});
