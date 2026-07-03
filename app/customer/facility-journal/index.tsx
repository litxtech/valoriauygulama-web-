import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FacilityJournalListCard } from '@/components/facilityJournal/FacilityJournalListCard';
import { listFacilityJournalRecordsForGuest, type FacilityJournalRecordRow } from '@/lib/facilityJournal';
import { theme } from '@/constants/theme';
import { useCachedList } from '@/hooks/useCachedList';

export default function CustomerFacilityJournalIndex() {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    const { data, error: err } = await listFacilityJournalRecordsForGuest();
    if (err) {
      setError(err.message ?? t('customerFacilityJournalListError'));
      return [];
    }
    setError(null);
    return (data ?? []) as FacilityJournalRecordRow[];
  }, [t]);

  const { items, loading, refreshing, refresh } = useCachedList<FacilityJournalRecordRow>({
    cacheKey: 'customer-facility-journal-list',
    fetchItems,
  });

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
      <Text style={styles.intro}>{t('customerFacilityJournalIntro')}</Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        renderItem={({ item }) => <FacilityJournalListCard item={item} onPress={openRecord} />}
        ListEmptyComponent={
          <Text style={styles.empty}>{error ?? t('customerFacilityJournalEmpty')}</Text>
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
