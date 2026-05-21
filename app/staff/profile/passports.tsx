import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useHeaderHeight } from '@react-navigation/elements';
import { theme } from '@/constants/theme';
import { loadMrzRecentDocuments, type MrzRecentDocRow } from '@/lib/loadMrzRecentDocuments';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  filterMrzArchiveByPeriod,
  filterMrzArchiveRows,
  formatArchiveDayTitle,
  groupMrzDocsByCalendarDay,
  guestDisplayName,
  documentTypeLabelTr,
  scanStatusLabelTr,
  scanStatusColor,
  type MrzArchivePeriod,
} from '@/lib/mrzPassportArchive';
import { deleteMrzArchiveRecord } from '@/lib/mrzPassportArchiveActions';
import { formatDateShort } from '@/lib/date';
import { SwipeToDelete } from '@/components/SwipeToDelete';
import { MrzPassportNotifySheet } from '@/components/mrz/MrzPassportNotifySheet';
import { MrzPassportDetailSheet } from '@/components/mrz/MrzPassportDetailSheet';

const HERO: [string, string] = ['#78350f', '#d97706'];

type Section = { key: string; title: string; data: MrzRecentDocRow[] };

const PERIOD_OPTIONS: { id: MrzArchivePeriod; labelKey: string }[] = [
  { id: 'all', labelKey: 'staffPassportsPeriodAll' },
  { id: 'today', labelKey: 'staffPassportsPeriodToday' },
  { id: 'week', labelKey: 'staffPassportsPeriodWeek' },
];

export default function StaffPassportsMrzScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const headerHeight = useHeaderHeight();
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<MrzRecentDocRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<MrzArchivePeriod>('all');
  const [notifyRow, setNotifyRow] = useState<MrzRecentDocRow | null>(null);
  const [detailRow, setDetailRow] = useState<MrzRecentDocRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const allowed = canStaffUseMrzScan(staff);

  const load = useCallback(
    async (isRefresh: boolean) => {
      if (!allowed) return;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setErr(null);
      try {
        const res = await loadMrzRecentDocuments();
        if (!res.ok) {
          setErr(res.code === 'NO_APP_USER' ? t('staffPassportsNoAppUser') : res.message || t('unknownError'));
          setRows([]);
          return;
        }
        setRows(res.data);
      } catch (e) {
        const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
        const unreachable =
          m.includes('connection refused') ||
          m.includes('network request failed') ||
          m.includes('failed to connect');
        setErr(unreachable ? t('staffPassportsGatewayDown') : e instanceof Error ? e.message : t('unknownError'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [allowed, t]
  );

  useFocusEffect(
    useCallback(() => {
      if (!allowed) {
        router.replace('/staff' as never);
        return;
      }
      void load(false);
    }, [allowed, load, router])
  );

  const filtered = useMemo(() => {
    const byPeriod = filterMrzArchiveByPeriod(rows, period);
    return filterMrzArchiveRows(byPeriod, search, (r) => r.guest?.birth_date);
  }, [rows, search, period]);

  const grouped = useMemo(() => groupMrzDocsByCalendarDay(filtered), [filtered]);

  const sections: Section[] = useMemo(
    () =>
      grouped.map((g) => ({
        key: g.dayKey,
        title: formatArchiveDayTitle(g, t, i18n.language),
        data: g.items,
      })),
    [grouped, t, i18n.language]
  );

  const confirmDelete = (row: MrzRecentDocRow) => {
    const name = guestDisplayName(row.guest ?? null) || row.document_number || '—';
    Alert.alert(t('staffPassportsDeleteTitle'), t('staffPassportsDeleteBody', { name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => void doDelete(row),
      },
    ]);
  };

  const doDelete = async (row: MrzRecentDocRow) => {
    setDeletingId(row.id);
    const res = await deleteMrzArchiveRecord(row);
    setDeletingId(null);
    if (!res.ok) Alert.alert(t('error'), res.message);
    else setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.muted}>{t('staffPassportsNoAccess')}</Text>
      </View>
    );
  }

  if (loading && !rows.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#d97706" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <LinearGradient colors={HERO} style={[styles.hero, { paddingTop: headerHeight }]}>
        <View style={styles.heroRow}>
          <View style={styles.heroIcon}>
            <Ionicons name="id-card" size={22} color="#fff" />
          </View>
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>{t('staffPassportsTitle')}</Text>
            <Text style={styles.heroSub} numberOfLines={2}>
              {t('staffPassportsSubtitle')}
            </Text>
          </View>
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.85)" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('staffPassportsSearchPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={styles.searchInput}
            autoCapitalize="words"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.9)" />
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>

      <View style={styles.toolbar}>
        <View style={styles.periodRow}>
          {PERIOD_OPTIONS.map((opt) => (
            <Pressable
              key={opt.id}
              style={[styles.periodChip, period === opt.id && styles.periodChipOn]}
              onPress={() => setPeriod(opt.id)}
            >
              <Text style={[styles.periodChipText, period === opt.id && styles.periodChipTextOn]}>
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
        {filtered.length > 0 ? (
          <Text style={styles.countLine}>{t('staffPassportsResultCount', { count: String(filtered.length) })}</Text>
        ) : null}
      </View>

      {err ? (
        <View style={styles.warnBox}>
          <Ionicons name="warning-outline" size={18} color="#b45309" />
          <Text style={styles.warn}>{err}</Text>
        </View>
      ) : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#d97706" />
        }
        contentContainerStyle={sections.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={44} color="#d97706" />
              <Text style={styles.emptyTitle}>
                {search.trim() || period !== 'all' ? t('staffPassportsSearchEmpty') : t('staffPassportsEmpty')}
              </Text>
              <Pressable style={styles.emptyBtn} onPress={() => router.push('/staff/kbs/scan' as never)}>
                <Text style={styles.emptyBtnText}>{t('staffPassportsScanNew')}</Text>
              </Pressable>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={16} color="#b45309" />
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionBadgeText}>{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => {
          const name = guestDisplayName(item.guest ?? null) || '—';
          const birth = item.guest?.birth_date ? formatDateShort(item.guest.birth_date) : null;
          const time = new Date(item.created_at).toLocaleTimeString(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          });
          const statusColor = scanStatusColor(item.scan_status);
          const isDeleting = deletingId === item.id;

          return (
            <SwipeToDelete enabled={!isDeleting} onSwipeDelete={() => confirmDelete(item)}>
              <View style={styles.card}>
                <Pressable
                  style={styles.cardBody}
                  onPress={() => setDetailRow(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t('staffPassportsDetailTitle')}
                >
                  <View style={styles.cardTop}>
                    <View style={[styles.typeIcon, { backgroundColor: statusColor + '18' }]}>
                      <Ionicons
                        name={item.document_type === 'passport' ? 'book-outline' : 'card-outline'}
                        size={20}
                        color={statusColor}
                      />
                    </View>
                    <View style={styles.cardMain}>
                      <Text style={styles.cardName} numberOfLines={2}>
                        {name}
                      </Text>
                      <Text style={styles.cardDoc} numberOfLines={1}>
                        {documentTypeLabelTr(item.document_type)} · {item.document_number?.trim() || '—'}
                      </Text>
                      {birth ? (
                        <Text style={styles.cardBirth}>
                          {t('staffPassportsBirthDate')}: {birth}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.cardTopEnd}>
                      <Text style={styles.cardTime}>{time}</Text>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </View>
                  </View>

                  <View style={styles.cardMeta}>
                    <View style={[styles.statusPill, { backgroundColor: statusColor + '16' }]}>
                      <Text style={[styles.statusText, { color: statusColor }]}>
                        {scanStatusLabelTr(item.scan_status)}
                      </Text>
                    </View>
                    {item.nationality_code ? (
                      <Text style={styles.natText}>{item.nationality_code}</Text>
                    ) : null}
                  </View>
                </Pressable>

                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.notifyBtn}
                    onPress={() => setNotifyRow(item)}
                    disabled={item.scan_status === 'submitted'}
                  >
                    <Ionicons name="paper-plane-outline" size={16} color="#fff" />
                    <Text style={styles.notifyBtnText}>{t('kbsNotifyTitle')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.editBtn}
                    onPress={() => setNotifyRow(item)}
                  >
                    <Ionicons name="create-outline" size={16} color="#b45309" />
                    <Text style={styles.editBtnText}>{t('edit')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.delBtn}
                    onPress={() => confirmDelete(item)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#dc2626" />
                    ) : (
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    )}
                  </Pressable>
                </View>
              </View>
            </SwipeToDelete>
          );
        }}
      />

      <Pressable
        style={styles.fab}
        onPress={() => router.push('/staff/kbs/scan' as never)}
        accessibilityRole="button"
        accessibilityLabel={t('staffPassportsScanNew')}
      >
        <Ionicons name="scan-outline" size={24} color="#fff" />
        <Text style={styles.fabText}>{t('staffPassportsScanNew')}</Text>
      </Pressable>

      <MrzPassportDetailSheet
        visible={detailRow != null}
        row={detailRow}
        onClose={() => setDetailRow(null)}
        onEdit={
          detailRow
            ? () => {
                const row = detailRow;
                setDetailRow(null);
                setNotifyRow(row);
              }
            : undefined
        }
      />

      <MrzPassportNotifySheet
        visible={notifyRow != null}
        row={notifyRow}
        onClose={() => setNotifyRow(null)}
        onDone={() => void load(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fffbeb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  hero: { paddingHorizontal: 16, paddingBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  heroSub: { fontSize: 11, color: 'rgba(255,255,255,0.9)', marginTop: 2, lineHeight: 15 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#fff', paddingVertical: 8 },
  toolbar: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  periodRow: { flexDirection: 'row', gap: 8 },
  periodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  periodChipOn: { backgroundColor: '#fef3c7', borderColor: '#f59e0b' },
  periodChipText: { fontSize: 13, fontWeight: '700', color: theme.colors.textSecondary },
  periodChipTextOn: { color: '#b45309' },
  countLine: { marginTop: 8, fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  warnBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#fff7ed',
  },
  warn: { flex: 1, color: '#b45309', fontWeight: '600', fontSize: 13 },
  muted: { color: theme.colors.textSecondary, textAlign: 'center' },
  listContent: { paddingBottom: 100, paddingHorizontal: 16 },
  listEmpty: { flexGrow: 1, paddingBottom: 100, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#fffbeb',
  },
  sectionTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: '#78350f' },
  sectionBadge: {
    backgroundColor: '#fde68a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  sectionBadgeText: { fontSize: 12, fontWeight: '800', color: '#b45309' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
    marginBottom: 10,
    shadowColor: '#78350f',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardBody: { marginBottom: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTopEnd: { alignItems: 'flex-end', gap: 4 },
  typeIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardMain: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  cardDoc: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 4 },
  cardBirth: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2, fontWeight: '600' },
  cardTime: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '800' },
  natText: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  notifyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#d97706',
    paddingVertical: 10,
    borderRadius: 12,
  },
  notifyBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  editBtnText: { color: '#b45309', fontWeight: '800', fontSize: 13 },
  delBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 36,
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 12,
    marginTop: 24,
  },
  emptyTitle: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 15, lineHeight: 22 },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: '#d97706',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#78350f',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
