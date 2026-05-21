import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { theme } from '@/constants/theme';
import { profileScreenTheme as pst } from '@/constants/profileScreenTheme';
import {
  auditScoreColor,
  auditScoreLabel,
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

function ScoreRing({
  score,
  size = 140,
  label,
}: {
  score: number | null;
  size?: number;
  label: string;
}) {
  const color = auditScoreColor(score);
  const display = score != null ? Math.round(score) : '—';
  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      <View style={[styles.ringOuter, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
        <Text style={[styles.ringScore, { color, fontSize: size * 0.32 }]}>{display}</Text>
        <Text style={styles.ringSub}>/ 100</Text>
      </View>
      <Text style={styles.ringLabel}>{label}</Text>
    </View>
  );
}

function PillarCard({
  title,
  score,
  weight,
  icon,
  noDataLabel,
}: {
  title: string;
  score: number | null;
  weight: number;
  icon: keyof typeof Ionicons.glyphMap;
  noDataLabel: string;
}) {
  return (
    <View style={styles.pillarCard}>
      <View style={styles.pillarHead}>
        <View style={styles.pillarIconWrap}>
          <Ionicons name={icon} size={20} color={pst.accent.blue} />
        </View>
        <Text style={styles.pillarWeight}>%{weight}</Text>
      </View>
      <Text style={styles.pillarTitle}>{title}</Text>
      <Text style={[styles.pillarScore, { color: auditScoreColor(score) }]}>
        {score != null ? auditScoreLabel(score) : noDataLabel}
      </Text>
    </View>
  );
}

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

  return (
    <>
      <Stack.Screen options={{ title: t('perfDashboardTitle'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 48 }} />
        ) : !dash ? (
          <Text style={styles.muted}>{t('perfDashLoadFailed')}</Text>
        ) : (
          <>
            <View style={styles.heroCard}>
              <Text style={styles.heroEyebrow}>{t('perfCombinedTitle')}</Text>
              <View style={styles.heroRow}>
                <ScoreRing score={dash.evaluation_combined} label={t('perfOverallScore')} />
                <View style={styles.heroMeta}>
                  <Text style={styles.heroName}>{dash.full_name ?? t('staffDefaultName')}</Text>
                  <Text style={styles.heroFormula}>
                    {t('perfFormula', {
                      mgmt: dash.weights.management,
                      audit: dash.weights.audit,
                      guest: dash.weights.guest,
                    })}
                  </Text>
                  {dash.evaluation_combined_updated_at ? (
                    <Text style={styles.heroUpdated}>
                      {t('perfUpdated', {
                        date: new Date(dash.evaluation_combined_updated_at).toLocaleDateString(dateLoc, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        }),
                      })}
                    </Text>
                  ) : null}
                  <View
                    style={[
                      styles.thresholdPill,
                      dash.below_threshold ? styles.thresholdBad : styles.thresholdOk,
                    ]}
                  >
                    <Text
                      style={[
                        styles.thresholdText,
                        dash.below_threshold ? styles.thresholdTextBad : styles.thresholdTextOk,
                      ]}
                    >
                      {t('perfThreshold', {
                        score: threshold,
                        status: dash.below_threshold ? t('perfThresholdBelow') : t('perfThresholdOk'),
                      })}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {dash.below_threshold ? (
              <View style={styles.alertCard}>
                <Ionicons name="alert-circle" size={24} color="#b91c1c" />
                <Text style={styles.alertText}>{t('perfBelowThresholdAlert', { threshold })}</Text>
              </View>
            ) : null}

            {(dash.notices ?? []).length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('perfOfficialRecords')}</Text>
                {dash.notices.map((n) => (
                  <View key={n.id} style={styles.noticeCard}>
                    <View style={styles.noticeBadge}>
                      <Text style={styles.noticeBadgeText}>
                        {n.notice_type === 'termination_review'
                          ? t('perfNoticeTermination')
                          : t('perfNoticeWarning')}
                      </Text>
                    </View>
                    <Text style={styles.noticeMsg}>{n.message}</Text>
                    <Text style={styles.noticeMeta}>
                      {t('perfNoticeScore', {
                        score: n.score_at_trigger,
                        threshold: n.threshold_score,
                        date: new Date(n.created_at).toLocaleDateString(dateLoc),
                      })}
                    </Text>
                    {!n.acknowledged_at ? (
                      <TouchableOpacity
                        style={styles.ackBtn}
                        onPress={() => onAck(n.id)}
                        disabled={ackId === n.id}
                      >
                        <Text style={styles.ackBtnText}>
                          {ackId === n.id ? '…' : t('perfAckBtn')}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.ackDone}>{t('perfAckDone')}</Text>
                    )}
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>{t('perfPillarSection')}</Text>
            <View style={styles.pillarGrid}>
              <PillarCard
                title={pillarLabel('management')}
                score={dash.evaluation_management}
                weight={dash.weights.management}
                icon="ribbon-outline"
                noDataLabel={t('perfNoData')}
              />
              <PillarCard
                title={pillarLabel('audit')}
                score={dash.evaluation_audit}
                weight={dash.weights.audit}
                icon="clipboard-outline"
                noDataLabel={t('perfNoData')}
              />
              <PillarCard
                title={pillarLabel('guest')}
                score={dash.evaluation_guest}
                weight={dash.weights.guest}
                icon="star-outline"
                noDataLabel={t('perfNoData')}
              />
            </View>

            {departments.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('perfDeptRanking', { month: currentMonthLabel })}</Text>
                {departments.map((d) => (
                  <View key={d.category_id} style={styles.deptRow}>
                    <View style={styles.deptRank}>
                      <Text style={styles.deptRankNum}>{d.rank}</Text>
                    </View>
                    <Text style={styles.deptName}>{d.name}</Text>
                    <Text style={[styles.deptScore, { color: auditScoreColor(d.avg_score) }]}>
                      {d.avg_score != null ? auditScoreLabel(d.avg_score) : '—'}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>{t('perfDetailSection')}</Text>
            <View style={styles.linkGrid}>
              <TouchableOpacity style={styles.linkCard} onPress={() => router.push('/staff/evaluation')}>
                <Ionicons name="analytics-outline" size={22} color={pst.accent.purple} />
                <Text style={styles.linkTitle}>{t('perfEvalCenter')}</Text>
                <Text style={styles.linkSub}>{t('perfEvalCenterSub')}</Text>
              </TouchableOpacity>
              {isAdmin ? (
                <>
                  <TouchableOpacity
                    style={styles.linkCard}
                    onPress={() => router.push('/admin/audits' as Href)}
                  >
                    <Ionicons name="clipboard-outline" size={22} color={pst.accent.blue} />
                    <Text style={styles.linkTitle}>{t('perfAuditBoard')}</Text>
                    <Text style={styles.linkSub}>{t('perfAuditBoardSub')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.linkCard}
                    onPress={exportPdf}
                    disabled={pdfLoading}
                  >
                    <Ionicons name="document-outline" size={22} color={pst.accent.green} />
                    <Text style={styles.linkTitle}>{t('perfMonthlyPdf')}</Text>
                    <Text style={styles.linkSub}>{pdfLoading ? t('perfPdfPreparing') : t('perfPdfShare')}</Text>
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: pst.bg },
  content: { padding: 20, paddingTop: 12 },
  muted: { color: pst.subtext, textAlign: 'center', marginTop: 24 },
  heroCard: {
    ...pst.cardShell,
    padding: 22,
    marginBottom: 16,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: pst.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  heroMeta: { flex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: pst.text, marginBottom: 8 },
  heroFormula: { fontSize: 13, color: pst.subtext, lineHeight: 18, marginBottom: 8 },
  heroUpdated: { fontSize: 12, color: pst.subtext, marginBottom: 10 },
  thresholdPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  thresholdOk: { backgroundColor: '#ecfdf5' },
  thresholdBad: { backgroundColor: '#fef2f2' },
  thresholdText: { fontSize: 12, fontWeight: '700' },
  thresholdTextOk: { color: '#047857' },
  thresholdTextBad: { color: '#b91c1c' },
  ringWrap: { alignItems: 'center' },
  ringOuter: {
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  ringScore: { fontWeight: '800' },
  ringSub: { fontSize: 12, color: pst.subtext, marginTop: 2 },
  ringLabel: { marginTop: 8, fontSize: 12, fontWeight: '600', color: pst.subtext },
  alertCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  alertText: { flex: 1, fontSize: 14, color: '#991b1b', lineHeight: 20 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: pst.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  pillarGrid: { gap: 12, marginBottom: 24 },
  pillarCard: {
    ...pst.cardShell,
    padding: 16,
  },
  pillarHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  pillarIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: pst.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillarWeight: { fontSize: 13, fontWeight: '700', color: pst.subtext },
  pillarTitle: { fontSize: 15, fontWeight: '700', color: pst.text, marginBottom: 6 },
  pillarScore: { fontSize: 22, fontWeight: '800' },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    ...pst.cardShell,
    padding: 14,
    marginBottom: 8,
  },
  deptRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: pst.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deptRankNum: { fontWeight: '800', fontSize: 13, color: pst.text },
  deptName: { flex: 1, fontSize: 15, fontWeight: '600', color: pst.text },
  deptScore: { fontSize: 16, fontWeight: '800' },
  noticeCard: {
    ...pst.cardShell,
    padding: 16,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  noticeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  noticeBadgeText: { fontSize: 11, fontWeight: '800', color: '#991b1b' },
  noticeMsg: { fontSize: 14, color: pst.text, lineHeight: 20, marginBottom: 8 },
  noticeMeta: { fontSize: 12, color: pst.subtext },
  ackBtn: {
    marginTop: 12,
    backgroundColor: pst.accent.blue,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  ackBtnText: { color: '#fff', fontWeight: '700' },
  ackDone: { marginTop: 8, fontSize: 12, color: '#047857', fontWeight: '600' },
  linkGrid: { gap: 12 },
  linkCard: {
    ...pst.cardShell,
    padding: 18,
  },
  linkTitle: { fontSize: 16, fontWeight: '700', color: pst.text, marginTop: 10 },
  linkSub: { fontSize: 13, color: pst.subtext, marginTop: 4 },
});
