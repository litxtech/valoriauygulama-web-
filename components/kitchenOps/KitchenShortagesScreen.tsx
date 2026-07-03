import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { MissingItemsChecklistSheet } from '@/components/MissingItemsChecklistSheet';
import { KitchenPrintBar } from '@/components/kitchenOps/KitchenPrintBar';
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
import { cacheMissingItemReport } from '@/lib/missingItemsCache';
import { formatDateShort, formatTime } from '@/lib/date';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

const AREA = 'kitchen' as const;
const ACCENT = '#E67E22';
const CARD_PREVIEW_LINES = 7;

const PRIORITY_LABEL: Record<MissingItemPriority, string> = {
  low: 'Düşük',
  medium: 'Normal',
  high: 'Acil',
};

const PRIORITY_COLOR: Record<MissingItemPriority, string> = {
  low: '#6c757d',
  medium: theme.colors.primary,
  high: theme.colors.error,
};

type TabKey = 'open' | 'resolved';

type ListEntry =
  | { kind: 'report'; data: MissingItemReportRow }
  | { kind: 'legacy'; data: MissingItemRow };

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${formatDateShort(iso)} ${formatTime(iso)}`;
}

type ShortagesCache = {
  reports: MissingItemReportRow[];
  legacy: MissingItemRow[];
};

export function KitchenShortagesScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const canEditCatalog = canManageMissingItemsCatalog(staff);
  const [tab, setTab] = useState<TabKey>('open');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (): Promise<ShortagesCache | null> => {
    const [repRes, legRes] = await Promise.all([
      listMissingItemReports(AREA, tab),
      listLegacyMissingItems(AREA, tab),
    ]);
    if (repRes.error) Alert.alert('Hata', repRes.error);
    if (legRes.error) Alert.alert('Hata', legRes.error);
    return { reports: repRes.data, legacy: legRes.data };
  }, [tab]);

  const { data, loading, refreshing, refresh, reload } = useCachedFocusLoad<ShortagesCache>({
    cacheKey: `kitchen-shortages:${tab}`,
    fetchData,
  });

  const reports = data?.reports ?? [];
  const legacy = data?.legacy ?? [];

  const entries = useMemo((): ListEntry[] => {
    const reportEntries: ListEntry[] = reports.map((r) => ({ kind: 'report' as const, data: r }));
    const legacyEntries: ListEntry[] = legacy.map((l) => ({ kind: 'legacy' as const, data: l }));
    return [...reportEntries, ...legacyEntries];
  }, [reports, legacy]);

  const onRefresh = () => {
    refresh();
  };

  const onSubmitReport = async (payload: {
    items: { key?: string; label: string }[];
    note?: string;
    priority: MissingItemPriority;
  }) => {
    setSaving(true);
    const result = await createMissingItemReport({ area: AREA, ...payload });
    setSaving(false);
    if (result.error && !isMissingReportNotifyOnlyError(result.error)) {
      Alert.alert('Hata', result.error);
      return;
    }
    setSheetVisible(false);
    setTab('open');
    void reload();
    if (isMissingReportNotifyOnlyError(result.error)) {
      Alert.alert('Eksik listesi onaylandı', 'Kayıt alındı. Anlık bildirim gönderilemedi; ekip uygulama içinden görebilir.');
    } else {
      Alert.alert(
        'Eksik listesi onaylandı',
        `${payload.items.length} kalem kaydedildi. Mutfak ekibi ve yöneticilere bildirim gönderildi.`
      );
    }
  };

  const onResolveReport = (id: string, itemCount: number) => {
    Alert.alert('Tümünü giderildi işaretle', `${itemCount} kalemlik eksik listesi kapatılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Giderildi',
        onPress: async () => {
          const result = await resolveMissingItemReport(id);
          if (result.error) Alert.alert('Hata', result.error);
          else void reload();
        },
      },
    ]);
  };

  const openReportDetail = (item: MissingItemReportRow) => {
    cacheMissingItemReport(item);
    router.push(`/staff/kitchen-ops/shortages/report/${item.id}` as never);
  };

  const renderReportCard = (item: MissingItemReportRow) => {
    const lines = item.items ?? [];
    const preview = lines.slice(0, CARD_PREVIEW_LINES);
    const hiddenCount = Math.max(0, lines.length - preview.length);
    const notePreview =
      item.note && item.note.length > 80 ? `${item.note.slice(0, 80).trim()}…` : item.note;

    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => openReportDetail(item)}>
          <View style={styles.cardHeader}>
            <View style={[styles.countBadge, { backgroundColor: ACCENT }]}>
              <Text style={styles.countBadgeText}>{item.item_count}</Text>
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.cardTitle}>{item.item_count} eksik kalem</Text>
              <View style={styles.metaRow}>
                <View style={[styles.priorityPill, { borderColor: PRIORITY_COLOR[item.priority] }]}>
                  <Text style={[styles.priorityText, { color: PRIORITY_COLOR[item.priority] }]}>
                    {PRIORITY_LABEL[item.priority]}
                  </Text>
                </View>
                <Text style={styles.metaText}>{formatWhen(item.created_at)}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </View>

          <View style={styles.itemList}>
            {preview.map((line, idx) => (
              <View key={line.id ?? `${item.id}-${idx}`} style={styles.itemRow}>
                <View style={[styles.bullet, line.status === 'resolved' && styles.bulletDone]} />
                <Text
                  style={[styles.itemLabel, line.status === 'resolved' && styles.itemLabelDone]}
                  numberOfLines={2}
                >
                  {line.title}
                </Text>
              </View>
            ))}
          </View>

          {hiddenCount > 0 ? (
            <Text style={styles.moreHint}>+{hiddenCount} kalem daha — detay için dokunun</Text>
          ) : null}

          {notePreview ? <Text style={styles.noteText}>Not: {notePreview}</Text> : null}

          <Text style={styles.footerMeta}>
            Bildiren: {item.creator?.full_name ?? '—'}
            {item.status === 'resolved' ? ' · Giderildi' : ''}
          </Text>
        </TouchableOpacity>

        {item.status === 'open' ? (
          <TouchableOpacity
            style={styles.resolveBtn}
            onPress={() => onResolveReport(item.id, item.item_count)}
          >
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.resolveBtnText}>Tümünü giderildi</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderLegacyCard = (item: MissingItemRow) => (
    <View style={styles.card}>
      <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/staff/missing-items/legacy/${item.id}` as never)}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.metaText}>{formatWhen(item.created_at)} · Eski kayıt</Text>
      </TouchableOpacity>
      {item.status === 'open' ? (
        <TouchableOpacity style={styles.resolveBtn} onPress={() => resolveLegacyMissingItem(item.id).then(() => reload())}>
          <Text style={styles.resolveBtnText}>Giderildi</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const printKinds = useMemo(
    () => [
      { kind: 'shortages_open' as const, label: 'Açık eksik listesi' },
      { kind: 'shortages_resolved' as const, label: 'Giderilen eksikler' },
    ],
    []
  );

  return (
    <View style={styles.screen}>
      <View style={styles.printWrap}>
        <KitchenPrintBar kinds={printKinds} compact sectionLabel="Mutfak" />
      </View>

      <View style={styles.banner}>
        <Ionicons name="clipboard-outline" size={20} color={ACCENT} />
        <Text style={styles.bannerText}>Mutfak gezinti eksik listesi — onaylayınca ekibe bildirilir</Text>
        {canEditCatalog ? (
          <TouchableOpacity
            style={styles.editListBtn}
            onPress={() => router.push('/staff/missing-items/catalog/kitchen' as never)}
            activeOpacity={0.8}
          >
            <Ionicons name="create-outline" size={16} color={ACCENT} />
            <Text style={styles.editListBtnText}>Listeyi düzenle</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'open' && styles.tabBtnActive]}
          onPress={() => setTab('open')}
        >
          <Text style={[styles.tabText, tab === 'open' && styles.tabTextActive]}>Açık eksikler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'resolved' && styles.tabBtnActive]}
          onPress={() => setTab('resolved')}
        >
          <Text style={[styles.tabText, tab === 'resolved' && styles.tabTextActive]}>Giderilen</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => (e.kind === 'report' ? `r-${e.data.id}` : `l-${e.data.id}`)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="checkmark-done-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {loading ? 'Yükleniyor…' : tab === 'open' ? 'Açık eksik yok' : 'Giderilmiş kayıt yok'}
            </Text>
            <Text style={styles.emptySub}>
              {tab === 'open'
                ? 'Mutfakta eksik gördüğünüzde alttaki butonla liste oluşturun.'
                : 'Giderilen eksik listeleri burada görünür.'}
            </Text>
          </View>
        }
        renderItem={({ item: entry }) =>
          entry.kind === 'report' ? renderReportCard(entry.data) : renderLegacyCard(entry.data)
        }
      />

      {tab === 'open' ? (
        <TouchableOpacity style={styles.fab} onPress={() => setSheetVisible(true)} activeOpacity={0.9}>
          <Ionicons name="add" size={26} color="#fff" />
          <Text style={styles.fabText}>Eksik Gir & Onayla</Text>
        </TouchableOpacity>
      ) : null}

      <MissingItemsChecklistSheet
        visible={sheetVisible}
        area={AREA}
        saving={saving}
        onClose={() => setSheetVisible(false)}
        onSubmit={onSubmitReport}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  printWrap: { paddingHorizontal: 16, paddingTop: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    flexWrap: 'wrap',
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#9a3412', minWidth: 160 },
  editListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: '#fff',
  },
  editListBtnText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  tabBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  tabText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  tabTextActive: { color: '#fff' },
  listContent: { paddingHorizontal: 16, paddingBottom: 100, flexGrow: 1 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  countBadge: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cardHeaderText: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  priorityPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  priorityText: { fontSize: 11, fontWeight: '700' },
  metaText: { fontSize: 12, color: theme.colors.textMuted },
  itemList: { marginTop: 12, gap: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT, marginTop: 6 },
  bulletDone: { backgroundColor: theme.colors.success },
  itemLabel: { flex: 1, fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  itemLabelDone: { textDecorationLine: 'line-through', color: theme.colors.textMuted },
  moreHint: { fontSize: 12, color: ACCENT, fontWeight: '600', marginTop: 8 },
  noteText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 8, fontStyle: 'italic' },
  footerMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.success,
  },
  resolveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  emptyBox: { alignItems: 'center', marginTop: 48, padding: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginTop: 12 },
  emptySub: { fontSize: 14, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    ...theme.shadows.md,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
