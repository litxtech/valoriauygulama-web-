import { useCallback, useMemo, useState } from 'react';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { MissingItemsChecklistSheet } from '@/components/MissingItemsChecklistSheet';
import {
  createMissingItemReport,
  isMissingReportNotifyOnlyError,
  listLegacyMissingItems,
  listMissingItemReports,
  resolveLegacyMissingItem,
  resolveMissingItemReport,
  type MissingItemPriority,
  type MissingItemReportRow,
  type MissingItemRow,
} from '@/lib/missingItems';
import { useAuthStore } from '@/stores/authStore';
import { canManageMissingItemsCatalog } from '@/lib/staffPermissions';
import { getMissingAreaMeta, type MissingItemArea } from '@/lib/missingItemsCatalog';
import { cacheMissingItemReport } from '@/lib/missingItemsCache';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
import type { KitchenPrintReportKind } from '@/lib/kitchenOps/kitchenPrintReports';

type TabKey = 'open' | 'resolved';

/** Kart önizlemesinde gösterilecek maksimum kalem satırı */
const CARD_PREVIEW_LINES = 7;

const PRIORITY_COLOR: Record<MissingItemPriority, string> = {
  low: '#6c757d',
  medium: theme.colors.primary,
  high: theme.colors.error,
};

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(locale, {
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

function parseArea(raw: string | string[] | undefined): MissingItemArea | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'kitchen' || v === 'hotel') return v;
  return null;
}

type ListEntry =
  | { kind: 'report'; data: MissingItemReportRow }
  | { kind: 'legacy'; data: MissingItemRow };

type AreaListCache = { reports: MissingItemReportRow[]; legacy: MissingItemRow[] };

export default function MissingItemsAreaScreen() {
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
  const { staff } = useAuthStore();
  const canEditCatalog = canManageMissingItemsCatalog(staff);
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const fabBottom = theme.spacing.lg + getEffectiveBottomInset(insets);
  const listBottomPad = fabBottom + 56;
  const missingBase = pathname?.startsWith('/admin') ? '/admin/missing-items' : '/staff/missing-items';
  const { area: areaParam } = useLocalSearchParams<{ area: string }>();
  const area = parseArea(areaParam);

  const [tab, setTab] = useState<TabKey>('open');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const meta = area ? getMissingAreaMeta(area) : null;

  const printKinds = useMemo((): { kind: KitchenPrintReportKind; label: string }[] => {
    if (!area) return [];
    if (area === 'hotel') {
      return [
        { kind: 'hotel_shortages_open', label: t('missingItemsPrintOpen') },
        { kind: 'hotel_shortages_resolved', label: t('missingItemsPrintResolved') },
      ];
    }
    return [
      { kind: 'shortages_open', label: t('missingItemsPrintOpen') },
      { kind: 'shortages_resolved', label: t('missingItemsPrintResolved') },
    ];
  }, [area, t, i18n.language]);

  const printSectionLabel = area === 'hotel' ? t('missingItemsPrintSectionHotel') : t('missingItemsPrintSectionKitchen');

  const fetchData = useCallback(async (): Promise<AreaListCache | null> => {
    if (!area) return null;
    const [repRes, legRes] = await Promise.all([
      listMissingItemReports(area, tab),
      listLegacyMissingItems(area, tab),
    ]);
    if (repRes.error) Alert.alert(t('error'), repRes.error);
    if (legRes.error) Alert.alert(t('error'), legRes.error);
    return { reports: repRes.data ?? [], legacy: legRes.data ?? [] };
  }, [area, tab, t]);

  const {
    data,
    loading,
    refreshing,
    refresh,
    reload,
  } = useCachedFocusLoad<AreaListCache>({
    cacheKey: area ? `missing-items:${area}:${tab}` : 'missing-items:none',
    enabled: !!area,
    fetchData,
  });

  const reports = data?.reports ?? [];
  const legacy = data?.legacy ?? [];

  const entries = useMemo((): ListEntry[] => {
    const reportEntries: ListEntry[] = reports.map((r) => ({ kind: 'report' as const, data: r }));
    const legacyEntries: ListEntry[] = legacy.map((l) => ({ kind: 'legacy' as const, data: l }));
    return [...reportEntries, ...legacyEntries];
  }, [reports, legacy]);

  const onSubmitReport = async (payload: {
    items: { key?: string; label: string }[];
    note?: string;
    priority: MissingItemPriority;
  }) => {
    if (!area) return;
    setSaving(true);
    const result = await createMissingItemReport({ area, ...payload });
    setSaving(false);
    if (result.error && !isMissingReportNotifyOnlyError(result.error)) {
      Alert.alert(t('error'), result.error);
      return;
    }
    setSheetVisible(false);
    setTab('open');
    void reload();
    if (isMissingReportNotifyOnlyError(result.error)) {
      Alert.alert(t('missingItemsSubmitSuccess'), t('missingItemsSubmitNotifyWarning'));
    } else {
      Alert.alert(t('missingItemsSubmitSuccess'), t('missingItemsSubmitSuccessBody', { count: payload.items.length }));
    }
  };

  const onResolveReport = (id: string, itemCount: number) => {
    Alert.alert(t('missingItemsResolveAllTitle'), t('missingItemsResolveAllReportBody', { count: itemCount }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('missingItemsResolved'),
        onPress: async () => {
          const result = await resolveMissingItemReport(id);
          if (result.error) Alert.alert(t('error'), result.error);
          else void reload();
        },
      },
    ]);
  };

  const onResolveLegacy = (id: string) => {
    Alert.alert(t('missingItemsResolveOneTitle'), t('missingItemsResolveOneBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('missingItemsResolved'),
        onPress: async () => {
          const result = await resolveLegacyMissingItem(id);
          if (result.error) Alert.alert(t('error'), result.error);
          else void reload();
        },
      },
    ]);
  };

  if (!area || !meta) {
    return (
      <View style={styles.invalid}>
        <Text style={styles.invalidText}>{t('missingItemsInvalidArea')}</Text>
      </View>
    );
  }

  const openReportDetail = (item: MissingItemReportRow) => {
    cacheMissingItemReport(item);
    router.push(`${missingBase}/report/${item.id}` as never);
  };

  const openLegacyDetail = (legacyId: string) => {
    router.push(`${missingBase}/legacy/${legacyId}` as never);
  };

  const renderReportCard = (item: MissingItemReportRow) => {
    const lines = item.items ?? [];
    const preview = lines.slice(0, CARD_PREVIEW_LINES);
    const hiddenCount = Math.max(0, lines.length - preview.length);
    const resolvedCount = lines.filter((i) => i.status === 'resolved').length;
    const notePreview =
      item.note && item.note.length > 80 ? `${item.note.slice(0, 80).trim()}…` : item.note;

    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => openReportDetail(item)}>
          <View style={styles.cardHeader}>
            <View style={[styles.countBadge, { backgroundColor: meta.color }]}>
              <Text style={styles.countBadgeText}>{item.item_count}</Text>
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{t('missingItemsReportItemsCount', { count: item.item_count })}</Text>
              {item.status === 'open' && resolvedCount > 0 ? (
                <Text style={styles.progressMini}>
                  {t('missingItemsFulfilledProgress', { resolved: resolvedCount, total: item.item_count })}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                <View style={[styles.priorityPill, { borderColor: PRIORITY_COLOR[item.priority] }]}>
                  <Text style={[styles.priorityText, { color: PRIORITY_COLOR[item.priority] }]}>
                    {priorityLabel[item.priority]}
                  </Text>
                </View>
                <Text style={styles.metaText}>{formatDateTime(item.created_at, dateLocale)}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </View>

          <View style={styles.itemList}>
            {preview.map((line, idx) => {
              const done = line.status === 'resolved';
              return (
                <View key={line.id ?? `${item.id}-${idx}`} style={styles.itemRow}>
                  <View style={[styles.miniCheck, done && styles.miniCheckDone]}>
                    {done ? <Ionicons name="checkmark" size={10} color="#fff" /> : null}
                  </View>
                  <Text style={[styles.itemLabel, done && styles.itemLabelDone]} numberOfLines={2}>
                    {line.title}
                  </Text>
                </View>
              );
            })}
          </View>

          {hiddenCount > 0 ? (
            <View style={[styles.seeAllBtn, { borderColor: meta.color + '55' }]}>
              <Text style={[styles.seeAllBtnText, { color: meta.color }]}>
                {t('missingItemsSeeAllMore', { count: hiddenCount })}
              </Text>
              <Ionicons name="arrow-forward" size={16} color={meta.color} />
            </View>
          ) : null}

          {notePreview ? <Text style={styles.noteText}>{t('missingItemsNotePrefix')} {notePreview}</Text> : null}

          <Text style={styles.footerMeta}>
            {t('missingItemsReporter', { name: item.creator?.full_name || '—' })}
            {item.status === 'resolved' ? t('missingItemsResolvedSuffix') : ''}
          </Text>
        </TouchableOpacity>

        {item.status === 'open' ? (
          <TouchableOpacity
            style={[styles.resolveBtn, { backgroundColor: theme.colors.success }]}
            onPress={() => onResolveReport(item.id, item.item_count)}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.resolveBtnText}>{t('missingItemsMarkAllResolvedBtn')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderLegacyCard = (item: MissingItemRow) => (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => openLegacyDetail(item.id)}>
        <View style={styles.cardHeader}>
          <View style={[styles.countBadge, { backgroundColor: theme.colors.textMuted }]}>
            <Text style={styles.countBadgeText}>1</Text>
          </View>
          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.metaText}>{formatDateTime(item.created_at, dateLocale)} · {t('missingItemsLegacyRecord')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
        </View>
        {item.description ? (
          <Text style={styles.noteText} numberOfLines={3}>
            {item.description}
          </Text>
        ) : null}
        <Text style={styles.tapHint}>{t('missingItemsTapDetail')}</Text>
      </TouchableOpacity>
      {item.status === 'open' ? (
        <TouchableOpacity style={styles.resolveBtn} onPress={() => onResolveLegacy(item.id)}>
          <Text style={styles.resolveBtnText}>{t('missingItemsResolved')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {printKinds.length > 0 ? (
        <View style={styles.printWrap}>
          <KitchenPrintBar kinds={printKinds} compact sectionLabel={printSectionLabel} />
        </View>
      ) : null}

      <View style={[styles.areaBanner, { backgroundColor: meta.color + '14' }]}>
        <Ionicons name={meta.icon as keyof typeof Ionicons.glyphMap} size={20} color={meta.color} />
        <Text style={[styles.areaBannerText, { color: meta.color }]}>{t('missingItemsAreaShortages', { area: meta.title })}</Text>
        {canEditCatalog ? (
          <TouchableOpacity
            style={[styles.editListBtn, { borderColor: meta.color }]}
            onPress={() => router.push(`${missingBase}/catalog/${area}` as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={16} color={meta.color} />
            <Text style={[styles.editListBtnText, { color: meta.color }]}>{t('missingItemsEditList')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'open' && { backgroundColor: meta.color }]} onPress={() => setTab('open')}>
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>{t('missingItemsTabHasMissing')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'resolved' && { backgroundColor: meta.color }]}
          onPress={() => setTab('resolved')}
        >
          <Text style={[styles.tabText, tab === 'resolved' && styles.tabTextActive]}>{t('missingItemsResolved')}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => (e.kind === 'report' ? `r-${e.data.id}` : `l-${e.data.id}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={meta.color} />}
        contentContainerStyle={[styles.listContent, { paddingBottom: listBottomPad }]}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {loading ? t('loading') : tab === 'open' ? t('missingItemsEmptyOpen') : t('missingItemsEmptyResolved')}
            </Text>
            <Text style={styles.emptySub}>
              {tab === 'open' ? t('missingItemsEmptyOpenHint') : t('missingItemsEmptyResolvedHint')}
            </Text>
          </View>
        }
        renderItem={({ item: entry }) =>
          entry.kind === 'report' ? renderReportCard(entry.data) : renderLegacyCard(entry.data)
        }
      />

      {tab === 'open' ? (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: meta.color, bottom: fabBottom }]}
          onPress={() => setSheetVisible(true)}
          activeOpacity={0.9}
        >
          <Ionicons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>{t('missingItemsReportFab')}</Text>
        </TouchableOpacity>
      ) : null}

      <MissingItemsChecklistSheet
        visible={sheetVisible}
        area={area}
        saving={saving}
        onClose={() => setSheetVisible(false)}
        onSubmit={onSubmitReport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  printWrap: { paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  invalid: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  invalidText: { color: theme.colors.textMuted },
  areaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    flexWrap: 'wrap',
  },
  areaBannerText: { fontSize: 14, fontWeight: '800', flex: 1, minWidth: 120 },
  editListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    backgroundColor: theme.colors.surface,
  },
  editListBtnText: { fontSize: 12, fontWeight: '800' },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tabBtn: {
    flex: 1,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.borderLight,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  listContent: { padding: theme.spacing.lg },
  emptyBox: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  emptySub: { fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  countBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  priorityPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  metaText: { fontSize: 12, color: theme.colors.textMuted },
  itemList: { marginTop: 12, gap: 6, paddingLeft: 4 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniCheck: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCheckDone: { borderColor: theme.colors.success, backgroundColor: theme.colors.success },
  itemLabel: { fontSize: 14, color: theme.colors.text, flex: 1 },
  itemLabelDone: { color: theme.colors.textMuted, textDecorationLine: 'line-through' },
  progressMini: { fontSize: 11, fontWeight: '700', color: theme.colors.success, marginTop: 2 },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  seeAllBtnText: { fontSize: 13, fontWeight: '800' },
  tapHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8, fontWeight: '600' },
  noteText: {
    marginTop: 10,
    fontSize: 13,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  footerMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 12 },
  resolveBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    backgroundColor: theme.colors.success,
  },
  resolveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: theme.spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 999,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
