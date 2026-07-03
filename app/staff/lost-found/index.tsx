import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { usePathname, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { AdminStackBackButton } from '@/lib/adminStackBack';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { LostFoundAccessGate } from '@/components/staff/LostFoundAccessGate';
import { CachedImage } from '@/components/CachedImage';
import { daysUntilRetention, getLostFoundCounts, listLostFoundItems, type LostFoundItemRow } from '@/lib/lostFound';
import { useCachedList } from '@/hooks/useCachedList';
import {
  LOST_FOUND_STATUSES,
  lostFoundCategoryLabel,
  lostFoundStatusLabel,
  LOST_FOUND_STATUS_COLOR,
  type LostFoundStatus,
} from '@/lib/lostFoundCatalog';

type TabKey = LostFoundStatus;

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function coverPhoto(item: LostFoundItemRow): string | null {
  const photos = item.photos ?? [];
  if (!photos.length) return null;
  const sorted = [...photos].sort((a, b) => a.sort_order - b.sort_order);
  return sorted[0]?.public_url ?? null;
}

function LostFoundIndexScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  const base = isAdminRoute ? '/admin/lost-found' : '/staff/lost-found';
  const locale = (i18n.language || 'tr').split('-')[0];

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () =>
        isAdminRoute ? (
          <AdminStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ) : (
          <StaffStackBackButton accessibilityLabel={t('back')} fallback={base as never} />
        ),
    });
  }, [navigation, isAdminRoute, base, t]);

  const [tab, setTab] = useState<TabKey>('stored');
  const cacheKey = `lost-found:${tab}`;
  const [counts, setCounts] = useState<Record<LostFoundStatus, number>>({ stored: 0, returned: 0, disposed: 0 });
  const [refreshing, setRefreshing] = useState(false);

  const fetchItems = useCallback(async () => {
    const [listRes, countRes] = await Promise.all([
      listLostFoundItems(tab),
      getLostFoundCounts(),
    ]);
    if (countRes.data) setCounts(countRes.data);
    return listRes.data;
  }, [tab]);

  const {
    items,
    loading,
    load,
  } = useCachedList<LostFoundItemRow>({
    cacheKey,
    fetchItems,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const tabLabels = useMemo(
    () =>
      ({
        stored: t('lfTabStored'),
        returned: t('lfTabReturned'),
        disposed: t('lfTabDisposed'),
      }) satisfies Record<TabKey, string>,
    [t]
  );

  const renderItem = ({ item }: { item: LostFoundItemRow }) => {
    const thumb = coverPhoto(item);
    const daysLeft = tab === 'stored' ? daysUntilRetention(item.retention_until) : null;
    const urgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => router.push(`${base}/${item.id}` as never)}
      >
        <View style={styles.thumbWrap}>
          {thumb ? (
            <CachedImage uri={thumb} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={styles.thumbPlaceholder}>
              <Ionicons name="briefcase-outline" size={28} color={theme.colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTop}>
            <Text style={styles.refCode}>{item.reference_code}</Text>
            {item.value_tier === 'high' ? (
              <View style={styles.highPill}>
                <Text style={styles.highPillText}>{t('lfValue_high')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {lostFoundCategoryLabel(t, item.category)}
            {item.room?.room_number ? ` · ${t('lfRoom')} ${item.room.room_number}` : ''}
            {item.found_location_detail ? ` · ${item.found_location_detail}` : ''}
          </Text>
          <Text style={styles.cardDate}>{formatDate(item.found_at, locale)}</Text>
          {urgent ? (
            <Text style={styles.urgentText}>
              {daysLeft === 0 ? t('lfRetentionToday') : t('lfRetentionDays', { days: daysLeft })}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.headerBlock}>
        <Text style={styles.intro}>{t('lfHubIntro')}</Text>
        <View style={styles.statsRow}>
          {LOST_FOUND_STATUSES.map((s) => (
            <View key={s} style={styles.statPill}>
              <Text style={[styles.statCount, { color: LOST_FOUND_STATUS_COLOR[s] }]}>{counts[s]}</Text>
              <Text style={styles.statLabel}>{lostFoundStatusLabel(t, s)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.tabs}>
        {LOST_FOUND_STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.tab, tab === s && styles.tabActive]}
            onPress={() => {
              setTab(s);
            }}
          >
            <Text style={[styles.tabText, tab === s && styles.tabTextActive]}>{tabLabels[s]}</Text>
            {counts[s] > 0 ? (
              <View style={[styles.tabBadge, tab === s && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, tab === s && styles.tabBadgeTextActive]}>{counts[s]}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>

      {loading && items.length === 0 ? (
        <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="briefcase-outline" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>{t('lfEmptyTitle')}</Text>
              <Text style={styles.emptyHint}>{t('lfEmptyHint')}</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={() => router.push(`${base}/new` as never)}>
        <Ionicons name="add" size={28} color="#fff" />
        <Text style={styles.fabText}>{t('lfNewRecord')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  headerBlock: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  intro: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  statPill: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  statCount: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, gap: 6, marginBottom: 8 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.card,
  },
  tabActive: { backgroundColor: theme.colors.primary + '18' },
  tabText: { fontSize: 13, color: theme.colors.textMuted, fontWeight: '500' },
  tabTextActive: { color: theme.colors.primary, fontWeight: '600' },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabBadgeActive: { backgroundColor: theme.colors.primary },
  tabBadgeText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  tabBadgeTextActive: { color: '#fff' },
  loader: { marginTop: 40 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyList: { flexGrow: 1, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  thumbWrap: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  refCode: { fontSize: 12, fontWeight: '700', color: theme.colors.primary },
  highPill: { backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  highPillText: { fontSize: 10, fontWeight: '600', color: '#b45309' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginTop: 2 },
  cardMeta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  cardDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  urgentText: { fontSize: 12, fontWeight: '600', color: theme.colors.error, marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text, marginTop: 16 },
  emptyHint: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

export default function LostFoundIndexRoute() {
  return (
    <LostFoundAccessGate>
      <LostFoundIndexScreen />
    </LostFoundAccessGate>
  );
}
