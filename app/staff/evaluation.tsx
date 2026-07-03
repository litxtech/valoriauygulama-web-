import { useCallback, useState } from 'react';
import { View, ScrollView, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';
import {
  StaffEvaluationHub,
  StaffReviewsFullModal,
  type HubReview,
} from '@/components/StaffEvaluationHub';
import { StaffManagementEvaluationCards } from '@/components/StaffManagementEvaluationCards';
import { StaffAuditSection } from '@/components/StaffAuditSection';
import { resolveStaffEvaluation } from '@/lib/staffEvaluation';
import type { StaffManagementEvaluationRow } from '@/lib/managementEvaluation';
import { formatDateShort } from '@/lib/date';
import { theme } from '@/constants/theme';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';

type ReviewRow = { id: string; rating: number; comment: string | null; created_at: string };

type EvalProfile = {
  id: string;
  full_name: string | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
  average_rating?: number | null;
  total_reviews?: number | null;
};

type EvaluationScreenCache = {
  profile: EvalProfile | null;
  reviews: ReviewRow[];
  mgmtRows: StaffManagementEvaluationRow[];
  evaluatorNames: Record<string, string | null>;
};

export default function StaffEvaluationScreen() {
  const { t } = useTranslation();
  const staffId = useAuthStore((s) => s.staff?.id);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [ackId, setAckId] = useState<string | null>(null);

  const loadMgmtInto = useCallback(async (sid: string) => {
    const { data: evs, error } = await supabase
      .from('staff_management_evaluations')
      .select('*')
      .eq('staff_id', sid)
      .order('created_at', { ascending: false });
    if (error) return { mgmtRows: [] as StaffManagementEvaluationRow[], evaluatorNames: {} as Record<string, string | null> };
    const list = (evs ?? []) as StaffManagementEvaluationRow[];
    const eids = [...new Set(list.map((r) => r.evaluator_staff_id))];
    if (!eids.length) return { mgmtRows: list, evaluatorNames: {} };
    const { data: names } = await supabase.from('staff').select('id, full_name').in('id', eids);
    const map: Record<string, string | null> = {};
    for (const row of names ?? []) {
      const r = row as { id: string; full_name: string | null };
      map[r.id] = r.full_name;
    }
    return { mgmtRows: list, evaluatorNames: map };
  }, []);

  const fetchData = useCallback(async (): Promise<EvaluationScreenCache | null> => {
    if (!staffId) return null;
    const res = await loadStaffProfileSelf(staffId);
    const { data: r } = await supabase
      .from('staff_reviews')
      .select('id, rating, comment, created_at')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false });
    const mgmt = await loadMgmtInto(staffId);
    return {
      profile: (res.data as EvalProfile) ?? null,
      reviews: (r ?? []) as ReviewRow[],
      mgmtRows: mgmt.mgmtRows,
      evaluatorNames: mgmt.evaluatorNames,
    };
  }, [staffId, loadMgmtInto]);

  const { data, reload, showContent } = useCachedFocusLoad({
    cacheKey: staffId ? `staff-evaluation:${staffId}` : 'staff-evaluation:none',
    enabled: !!staffId,
    fetchData,
  });

  const profile = data?.profile ?? null;
  const reviews = data?.reviews ?? [];
  const mgmtRows = data?.mgmtRows ?? [];
  const evaluatorNames = data?.evaluatorNames ?? {};

  const loadMgmt = useCallback(
    async (sid: string) => {
      await reload();
    },
    [reload]
  );

  const onAcknowledge = useCallback(
    async (evalId: string) => {
      setAckId(evalId);
      try {
        const { error } = await supabase.rpc('acknowledge_staff_management_evaluation', {
          p_eval_id: evalId,
        });
        if (error) throw error;
        if (staffId) await loadMgmt(staffId);
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? '');
      }
      setAckId(null);
    },
    [staffId, loadMgmt, t]
  );

  if (!staffId) {
    return (
      <>
        <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
        <View style={styles.center} />
      </>
    );
  }

  if (!showContent && !profile) {
    return (
      <>
        <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('evaluationHubTitle'), headerBackTitle: t('back') }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <StaffEvaluationHub
          resolved={resolveStaffEvaluation({
            id: profile.id,
            evaluation_score: profile.evaluation_score,
            evaluation_discipline: profile.evaluation_discipline,
            evaluation_communication: profile.evaluation_communication,
            evaluation_speed: profile.evaluation_speed,
            evaluation_responsibility: profile.evaluation_responsibility,
            evaluation_insight: profile.evaluation_insight,
            average_rating: profile.average_rating,
          })}
          averageRating={profile.average_rating ?? null}
          totalReviews={profile.total_reviews ?? null}
          reviews={reviews as HubReview[]}
          previewLimit={8}
          onOpenAllReviews={() => setReviewsModalVisible(true)}
          formatReviewDate={(iso) => formatDateShort(iso)}
        />
        <StaffAuditSection staffId={staffId} />
        <View style={styles.mgmtBlock}>
          <StaffManagementEvaluationCards
            rows={mgmtRows}
            evaluatorNames={evaluatorNames}
            showAcknowledge
            onAcknowledge={onAcknowledge}
            acknowledgingId={ackId}
          />
        </View>
      </ScrollView>
      <StaffReviewsFullModal
        visible={reviewsModalVisible}
        onClose={() => setReviewsModalVisible(false)}
        staffName={profile.full_name || '—'}
        reviews={reviews as HubReview[]}
        formatReviewDate={(iso) => formatDateShort(iso)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
  },
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxl,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  mgmtBlock: {
    marginTop: theme.spacing.xl,
  },
});
