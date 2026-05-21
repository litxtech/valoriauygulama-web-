import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { formatTrShortDayLabelFromYmd } from '@/lib/mealMenuDate';
import {
  fetchPastMealMenuMonths,
  fetchMealMenuForMonth,
  fetchKitchenConfirmationsForMenu,
  rowToMealFields,
  mealDayHasContent,
  summarizeMonthDays,
  type MealKitchenConfirmation,
  type MealMenuMonthMeta,
  type MealMenuDayRow,
} from '@/lib/staffMealMenu';
import { MealDayViewCard, MealMenuEmptyState, staffMealPalette } from '@/components/mealMenu/MealMenuUi';

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function monthLabelFromPeriod(periodMonth: string): string {
  const [y, m] = periodMonth.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  return `${MONTHS_TR[(m || 1) - 1]} ${y}`;
}

function viewMonthFromPeriod(periodMonth: string): Date {
  const [y, m] = periodMonth.slice(0, 10).split('-').map((x) => parseInt(x, 10));
  return new Date(y, (m || 1) - 1, 1);
}

export default function StaffMealMenuHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [months, setMonths] = useState<MealMenuMonthMeta[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [days, setDays] = useState<MealMenuDayRow[]>([]);
  const [confirmations, setConfirmations] = useState<Record<string, MealKitchenConfirmation>>({});
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadMonths = useCallback(async () => {
    if (!staff?.organization_id) {
      setMonths([]);
      return;
    }
    return fetchPastMealMenuMonths(staff.organization_id, 36);
  }, [staff?.organization_id]);

  const loadDetail = useCallback(async (period: string) => {
    if (!staff?.organization_id) return;
    setLoadingDetail(true);
    try {
      const vm = viewMonthFromPeriod(period);
      const { menu, days: dayRows } = await fetchMealMenuForMonth(staff.organization_id, vm);
      setDays(dayRows);
      if (menu?.id) {
        setConfirmations(await fetchKitchenConfirmationsForMenu(menu.id));
      } else {
        setConfirmations({});
      }
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
      setDays([]);
      setConfirmations({});
    } finally {
      setLoadingDetail(false);
    }
  }, [staff?.organization_id]);

  useEffect(() => {
    (async () => {
      setLoadingMonths(true);
      try {
        const list = await loadMonths();
        setMonths(list ?? []);
        if ((list?.length ?? 0) > 0) {
          setSelectedPeriod((prev) => prev ?? list![0].period_month.slice(0, 10));
        }
      } catch (e: unknown) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
      } finally {
        setLoadingMonths(false);
      }
    })();
  }, [loadMonths]);

  useEffect(() => {
    if (!selectedPeriod) return;
    loadDetail(selectedPeriod);
  }, [selectedPeriod, loadDetail]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const list = await loadMonths();
      setMonths(list ?? []);
      if (selectedPeriod) await loadDetail(selectedPeriod);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
    } finally {
      setRefreshing(false);
    }
  };

  const filledDays = useMemo(
    () => days.filter((d) => mealDayHasContent(rowToMealFields(d))),
    [days]
  );
  const summary = useMemo(() => summarizeMonthDays(days), [days]);
  const confirmCount = Object.keys(confirmations).length;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.intro}>{t('staffMealHistoryIntro')}</Text>

        {loadingMonths ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 24 }} />
        ) : months.length === 0 ? (
          <MealMenuEmptyState
            icon="archive-outline"
            title={t('staffMealHistoryEmptyTitle')}
            message={t('staffMealHistoryEmptyMessage')}
            palette={staffMealPalette}
          />
        ) : (
          <>
            <Text style={styles.sectionLabel}>{t('staffMealHistoryPickMonth')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
              {months.map((m) => {
                const p = m.period_month.slice(0, 10);
                const active = p === selectedPeriod;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.monthChip, active && styles.monthChipActive]}
                    onPress={() => setSelectedPeriod(p)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.monthChipText, active && styles.monthChipTextActive]}>
                      {monthLabelFromPeriod(p)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {selectedPeriod ? (
              <View style={styles.detailHead}>
                <Text style={styles.detailTitle}>{monthLabelFromPeriod(selectedPeriod)}</Text>
                <Text style={styles.detailMeta}>
                  {t('staffMealHistoryMeta', {
                    days: summary.withContent,
                    confirms: confirmCount,
                  })}
                </Text>
              </View>
            ) : null}

            {loadingDetail ? (
              <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 20 }} />
            ) : (
              filledDays.map((r) => {
                const ymd = r.meal_date.slice(0, 10);
                const conf = confirmations[ymd];
                return (
                  <View key={ymd} style={styles.dayBlock}>
                    <MealDayViewCard
                      ymd={ymd}
                      fields={rowToMealFields(r)}
                      isToday={false}
                      palette={staffMealPalette}
                      compact
                    />
                    {conf ? (
                      <View style={styles.confDetail}>
                        <View style={styles.confHead}>
                          <Ionicons name="checkmark-done-circle" size={20} color="#16a34a" />
                          <Text style={styles.confHeadText}>{t('staffMealKitchenConfirmed')}</Text>
                        </View>
                        <Text style={styles.confLine}>
                          {formatTrShortDayLabelFromYmd(ymd)} ·{' '}
                          {new Date(conf.confirmed_at).toLocaleString('tr-TR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        {conf.confirmed_by?.full_name ? (
                          <Text style={styles.confLine}>
                            {t('staffMealKitchenConfirmedBy', { name: conf.confirmed_by.full_name })}
                          </Text>
                        ) : null}
                        <View style={styles.confChecks}>
                          <ConfCheck ok={conf.prepared_meals} label={t('staffMealKitchenCheckPrepared')} />
                          <ConfCheck ok={conf.took_samples} label={t('staffMealKitchenCheckSamples')} />
                          <ConfCheck ok={conf.preserved_samples} label={t('staffMealKitchenCheckPreserved')} />
                        </View>
                        {conf.note?.trim() ? (
                          <Text style={styles.confNote}>{conf.note.trim()}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.noConf}>{t('staffMealHistoryNoConfirm')}</Text>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ConfCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.confCheckRow}>
      <Ionicons name={ok ? 'checkmark-circle' : 'close-circle'} size={16} color={ok ? '#16a34a' : '#94a3b8'} />
      <Text style={styles.confCheckLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16 },
  intro: { fontSize: 14, lineHeight: 22, color: theme.colors.textSecondary, marginBottom: 10 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6 },
  monthRow: { gap: 8, paddingBottom: 12 },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  monthChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  monthChipText: { fontWeight: '600', color: theme.colors.text },
  monthChipTextActive: { color: '#fff' },
  detailHead: { marginBottom: 12 },
  detailTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  detailMeta: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  dayBlock: { marginBottom: 16 },
  confDetail: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: -6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  confHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  confHeadText: { fontWeight: '700', color: '#166534' },
  confLine: { fontSize: 12, color: theme.colors.textSecondary, marginBottom: 4 },
  confChecks: { marginTop: 6, gap: 4 },
  confCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  confCheckLabel: { fontSize: 13, color: theme.colors.text },
  confNote: {
    marginTop: 8,
    fontSize: 13,
    color: theme.colors.text,
    fontStyle: 'italic',
    backgroundColor: theme.colors.backgroundSecondary,
    padding: 8,
    borderRadius: 8,
  },
  noConf: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4, marginLeft: 4 },
});
