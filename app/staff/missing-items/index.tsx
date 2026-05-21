import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView, ActivityIndicator } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { getMissingAreaCounts } from '@/lib/missingItems';
import {
  defaultMissingAreaForDepartment,
  getMissingAreaMeta,
  type MissingItemArea,
} from '@/lib/missingItemsCatalog';

const AREAS: MissingItemArea[] = ['kitchen', 'hotel'];

export default function MissingItemsHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const missingBase = pathname?.startsWith('/admin') ? '/admin/missing-items' : '/staff/missing-items';
  const staff = useAuthStore((s) => s.staff);
  const [counts, setCounts] = useState<Record<MissingItemArea, { open: number; resolved: number }>>({
    kitchen: { open: 0, resolved: 0 },
    hotel: { open: 0, resolved: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const suggested = defaultMissingAreaForDepartment(staff?.department);

  const load = useCallback(async () => {
    const res = await getMissingAreaCounts();
    if (res.data) setCounts(res.data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} />
      }
    >
      <Text style={styles.introTitle}>{t('missingItemsHubTitle')}</Text>
      <Text style={styles.introText}>{t('missingItemsHubIntro')}</Text>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
      ) : (
        AREAS.map((area) => {
          const meta = getMissingAreaMeta(area);
          const c = counts[area];
          const isSuggested = suggested === area;
          return (
            <TouchableOpacity
              key={area}
              style={[styles.areaCard, { borderLeftColor: meta.color }]}
              activeOpacity={0.85}
              onPress={() => router.push(`${missingBase}/${area}` as never)}
            >
              <View style={[styles.iconWrap, { backgroundColor: meta.color + '20' }]}>
                <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={28} color={meta.color} />
              </View>
              <View style={styles.areaBody}>
                <View style={styles.titleRow}>
                  <Text style={styles.areaTitle}>{meta.title}</Text>
                  {isSuggested ? (
                    <View style={styles.suggestedPill}>
                      <Text style={styles.suggestedText}>{t('missingItemsYourArea')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.areaSub}>{meta.subtitle}</Text>
                <View style={styles.statsRow}>
                  <View style={styles.stat}>
                    <Text style={[styles.statNum, c.open > 0 && { color: theme.colors.error }]}>{c.open}</Text>
                    <Text style={styles.statLabel}>{t('missingItemsOpenReports')}</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.stat}>
                    <Text style={styles.statNum}>{c.resolved}</Text>
                    <Text style={styles.statLabel}>{t('missingItemsResolved')}</Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
            </TouchableOpacity>
          );
        })
      )}

      <TouchableOpacity
        style={styles.historyCard}
        activeOpacity={0.85}
        onPress={() => router.push(`${missingBase}/history` as never)}
      >
        <View style={styles.historyIconWrap}>
          <Ionicons name="time-outline" size={26} color={theme.colors.success} />
        </View>
        <View style={styles.historyBody}>
          <Text style={styles.historyTitle}>{t('missingItemsHistoryTitle')}</Text>
          <Text style={styles.historySub}>{t('missingItemsHistorySub')}</Text>
          {!loading ? (
            <Text style={styles.historyMeta}>
              {t('missingItemsHistoryMeta', { count: counts.kitchen.resolved + counts.hotel.resolved })}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  introTitle: { fontSize: 22, fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
  introText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 21, marginBottom: theme.spacing.lg },
  areaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  iconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  areaBody: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  areaTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  suggestedPill: {
    backgroundColor: theme.colors.primaryLight + '40',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  suggestedText: { fontSize: 10, fontWeight: '700', color: theme.colors.primaryDark },
  areaSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, marginBottom: 10 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  stat: { flex: 1 },
  statNum: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: theme.colors.border, marginHorizontal: 12 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.success + '55',
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  historyIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.success + '18',
  },
  historyBody: { flex: 1 },
  historyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  historySub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4, lineHeight: 18 },
  historyMeta: { fontSize: 11, color: theme.colors.success, fontWeight: '700', marginTop: 6 },
});
