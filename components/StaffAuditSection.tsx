import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  AUDIT_THRESHOLD,
  auditScoreColor,
  auditScoreLabel,
  fetchAuditSessionItemLines,
  fetchStaffAuditSummary,
  type AuditSessionItemLine,
  type StaffAuditRecentRow,
} from '@/lib/audit';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { formatLocaleDateShort } from '@/lib/date';

type Props = {
  staffId: string;
};

export function StaffAuditSection({ staffId }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [evaluationAudit, setEvaluationAudit] = useState<number | null>(null);
  const [belowThreshold, setBelowThreshold] = useState(false);
  const [recent, setRecent] = useState<StaffAuditRecentRow[]>([]);
  const [itemLines, setItemLines] = useState<Record<string, AuditSessionItemLine[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchStaffAuditSummary(staffId);
    setEvaluationAudit(res.evaluationAudit);
    setBelowThreshold(res.belowThreshold);
    setRecent(res.recent);
    const lines: Record<string, AuditSessionItemLine[]> = {};
    await Promise.all(
      res.recent.slice(0, 6).map(async (r) => {
        lines[r.id] = await fetchAuditSessionItemLines(r.id);
      })
    );
    setItemLines(lines);
    setLoading(false);
  }, [staffId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!evaluationAudit && recent.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('staffAuditHeading')}</Text>

      {belowThreshold ? (
        <View style={styles.warnBanner}>
          <Ionicons name="warning" size={22} color="#b91c1c" />
          <Text style={styles.warnText}>{t('staffAuditWarn', { threshold: AUDIT_THRESHOLD })}</Text>
        </View>
      ) : null}

      {evaluationAudit != null ? (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreLabel}>{t('staffAuditScoreLabel')}</Text>
          <Text style={[styles.scoreValue, { color: auditScoreColor(evaluationAudit) }]}>
            {auditScoreLabel(evaluationAudit)}
          </Text>
        </View>
      ) : null}

      {recent.length > 0 ? (
        <>
          <Text style={styles.subheading}>{t('staffAuditRecent')}</Text>
          {recent.map((r) => (
            <View key={r.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.category_name}</Text>
                <Text style={styles.rowDate}>{formatLocaleDateShort(r.conducted_at)}</Text>
                {(itemLines[r.id] ?? []).length > 0 ? (
                  <View style={styles.critLines}>
                    {(itemLines[r.id] ?? []).map((line) => {
                      const lost = line.max_points - line.points_awarded;
                      if (lost <= 0) return null;
                      return (
                        <Text key={`${r.id}-${line.title}`} style={styles.critLine}>
                          {line.title}: {line.points_awarded}/{line.max_points}
                          {lost > 0 ? ` (−${lost})` : ''}
                        </Text>
                      );
                    })}
                  </View>
                ) : r.reason_summary && r.session_score < 100 ? (
                  <Text style={styles.rowReason} numberOfLines={4}>
                    {r.reason_summary}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.rowScore, { color: auditScoreColor(r.session_score) }]}>
                {auditScoreLabel(r.session_score)}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <Text style={styles.empty}>{t('staffAuditEmpty')}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heading: {
    fontSize: 17,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  subheading: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  warnBanner: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warnText: { flex: 1, fontSize: 13, color: '#991b1b', lineHeight: 18 },
  scoreCard: { alignItems: 'center', paddingVertical: theme.spacing.md },
  scoreLabel: { fontSize: 13, color: theme.colors.textSecondary },
  scoreValue: { fontSize: 36, fontWeight: '800', marginTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  rowDate: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  rowReason: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  critLines: { marginTop: 6, gap: 2 },
  critLine: { fontSize: 12, color: theme.colors.textSecondary },
  rowScore: { fontSize: 16, fontWeight: '800', marginLeft: 8 },
  empty: { fontSize: 14, color: theme.colors.textMuted },
});
