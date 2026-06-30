import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PartnerEmptyState, PartnerSectionTitle } from '@/components/breakfastPartner/PartnerUi';
import { PartnerBreakfastConfirmCard } from '@/components/breakfastPartner/PartnerBreakfastConfirmCard';
import type { PartnerBreakfastConfirmation, PartnerDailyEntryLedgerRow } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  items: PartnerBreakfastConfirmation[];
  loading?: boolean;
  partnerEntries?: PartnerDailyEntryLedgerRow[];
  previewLimit?: number;
  showViewAll?: boolean;
};

export const PartnerBreakfastConfirmSection = memo(function PartnerBreakfastConfirmSection({
  items,
  loading = false,
  partnerEntries = [],
  previewLimit = 3,
  showViewAll = true,
}: Props) {
  const router = useRouter();
  const entryByDate = new Map(partnerEntries.map((e) => [e.record_date, e.guest_count]));
  const preview = items.slice(0, previewLimit);

  return (
    <View style={styles.wrap}>
      <PartnerSectionTitle
        icon="camera-outline"
        title="Otel kahvaltı teyitleri"
        hint="Mutfak yüklemeleri · tarih ve saat · onay durumu"
      />

      {loading && items.length === 0 ? (
        <View style={styles.loader}>
          <ActivityIndicator color={partnerTheme.accent} />
          <Text style={styles.loaderText}>Teyitler yükleniyor…</Text>
        </View>
      ) : preview.length === 0 ? (
        <PartnerEmptyState
          icon="cafe-outline"
          title="Henüz teyit yok"
          body="Otel mutfağı kahvaltı teyidi yüklediğinde burada tarih, saat ve onay durumu görünür."
        />
      ) : (
        <>
          {preview.map((item) => (
            <PartnerBreakfastConfirmCard
              key={item.id}
              item={item}
              partnerGuestCount={entryByDate.get(item.record_date) ?? null}
              compact
            />
          ))}
          {showViewAll && items.length > 0 ? (
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => router.push('/partner/breakfast-confirmations')}
              activeOpacity={0.85}
            >
              <Text style={styles.viewAllText}>
                {items.length > previewLimit ? `Tüm teyitler (${items.length})` : 'Teyit listesini aç'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={partnerTheme.accent} />
            </TouchableOpacity>
          ) : null}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginTop: 14 },
  loader: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  loaderText: { color: partnerTheme.muted, fontSize: 13, fontWeight: '600' },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  viewAllText: { color: partnerTheme.accent, fontWeight: '800', fontSize: 14 },
});
