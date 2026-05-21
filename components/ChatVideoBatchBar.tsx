import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { getChatVideoBatchSummary, type ChatVideoUploadState } from '@/lib/chatVideoBatchSend';

type Props = {
  states: Record<string, ChatVideoUploadState>;
};

export function ChatVideoBatchBar({ states }: Props) {
  const { t } = useTranslation();
  const summary = getChatVideoBatchSummary(states);
  if (!summary.active && summary.failed === 0) return null;

  if (summary.active && summary.total <= 1) {
    return null;
  }

  if (!summary.active && summary.failed > 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>
          {t('chatVideoBatchFailed', { count: summary.failed })}
        </Text>
      </View>
    );
  }

  const current = Math.min(summary.done + 1, summary.total);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label} numberOfLines={1}>
        {t('chatVideoSendingBatch', { current, total: summary.total })}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${summary.overallPercent}%` }]} />
      </View>
      <Text style={styles.percent}>{summary.overallPercent}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
  },
  track: {
    width: 88,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  percent: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
