import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import {
  getMissingItemReport,
  resolveMissingItemLine,
  resolveMissingItemReport,
  type MissingItemPriority,
  type MissingItemReportRow,
} from '@/lib/missingItems';
import {
  cacheMissingItemReport,
  getCachedMissingItemReport,
  patchCachedMissingItemReport,
} from '@/lib/missingItemsCache';
import { getMissingAreaMeta } from '@/lib/missingItemsCatalog';

type ReportItem = NonNullable<MissingItemReportRow['items']>[number];

const PRIORITY_COLOR: Record<MissingItemPriority, string> = {
  low: '#6c757d',
  medium: theme.colors.primary,
  high: theme.colors.error,
};

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    const loc = locale.startsWith('ar') ? 'ar-SA' : locale.startsWith('tr') ? 'tr-TR' : 'en-US';
    return new Date(iso).toLocaleString(loc, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function MissingItemReportDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reportId = Array.isArray(id) ? id[0] : id;
  const dateLocale = (i18n.language || 'tr').split('-')[0];

  const priorityLabel = useMemo(
    (): Record<MissingItemPriority, string> => ({
      low: t('missingItemsPriorityLow'),
      medium: t('missingItemsPriorityMedium'),
      high: t('missingItemsPriorityHigh'),
    }),
    [t, i18n.language]
  );

  const [report, setReport] = useState<MissingItemReportRow | null>(() =>
    reportId ? getCachedMissingItemReport(reportId) ?? null : null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!reportId) return;
    setRefreshing(true);
    const res = await getMissingItemReport(reportId);
    if (res.data) {
      setReport(res.data);
      cacheMissingItemReport(res.data);
    } else if (res.error && !opts?.silent) {
      Alert.alert(t('error'), res.error);
    }
    setRefreshing(false);
  }, [reportId, t]);

  useEffect(() => {
    if (!reportId) return;
    const cached = getCachedMissingItemReport(reportId);
    if (cached) setReport(cached);
    void load({ silent: !!cached });
  }, [reportId, load]);

  const meta = report ? getMissingAreaMeta(report.area) : null;
  const items = report?.items ?? [];

  const { resolvedCount, openCount } = useMemo(() => {
    let resolved = 0;
    let open = 0;
    for (const it of items) {
      if (it.status === 'resolved') resolved += 1;
      else open += 1;
    }
    return { resolvedCount: resolved, openCount: open };
  }, [items]);

  const reportFullyResolved = report?.status === 'resolved' || openCount === 0;

  const applyItemResolved = (itemId: string) => {
    if (!report) return;
    const nextItems = items.map((it) => (it.id === itemId ? { ...it, status: 'resolved' as const } : it));
    const nextOpen = nextItems.filter((it) => it.status === 'open').length;
    const next: MissingItemReportRow = {
      ...report,
      items: nextItems,
      status: nextOpen === 0 ? 'resolved' : report.status,
    };
    setReport(next);
    patchCachedMissingItemReport(report.id, next);
  };

  const onToggleItem = (item: ReportItem) => {
    if (!report || item.status === 'resolved' || reportFullyResolved) return;

    Alert.alert(t('missingItemsFulfilledTitle'), t('missingItemsFulfilledBody', { title: item.title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('missingItemsFulfilledBtn'),
        onPress: async () => {
          setTogglingId(item.id);
          applyItemResolved(item.id);
          const result = await resolveMissingItemLine(item.id);
          setTogglingId(null);
          if (result.error) {
            Alert.alert(t('error'), result.error);
            void load({ silent: true });
            return;
          }
          void load({ silent: true });
        },
      },
    ]);
  };

  const onResolveAll = () => {
    if (!report || openCount === 0) return;
    Alert.alert(t('missingItemsResolveAllItemsTitle'), t('missingItemsResolveAllRemainingBody', { count: openCount }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('missingItemsMarkAllBtn'),
        onPress: async () => {
          const result = await resolveMissingItemReport(report.id);
          if (result.error) Alert.alert(t('error'), result.error);
          else {
            void load({ silent: true });
            if (openCount === items.length) router.back();
          }
        },
      },
    ]);
  };

  if (!reportId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('missingItemsInvalidArea')}</Text>
      </View>
    );
  }

  if (!report && refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!report || !meta) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('missingItemsRecordNotFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t('missingItemsGoBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {refreshing ? (
        <View style={styles.refreshBar}>
          <ActivityIndicator size="small" color={meta.color} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderLeftColor: meta.color }]}>
          <View style={styles.heroTop}>
            <View style={[styles.countBadge, { backgroundColor: meta.color }]}>
              <Text style={styles.countBadgeText}>{report.item_count}</Text>
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>{t('missingItemsReportItemsCount', { count: report.item_count })}</Text>
              <Text style={styles.heroSub}>{meta.title}</Text>
              {!reportFullyResolved ? (
                <Text style={styles.progressText}>
                  {t('missingItemsReportProgressLeft', {
                    resolved: resolvedCount,
                    total: report.item_count,
                    open: openCount,
                  })}
                </Text>
              ) : null}
            </View>
            <View
              style={[
                styles.statusPill,
                reportFullyResolved ? styles.statusResolved : styles.statusOpen,
              ]}
            >
              <Text style={styles.statusPillText}>
                {reportFullyResolved ? t('missingItemsStatusDone') : t('missingItemsStatusOngoing')}
              </Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <MetaRow
              label={t('missingItemsMetaPriority')}
              value={priorityLabel[report.priority]}
              accent={PRIORITY_COLOR[report.priority]}
            />
            <MetaRow label={t('missingItemsMetaNotification')} value={formatDateTime(report.created_at, dateLocale)} />
            <MetaRow label={t('missingItemsMetaReporter')} value={report.creator?.full_name || '—'} />
            {reportFullyResolved ? (
              <>
                <MetaRow label={t('missingItemsMetaResolvedBy')} value={report.resolver?.full_name || '—'} />
                <MetaRow label={t('missingItemsMetaResolvedAt')} value={formatDateTime(report.resolved_at, dateLocale)} />
              </>
            ) : null}
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {reportFullyResolved ? t('missingItemsItemsResolved') : t('missingItemsItemsMark')}
        </Text>
        {!reportFullyResolved ? <Text style={styles.sectionHint}>{t('missingItemsCheckboxHint')}</Text> : null}

        <View style={styles.itemCard}>
          {items.length === 0 ? (
            <Text style={styles.emptyItems}>{t('missingItemsItemListLoadFailed')}</Text>
          ) : (
            items.map((item, idx) => {
              const done = item.status === 'resolved';
              const busy = togglingId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.itemRow, idx > 0 && styles.itemRowBorder, done && styles.itemRowDone]}
                  onPress={() => onToggleItem(item)}
                  disabled={done || reportFullyResolved || busy}
                  activeOpacity={done ? 1 : 0.7}
                >
                  <View style={[styles.checkbox, done && styles.checkboxDone]}>
                    {busy ? (
                      <ActivityIndicator size="small" color={theme.colors.success} />
                    ) : done ? (
                      <Ionicons name="checkmark" size={16} color="#fff" />
                    ) : null}
                  </View>
                  <Text style={[styles.itemLabel, done && styles.itemLabelDone]}>{item.title}</Text>
                  {done ? (
                    <Text style={styles.doneTag}>{t('missingItemsFulfilledTag')}</Text>
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color={theme.colors.border} />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {report.note?.trim() ? (
          <>
            <Text style={styles.sectionTitle}>{t('missingItemsSectionNote')}</Text>
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>{report.note}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      {!reportFullyResolved && openCount > 0 ? (
        <View style={styles.footer}>
          <TouchableOpacity style={[styles.resolveBtn, { backgroundColor: theme.colors.success }]} onPress={onResolveAll}>
            <Ionicons name="checkmark-done" size={20} color="#fff" />
            <Text style={styles.resolveBtnText}>{t('missingItemsBulkResolveBtn', { count: openCount })}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function MetaRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, accent ? { color: accent, fontWeight: '800' } : null]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  refreshBar: { paddingVertical: 4, alignItems: 'center', backgroundColor: theme.colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { color: theme.colors.textMuted, fontSize: 15 },
  backLink: { marginTop: 16 },
  backLinkText: { color: theme.colors.primary, fontWeight: '700' },
  content: { padding: theme.spacing.lg, paddingBottom: 120 },
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  countBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  heroSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  progressText: { fontSize: 12, fontWeight: '700', color: theme.colors.success, marginTop: 6 },
  statusPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusOpen: { backgroundColor: theme.colors.error + '18' },
  statusResolved: { backgroundColor: theme.colors.success + '22' },
  statusPillText: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  metaGrid: { marginTop: 14, gap: 8 },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaLabel: { width: 72, fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  metaValue: { flex: 1, fontSize: 13, color: theme.colors.text },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionHint: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 10, lineHeight: 18 },
  itemCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 52,
  },
  itemRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  itemRowDone: { backgroundColor: '#f0fdf4' },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.success,
  },
  itemLabel: { flex: 1, fontSize: 15, color: theme.colors.text, lineHeight: 22 },
  itemLabelDone: { color: theme.colors.textSecondary, textDecorationLine: 'line-through' },
  doneTag: { fontSize: 11, fontWeight: '800', color: theme.colors.success },
  emptyItems: { padding: 16, color: theme.colors.textMuted, fontSize: 14 },
  noteCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  noteText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  resolveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
