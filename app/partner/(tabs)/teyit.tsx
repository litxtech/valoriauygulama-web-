import { useCallback, useState } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useFocusEffect } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PartnerBreakfastConfirmSection } from '@/components/breakfastPartner/PartnerBreakfastConfirmSection';
import { PartnerGlassCard, PartnerScreenTitle } from '@/components/breakfastPartner/PartnerUi';
import {
  listPartnerBreakfastConfirmations,
  listPartnerDailyEntriesLedger,
  type PartnerBreakfastConfirmation,
  type PartnerDailyEntryLedgerRow,
} from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function PartnerBreakfastTeyitScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const partner = usePartnerAuthStore((s) => s.partner)!;

  const [refreshing, setRefreshing] = useState(false);
  const [confirmations, setConfirmations] = useState<PartnerBreakfastConfirmation[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<PartnerDailyEntryLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [teyitler, entries] = await Promise.all([
        listPartnerBreakfastConfirmations(30).catch(() => [] as PartnerBreakfastConfirmation[]),
        listPartnerDailyEntriesLedger(31, partner.hotel.id).catch(() => [] as PartnerDailyEntryLedgerRow[]),
      ]);
      setConfirmations(teyitler);
      setLedgerEntries(entries);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partner.hotel.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={styles.root}>
      <PartnerScreenTitle title="Kahvaltı teyit" subtitle="Otel mutfağından gelen teyitler · tarih ve onay durumu" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: scrollBottomPad, paddingHorizontal: 18, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        <PartnerGlassCard glow>
          <PartnerBreakfastConfirmSection
            items={confirmations}
            loading={loading}
            partnerEntries={ledgerEntries}
            previewLimit={30}
            showViewAll
          />
        </PartnerGlassCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  scroll: { flex: 1, backgroundColor: partnerTheme.bg },
});
