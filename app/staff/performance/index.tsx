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
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import {
  type DepartmentLeaderboardRow,
} from '@/lib/audit';
import {
  acknowledgePerformanceNotice,
  fetchMonthlyReportData,
  fetchPerformanceDashboard,
  pillarLabel,
  type PerformanceDashboard,
} from '@/lib/performanceDashboard';
import { exportAuditMonthlyReportPdf } from '@/lib/auditMonthlyReportPdf';
import { monthKey } from '@/lib/financeLedger';
import { monthName } from '@/lib/i18nLookup';
import { canAccessAdminShell } from '@/lib/staffPermissions';
import { performanceTheme } from '@/components/performance';
import {
  PerformanceHeroCard,
  PerformanceAlertBanner,
  PerformancePillarCard,
  PerformanceDeptLeaderboard,
  PerformanceNoticeCard,
  PerformanceLinkCard,
  PerformanceSectionTitle,
} from '@/components/performance/PerformancePremiumUi';

export default function PerformanceDashboardScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dash, setDash] = useState<PerformanceDashboard | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [ackId, setAckId] = useState<string | null>(null);

  const isAdmin = canAccessAdminShell(staff);
  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!staff?.id) return;
    const { data, error } = await fetchPerformanceDashboard(staff.id);
    if (error) Alert.alert(t('perfLoadFailed'), error);
    setDash(data);
    setLoading(false);
  }, [staff?.id, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
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
  const dateLoc = i18n.language?.startsWith('ar') ? 'ar-SA' : i18n.language?.startsWith('tr') ? 'tr-TR' : 'en-US';
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

  const thresholdLabel = t('perfThreshold', {
    score: threshold,
    status: dash?.below_threshold ? t('perfThresholdBelow') : t('perfThresholdOk'),
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
      {
        key: 'points',
        icon: 'ribbon-outline',
        title: 'Alınan puanlarım',
        subtitle: 'Bölüm ve kaynak bazında puan geçmişi, sıralama',
        colors: ['#FBBF24', '#F59E0B'],
        onPress: () => router.push('/staff/points'),
      },
    ];
    if (isAdmin) {
      cards.push(
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
        {loading ? (
          <ActivityIndicator size="large" color={performanceTheme.accent} style={styles.loader} />
        ) : !dash ? (
          <Text style={styles.muted}>{t('perfDashLoadFailed')}</Text>
        ) : (
          <>
            <PerformanceHeroCard
              eyebrow={t('perfCombinedTitle')}
              name={dash.full_name ?? t('staffDefaultName')}
              score={dash.evaluation_combined}
              scoreLabel={t('perfOverallScore')}
              formula={t('perfFormula', {
                mgmt: dash.weights.management,
                audit: dash.weights.audit,
                guest: dash.weights.guest,
              })}
              updatedLabel={updatedLabel}
              threshold={threshold}
              belowThreshold={dash.below_threshold}
              thresholdLabel={thresholdLabel}
            />

            {dash.below_threshold ? (
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

            <PerformanceSectionTitle title={t('perfPillarSection')} icon="layers-outline" />
            <View style={styles.pillarGrid}>
              <PerformancePillarCard
                index={0}
                title={pillarLabel('management')}
                score={dash.evaluation_management}
                weight={dash.weights.management}
                icon="ribbon-outline"
                noDataLabel={t('perfNoData')}
              />
              <PerformancePillarCard
                index={1}
                title={pillarLabel('audit')}
                score={dash.evaluation_audit}
                weight={dash.weights.audit}
                icon="clipboard-outline"
                noDataLabel={t('perfNoData')}
              />
              <PerformancePillarCard
                index={2}
                title={pillarLabel('guest')}
                score={dash.evaluation_guest}
                weight={dash.weights.guest}
                icon="star-outline"
                noDataLabel={t('perfNoData')}
              />
            </View>

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
  muted: { color: '#64748B', textAlign: 'center', marginTop: 24 },
  section: { marginBottom: 16 },
  pillarGrid: { gap: 10, marginBottom: 18 },
  linkGrid: { marginBottom: 8 },
});
