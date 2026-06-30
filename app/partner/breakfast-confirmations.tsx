import { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { PartnerBreakfastConfirmCard } from '@/components/breakfastPartner/PartnerBreakfastConfirmCard';
import { PartnerEmptyState, PartnerHero } from '@/components/breakfastPartner/PartnerUi';
import {
  listPartnerBreakfastConfirmations,
  listPartnerDailyEntriesLedger,
  type PartnerBreakfastConfirmation,
  type PartnerDailyEntryLedgerRow,
} from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function PartnerBreakfastConfirmationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollBottomPad = insets.bottom + 24;
  const [items, setItems] = useState<PartnerBreakfastConfirmation[]>([]);
  const [partnerEntries, setPartnerEntries] = useState<PartnerDailyEntryLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const entryByDate = new Map(partnerEntries.map((e) => [e.record_date, e.guest_count]));

  const load = useCallback(async () => {
    try {
      const [confirmations, entries] = await Promise.all([
        listPartnerBreakfastConfirmations(60).catch(() => [] as PartnerBreakfastConfirmation[]),
        listPartnerDailyEntriesLedger(90).catch(() => [] as PartnerDailyEntryLedgerRow[]),
      ]);
      setItems(confirmations);
      setPartnerEntries(entries);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={[styles.boot, { paddingTop: insets.top }]}>
        <ActivityIndicator color={partnerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PartnerHero title="Kahvaltı teyitleri" subtitle="Otel mutfağı yüklemeleri" onBack={() => router.back()} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: scrollBottomPad, paddingTop: 8, flexGrow: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={partnerTheme.accent}
          />
        }
        ListEmptyComponent={
          <PartnerEmptyState
            icon="cafe-outline"
            title="Henüz teyit kaydı yok"
            body="Mutfak personeli kahvaltı teyidi yüklediğinde tarih, saat ve onay bilgisi burada listelenir."
          />
        }
        renderItem={({ item }) => (
          <PartnerBreakfastConfirmCard item={item} partnerGuestCount={entryByDate.get(item.record_date) ?? null} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center' },
});
