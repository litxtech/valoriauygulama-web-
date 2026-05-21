import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { loadMrzRecentDocuments, type MrzRecentDocRow } from '@/lib/loadMrzRecentDocuments';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  filterMrzArchiveRows,
  formatArchiveDayTitle,
  groupMrzDocsByCalendarDay,
  guestDisplayName,
  documentTypeLabelTr,
} from '@/lib/mrzPassportArchive';
import { formatDateShort } from '@/lib/date';

type Section = {
  key: string;
  title: string;
  data: MrzRecentDocRow[];
};

export default function StaffPassportsMrzScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<MrzRecentDocRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState('');

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

  useEffect(() => {
    if (!allowed) {
      router.replace('/staff' as never);
    }
  }, [allowed, router]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const filtered = useMemo(() => filterMrzArchiveRows(rows, search), [rows, search]);
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

  const totalShown = filtered.length;

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('staffPassportsNoAccess')}</Text>
      </View>
    );
  }

  if (loading && !rows.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('staffPassportsTitle')}</Text>
        <Text style={styles.sub}>{t('staffPassportsSubtitle')}</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} style={styles.searchIcon} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('staffPassportsSearchPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
            autoCapitalize="words"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {search.length > 0 ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        {totalShown > 0 ? (
          <Text style={styles.countLine}>{t('staffPassportsResultCount', { count: String(totalShown) })}</Text>
        ) : null}
      </View>

      {err ? <Text style={styles.warn}>{err}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />
        }
        contentContainerStyle={sections.length === 0 ? styles.listEmpty : styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyCard}>
              <Ionicons name="document-text-outline" size={40} color={theme.colors.textMuted} />
              <Text style={styles.emptyText}>
                {search.trim() ? t('staffPassportsSearchEmpty') : t('staffPassportsEmpty')}
              </Text>
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionCount}>{section.data.length}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const name = guestDisplayName(item.guest ?? null) || '—';
          const time = new Date(item.created_at).toLocaleTimeString(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <View style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowName} numberOfLines={2}>
                  {name}
                </Text>
                <View style={styles.rowMetaRow}>
                  <View style={styles.typePill}>
                    <Text style={styles.typePillText}>{documentTypeLabelTr(item.document_type)}</Text>
                  </View>
                  <Text style={styles.rowDocNo} numberOfLines={1}>
                    {item.document_number?.trim() || '—'}
                  </Text>
                </View>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {[item.nationality_code, item.expiry_date ? formatDateShort(item.expiry_date) : null]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </Text>
              </View>
              <Text style={styles.rowTime}>{time}</Text>
            </View>
          );
        }}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/staff/kbs/scan' as never)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={t('staffPassportsScanNew')}
      >
        <Ionicons name="scan-outline" size={26} color="#fff" />
        <Text style={styles.fabText}>{t('staffPassportsScanNew')}</Text>
      </TouchableOpacity>

      <View style={styles.footerHint}>
        <Ionicons name="information-circle-outline" size={16} color={theme.colors.textSecondary} />
        <Text style={styles.hintText}>{t('staffPassportsKbsHint')}</Text>
        <Text style={styles.link} onPress={() => router.push('/staff/kbs/ready' as never)}>
          {t('kbsNavReady')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  sub: { marginTop: 4, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 10,
    minHeight: 44,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, paddingVertical: 8 },
  countLine: { marginTop: 6, fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  warn: { color: '#b45309', fontWeight: '600', marginHorizontal: 16, marginBottom: 8 },
  muted: { color: theme.colors.textSecondary },
  listContent: { paddingBottom: 120, paddingHorizontal: 16 },
  listEmpty: { flexGrow: 1, paddingBottom: 120, paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: theme.colors.text },
  sectionCount: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.primary,
    backgroundColor: theme.colors.primary + '18',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginBottom: 8,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  typePill: {
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typePillText: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary },
  rowDocNo: { fontSize: 13, fontWeight: '700', color: theme.colors.text, flexShrink: 1 },
  rowSub: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  rowTime: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, fontFamily: 'monospace' },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 10,
    marginTop: 24,
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 28,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  footerHint: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  hintText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  link: { fontSize: 12, color: theme.colors.primary, fontWeight: '800' },
});
