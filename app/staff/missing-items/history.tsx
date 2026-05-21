import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import {
  listMissingItemsHistory,
  type MissingHistoryEntry,
  type MissingItemPriority,
  type MissingItemReportRow,
  type MissingItemRow,
} from '@/lib/missingItems';
import { getMissingAreaMeta, type MissingItemArea } from '@/lib/missingItemsCatalog';
import { cacheMissingItemReport } from '@/lib/missingItemsCache';

type AreaFilter = MissingItemArea | 'all';

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatSectionDate(iso: string, locale: string): string {
  try {
    const loc = locale.startsWith('ar') ? 'ar-SA' : locale.startsWith('tr') ? 'tr-TR' : 'en-US';
    return new Date(iso).toLocaleDateString(loc, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function parseInitialArea(raw: string | string[] | undefined): AreaFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'kitchen' || v === 'hotel') return v;
  return 'all';
}

type Section = { title: string; data: MissingHistoryEntry[] };

export default function MissingItemsHistoryScreen() {
  const { t, i18n } = useTranslation();
  const dateLocale = (i18n.language || 'tr').split('-')[0];
  const priorityLabel = useMemo(
    (): Record<MissingItemPriority, string> => ({
      low: t('missingItemsPriorityLow'),
      medium: t('missingItemsPriorityMedium'),
      high: t('missingItemsPriorityHigh'),
    }),
    [t, i18n.language]
  );
  const router = useRouter();
  const pathname = usePathname();
  const missingBase = pathname?.startsWith('/admin') ? '/admin/missing-items' : '/staff/missing-items';
  const { area: areaParam } = useLocalSearchParams<{ area?: string }>();

  const [filter, setFilter] = useState<AreaFilter>(() => parseInitialArea(areaParam));
  const [entries, setEntries] = useState<MissingHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await listMissingItemsHistory(filter, 150);
    setEntries(res.data);
    setLoading(false);
    setRefreshing(false);
  }, [filter]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const sections = useMemo((): Section[] => {
    const map = new Map<string, MissingHistoryEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.resolvedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries()).map(([key, data]) => ({
      title: formatSectionDate(data[0]?.resolvedAt ?? key, dateLocale),
      data,
    }));
  }, [entries, dateLocale]);

  const totalItems = useMemo(() => {
    let n = 0;
    for (const e of entries) {
      if (e.kind === 'report') n += e.data.item_count;
      else n += 1;
    }
    return n;
  }, [entries]);

  const openEntry = (entry: MissingHistoryEntry) => {
    if (entry.kind === 'report') {
      cacheMissingItemReport(entry.data);
      router.push(`${missingBase}/report/${entry.data.id}` as never);
    } else {
      router.push(`${missingBase}/legacy/${entry.data.id}` as never);
    }
  };

  const renderReport = (item: MissingItemReportRow, area: MissingItemArea) => {
    const meta = getMissingAreaMeta(area);
    const titles = (item.items ?? []).map((i) => i.title);
    return (
      <>
        <View style={styles.cardTop}>
          <View style={[styles.areaPill, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={14} color={meta.color} />
            <Text style={[styles.areaPillText, { color: meta.color }]}>{meta.title}</Text>
          </View>
          <Text style={styles.resolvedTime}>{formatDateTime(item.resolved_at, dateLocale)}</Text>
        </View>
        <Text style={styles.cardTitle}>{t('missingItemsHistoryResolvedCount', { count: item.item_count })}</Text>
        <View style={styles.itemList}>
          {titles.map((title, idx) => (
            <View key={`${item.id}-${idx}`} style={styles.itemRow}>
              <Ionicons name="checkmark-circle" size={16} color={theme.colors.success} />
              <Text style={styles.itemLabel}>{title}</Text>
            </View>
          ))}
        </View>
        {item.note?.trim() ? <Text style={styles.note}>{t('missingItemsNotePrefix')} {item.note}</Text> : null}
        <Text style={styles.meta}>
          {t('missingItemsHistoryReporter', {
            reporter: item.creator?.full_name || '—',
            resolver: item.resolver?.full_name || '—',
          })}
        </Text>
      </>
    );
  };

  const renderLegacy = (item: MissingItemRow, area: MissingItemArea) => {
    const meta = getMissingAreaMeta(area);
    return (
      <>
        <View style={styles.cardTop}>
          <View style={[styles.areaPill, { backgroundColor: meta.color + '20' }]}>
            <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={14} color={meta.color} />
            <Text style={[styles.areaPillText, { color: meta.color }]}>{meta.title}</Text>
          </View>
          <Text style={styles.resolvedTime}>{formatDateTime(item.resolved_at, dateLocale)}</Text>
        </View>
        <Text style={styles.cardTitle}>{item.title}</Text>
        {item.description?.trim() ? <Text style={styles.note}>{item.description}</Text> : null}
        <Text style={styles.meta}>
          {t('missingItemsHistoryLegacyMeta', {
            priority: priorityLabel[item.priority] ?? item.priority,
            resolver: item.resolver?.full_name || '—',
          })}
        </Text>
      </>
    );
  };

  const filters: { key: AreaFilter; label: string }[] = useMemo(
    () => [
      { key: 'all', label: t('missingItemsFilterAll') },
      { key: 'kitchen', label: t('missArea_kitchen_title') },
      { key: 'hotel', label: t('missArea_hotel_title') },
    ],
    [t, i18n.language]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.filterBar}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipOn]}
            onPress={() => {
              if (f.key === filter) return;
              setLoading(true);
              setFilter(f.key);
            }}
          >
            <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && entries.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => (item.kind === 'report' ? `r-${item.data.id}` : `l-${item.data.id}`)}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={theme.colors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.hero}>
              <Text style={styles.heroTitle}>{t('missingItemsHistoryTitle')}</Text>
              <Text style={styles.heroSub}>{t('missingItemsHistorySub')}</Text>
              {entries.length > 0 ? (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryNum}>{entries.length}</Text>
                  <Text style={styles.summaryLabel}>
                    {t('missingItemsHistorySummary', { reports: entries.length, items: totalItems })}
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="archive-outline" size={48} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>Geçmiş kayıt yok</Text>
              <Text style={styles.emptySub}>Giderilen eksikler burada listelenir.</Text>
            </View>
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{title}</Text>
            </View>
          )}
          renderItem={({ item: entry }) => (
            <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openEntry(entry)}>
              {entry.kind === 'report' ? renderReport(entry.data, entry.area) : renderLegacy(entry.data, entry.area)}
              <View style={styles.cardFooter}>
                <Text style={styles.detailLink}>{t('missingItemsSeeDetail')}</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    backgroundColor: theme.colors.borderLight,
  },
  filterChipOn: { backgroundColor: theme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  filterChipTextOn: { color: theme.colors.white },
  listContent: { paddingBottom: 40 },
  hero: { padding: theme.spacing.lg, paddingBottom: theme.spacing.md },
  heroTitle: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginTop: 6 },
  summaryRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 12 },
  summaryNum: { fontSize: 28, fontWeight: '900', color: theme.colors.success },
  summaryLabel: { fontSize: 14, color: theme.colors.textSecondary, fontWeight: '600' },
  sectionHeader: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 8,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'capitalize',
  },
  card: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  areaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  areaPillText: { fontSize: 11, fontWeight: '800' },
  resolvedTime: { fontSize: 11, color: theme.colors.textMuted },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 8 },
  itemList: { gap: 6, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemLabel: { flex: 1, fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  note: { fontSize: 13, color: theme.colors.textSecondary, fontStyle: 'italic', marginBottom: 6 },
  meta: { fontSize: 11, color: theme.colors.textMuted },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  detailLink: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  empty: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center' },
});
