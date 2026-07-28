import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { type DepartmentLeaderboardRow } from '@/lib/audit';
import {
  acknowledgePerformanceNotice,
  fetchMonthlyReportData,
  fetchPerformanceDashboard,
} from '@/lib/performanceDashboard';
import { exportAuditMonthlyReportPdf } from '@/lib/auditMonthlyReportPdf';
import { monthKey } from '@/lib/financeLedger';
import { monthName } from '@/lib/i18nLookup';
import { canAccessAdminShell } from '@/lib/staffPermissions';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';
import { performanceTheme } from '@/components/performance';
import {
  PerformanceHeroCard,
  PerformanceAlertBanner,
  PerformanceDeptLeaderboard,
  PerformanceNoticeCard,
  PerformanceLinkCard,
  PerformanceSectionTitle,
} from '@/components/performance/PerformancePremiumUi';
import { fetchStaffPerfEvents, type StaffPerfEvent } from '@/lib/staffPerfSystem';
import { getPerfBand } from '@/lib/staffPerfBands';
import { supabase } from '@/lib/supabase';

type PerfScreenData = {
  dash: Awaited<ReturnType<typeof fetchPerformanceDashboard>>['data'];
  events: StaffPerfEvent[];
  performanceScore: number | null;
};

export default function PerformanceDashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [ackId, setAckId] = useState<string | null>(null);

  const fetchData = useCallback(async (): Promise<PerfScreenData | null> => {
    if (!staff?.id) return null;
    const [{ data, error }, eventsRes, scoreRes] = await Promise.all([
      fetchPerformanceDashboard(staff.id),
      fetchStaffPerfEvents(staff.id, 30),
      supabase.from('staff').select('performance_score').eq('id', staff.id).maybeSingle(),
    ]);
    if (error) Alert.alert(t('perfLoadFailed'), error);
    return {
      dash: data,
      events: eventsRes.data,
      performanceScore:
        scoreRes.data?.performance_score != null
          ? Number(scoreRes.data.performance_score)
          : data?.evaluation_combined ?? null,
    };
  }, [staff?.id, t]);

  const { data: pack, loading, refreshing, refresh, reload, showContent } = useCachedFocusLoad({
    cacheKey: staff?.id ? `staff-performance-dash-v2:${staff.id}` : 'staff-performance-dash-v2:none',
    enabled: !!staff?.id,
    fetchData,
  });

  const dash = pack?.dash ?? null;
  const events = pack?.events ?? [];
  const singleScore = pack?.performanceScore ?? dash?.evaluation_combined ?? null;
  const band = getPerfBand(singleScore ?? 100);

  const isAdmin = canAccessAdminShell(staff);
  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const load = reload;

  const onRefresh = () => {
    void refresh();
  };

  const onAck = async (noticeId: string) => {
    setAckId(noticeId);
    const { error } = await acknowledgePerformanceNotice(noticeId);
    setAckId(null);
    if (error) Alert.alert(t('error'), error);
    else await load();
  };

  const exportPdf = async () => {
    if (!orgId) {
      Alert.alert('PDF', t('perfOrgRequired'));
      return;
    }
    setPdfLoading(true);
    try {
      const { data, error } = await fetchMonthlyReportData(orgId, monthKey());
      if (error || !data) throw new Error(error ?? t('perfReportDataFailed'));
      await exportAuditMonthlyReportPdf(data);
    } catch (e) {
      Alert.alert('PDF', (e as Error).message);
    } finally {
      setPdfLoading(false);
    }
  };

  const departments: DepartmentLeaderboardRow[] = dash?.department_leaderboard?.departments ?? [];
  const threshold = dash?.threshold_score ?? 70;
  const dateLoc = i18n.language?.startsWith('ar')
    ? 'ar-SA'
    : i18n.language?.startsWith('tr')
      ? 'tr-TR'
      : 'en-US';
  const currentMonthLabel = useMemo(() => {
    const [y, m] = monthKey().split('-').map((x) => parseInt(x, 10));
    if (!y || !m) return monthKey();
    return `${monthName(m - 1)} ${y}`;
  }, [i18n.language]);

  const updatedLabel = dash?.evaluation_combined_updated_at
    ? t('perfUpdated', {
        date: new Date(dash.evaluation_combined_updated_at).toLocaleDateString(dateLoc, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        }),
      })
    : null;

  const belowThreshold = (singleScore ?? 100) < threshold;
  const thresholdLabel = t('perfThreshold', {
    score: threshold,
    status: belowThreshold ? t('perfThresholdBelow') : t('perfThresholdOk'),
  });

  const linkCards = useMemo(() => {
    const cards: {
      key: string;
      icon: 'analytics-outline' | 'ribbon-outline' | 'clipboard-outline' | 'document-outline';
      title: string;
      subtitle: string;
      colors: [string, string];
      onPress: () => void;
      disabled?: boolean;
    }[] = [
      {
        key: 'eval',
        icon: 'analytics-outline',
        title: t('perfEvalCenter'),
        subtitle: t('perfEvalCenterSub'),
        colors: ['#6366F1', '#8B5CF6'],
        onPress: () => router.push('/staff/evaluation'),
      },
    ];
    if (isAdmin) {
      cards.push(
        {
          key: 'staff_perf',
          icon: 'ribbon-outline',
          title: t('staffPerfSystemTitle'),
          subtitle: t('staffPerfSystemSub'),
          colors: ['#0f3d3a', '#1a6b64'],
          onPress: () => router.push('/admin/staff-perf' as Href),
        },
        {
          key: 'audit',
          icon: 'clipboard-outline',
          title: t('perfAuditBoard'),
          subtitle: t('perfAuditBoardSub'),
          colors: ['#3B82F6', '#2563EB'],
          onPress: () => router.push('/admin/audits' as Href),
        },
        {
          key: 'pdf',
          icon: 'document-outline',
          title: t('perfMonthlyPdf'),
          subtitle: pdfLoading ? t('perfPdfPreparing') : t('perfPdfShare'),
          colors: ['#34D399', '#059669'],
          onPress: exportPdf,
          disabled: pdfLoading,
        }
      );
    }
    return cards;
  }, [isAdmin, pdfLoading, router, t]);

  return (
    <>
      <Stack.Screen options={{ title: t('perfDashboardTitle'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={performanceTheme.accent}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {!showContent && !dash && loading ? (
          <ActivityIndicator size="large" color={performanceTheme.accent} style={styles.loader} />
        ) : !dash ? (
          <Text style={styles.muted}>{t('perfDashLoadFailed')}</Text>
        ) : (
          <>
            <PerformanceHeroCard
              eyebrow={t('perfCombinedTitle')}
              name={dash.full_name ?? t('staffDefaultName')}
              score={singleScore}
              scoreLabel={t('perfOverallScore')}
              formula={t('perfFormula')}
              updatedLabel={updatedLabel}
              threshold={threshold}
              belowThreshold={belowThreshold}
              thresholdLabel={thresholdLabel}
            />

            <View style={[styles.bandCard, { borderColor: band.color, backgroundColor: band.bg }]}>
              <Text style={[styles.bandTitle, { color: band.color }]}>{t('staffPerfBandLabel')}</Text>
              <Text style={[styles.bandValue, { color: band.color }]}>{band.labelTr}</Text>
            </View>

            {belowThreshold ? (
              <PerformanceAlertBanner text={t('perfBelowThresholdAlert', { threshold })} />
            ) : null}

            {(dash.notices ?? []).length > 0 ? (
              <View style={styles.section}>
                <PerformanceSectionTitle title={t('perfOfficialRecords')} icon="document-text-outline" />
                {dash.notices.map((n, idx) => (
                  <PerformanceNoticeCard
                    key={n.id}
                    index={idx}
                    badge={
                      n.notice_type === 'termination_review'
                        ? t('perfNoticeTermination')
                        : t('perfNoticeWarning')
                    }
                    message={n.message}
                    meta={t('perfNoticeScore', {
                      score: n.score_at_trigger,
                      threshold: n.threshold_score,
                      date: new Date(n.created_at).toLocaleDateString(dateLoc),
                    })}
                    acknowledged={!!n.acknowledged_at}
                    ackLabel={t('perfAckBtn')}
                    ackDoneLabel={t('perfAckDone')}
                    onAck={() => onAck(n.id)}
                    ackLoading={ackId === n.id}
                  />
                ))}
              </View>
            ) : null}

            <PerformanceSectionTitle title={t('staffPerfMyEvents')} icon="list-outline" />
            {events.length === 0 ? (
              <Text style={styles.muted}>{t('staffAuditEmpty')}</Text>
            ) : (
              <View style={styles.eventList}>
                {events.map((e) => (
                  <View key={e.id} style={styles.eventRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.eventTitle}>{e.title}</Text>
                      <Text style={styles.eventMeta}>
                        {e.report_number} · {new Date(e.conducted_at).toLocaleString(dateLoc)}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontWeight: '800',
                        color: e.delta_points > 0 ? '#047857' : '#b91c1c',
                      }}
                    >
                      {e.delta_points > 0 ? '+' : ''}
                      {e.delta_points}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {departments.length > 0 ? (
              <PerformanceDeptLeaderboard
                departments={departments}
                monthLabel={currentMonthLabel}
              />
            ) : null}

            <PerformanceSectionTitle title={t('perfDetailSection')} icon="grid-outline" />
            <View style={styles.linkGrid}>
              {linkCards.map((card, idx) => (
                <PerformanceLinkCard
                  key={card.key}
                  index={idx}
                  icon={card.icon}
                  title={card.title}
                  subtitle={card.subtitle}
                  colors={card.colors}
                  onPress={card.onPress}
                  disabled={card.disabled}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: performanceTheme.pageBg },
  content: { padding: 16, paddingTop: 12 },
  loader: { marginTop: 48 },
  muted: { color: '#64748B', textAlign: 'center', marginTop: 12, marginBottom: 12 },
  section: { marginBottom: 16 },
  linkGrid: { marginBottom: 8 },
  bandCard: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    marginTop: 4,
  },
  bandTitle: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  bandValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
  eventList: { gap: 8, marginBottom: 16 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  eventTitle: { fontWeight: '700', fontSize: 13, color: '#0f172a' },
  eventMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
});
