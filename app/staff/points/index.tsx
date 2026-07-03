import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pds } from '@/constants/personelDesignSystem';
import { useAuthStore } from '@/stores/authStore';
import { getDepartmentLabel } from '@/lib/departmentLabels';
import {
  describePointEntry,
  fetchStaffPointsLedger,
  POINT_CATEGORY_ICONS,
} from '@/lib/staffPoints';
import { getStaffPointsTierMeta } from '@/lib/staffPointsTiers';
import { pointsTheme } from '@/components/points';
import {
  StaffPointsLiveHeader,
  StaffPointsTierCard,
  StaffPointsSourceStrip,
  StaffPointsTimelineRow,
  StaffPointsRankCompact,
  StaffPointsTabBar,
} from '@/components/points/StaffPointsExperience';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type Tab = 'status' | 'history' | 'ranking';

export default function StaffPointsScreen() {
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const [tab, setTab] = useState<Tab>('status');

  const fetchData = useCallback(async () => {
    if (!staff?.id || !staff.organization_id) return null;
    return fetchStaffPointsLedger({
      organizationId: staff.organization_id,
      staffId: staff.id,
    });
  }, [staff?.id, staff?.organization_id]);

  const cacheKey =
    staff?.id && staff.organization_id
      ? `staff-points-ledger:${staff.organization_id}:${staff.id}`
      : 'staff-points-ledger:none';

  const { data: ledger, loading, refreshing, refresh, showContent } = useCachedFocusLoad({
    cacheKey,
    enabled: !!staff?.id && !!staff.organization_id,
    fetchData,
  });

  const total = ledger?.mySummary?.total_points ?? 0;
  const tierMeta = getStaffPointsTierMeta(total);
  const positiveCount = ledger?.mySummary?.positive_count ?? 0;
  const negativeCount = ledger?.mySummary?.negative_count ?? 0;
  const rank = ledger?.myRank ?? 0;
  const rankedTotal = ledger?.rankedTotal ?? 0;

  const sourceRows = useMemo(
    () =>
      (ledger?.byCategory ?? []).map((row) => ({
        ...row,
        icon: (POINT_CATEGORY_ICONS[row.key] ?? 'star') as keyof typeof Ionicons.glyphMap,
      })),
    [ledger?.byCategory]
  );

  const deptRows = useMemo(
    () =>
      (ledger?.byDepartment ?? []).map((row) => ({
        ...row,
        icon: 'business' as keyof typeof Ionicons.glyphMap,
      })),
    [ledger?.byDepartment]
  );

  const recentHistory = ledger?.history.slice(0, 5) ?? [];

  if (!showContent && !ledger) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={pointsTheme.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={pointsTheme.gold} />}
        showsVerticalScrollIndicator={false}
      >
        <StaffPointsLiveHeader
          total={total}
          rank={rank}
          rankedTotal={rankedTotal}
          positiveCount={positiveCount}
          negativeCount={negativeCount}
        />

        <StaffPointsTabBar
          tabs={[
            { key: 'status', label: 'Durum' },
            { key: 'history', label: 'Hareketler' },
            { key: 'ranking', label: 'Sıralama' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'status' && (
          <>
            <StaffPointsTierCard meta={tierMeta} />

            <Text style={styles.sectionLbl}>Puanlar nereden geldi?</Text>
            <StaffPointsSourceStrip rows={sourceRows} />
            {deptRows.length > 0 ? (
              <>
                <Text style={[styles.sectionLbl, { marginTop: 6 }]}>Bölüme göre</Text>
                <StaffPointsSourceStrip rows={deptRows} />
              </>
            ) : null}
            {sourceRows.length === 0 ? (
              <Text style={styles.emptyHint}>Henüz kayıtlı puan hareketi yok.</Text>
            ) : null}

            <View style={styles.legendRow}>
              <LegendItem color="#EF4444" text="50 altı → denetim süreci" />
              <LegendItem color="#047857" text="100+ → güvenilir personel" />
            </View>

            {recentHistory.length > 0 ? (
              <>
                <Text style={styles.sectionLbl}>Son hareketler</Text>
                {recentHistory.map((entry, idx) => {
                  const { source, giver } = describePointEntry(entry, ledger!.giverNames);
                  return (
                    <StaffPointsTimelineRow
                      key={entry.id}
                      entry={entry}
                      source={source}
                      giver={giver}
                      deptLabel={entry.department ? getDepartmentLabel(entry.department) : null}
                      index={idx}
                    />
                  );
                })}
                <Pressable onPress={() => setTab('history')}>
                  <Text style={styles.moreHint}>Tüm hareketleri gör →</Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}

        {tab === 'history' && (
          <>
            <Text style={styles.sectionHint}>
              Her satırda: kaç puan, nereden, kim verdi, ne zaman. Olumsuz puanlar kırmızı ile işaretlenir.
            </Text>
            {(ledger?.history.length ?? 0) === 0 ? (
              <View style={styles.emptyBox}>
                <Ionicons name="time-outline" size={22} color="#94A3B8" />
                <Text style={styles.emptyText}>
                  Görev, kahvaltı teyidi veya yönetici puanları burada listelenir.
                </Text>
              </View>
            ) : (
              ledger?.history.map((entry, idx) => {
                const { source, giver } = describePointEntry(entry, ledger.giverNames);
                return (
                  <StaffPointsTimelineRow
                    key={entry.id}
                    entry={entry}
                    source={source}
                    giver={giver}
                    deptLabel={entry.department ? getDepartmentLabel(entry.department) : null}
                    index={idx}
                  />
                );
              })
            )}
          </>
        )}

        {tab === 'ranking' && (
          <>
            <Text style={styles.sectionHint}>
              Tüm bölümlerden personeller aynı listede. Sıralama toplam puana göre canlı güncellenir.
            </Text>
            {(ledger?.leaderboard.length ?? 0) === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>Henüz sıralama oluşturacak puan yok.</Text>
              </View>
            ) : (
              ledger?.leaderboard.map((row, idx) => (
                <StaffPointsRankCompact
                  key={row.staff_id}
                  row={row}
                  isMe={row.staff_id === staff?.id}
                  index={idx}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function LegendItem({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: pds.pageBg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: pds.pageBg },
  scroll: { padding: 14, paddingBottom: 32 },
  sectionLbl: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  sectionHint: { fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 17 },
  emptyHint: { fontSize: 12, color: '#94A3B8', marginBottom: 10 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  moreHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 8,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  emptyText: { fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 17 },
});
