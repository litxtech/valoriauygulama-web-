import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '@/constants/theme';
import type { KbsBoardTab } from '@/lib/kbsSubmissionBoard';
import { boardTabLabel } from '@/lib/kbsSubmissionBoard';

type Props = {
  active: KbsBoardTab;
  counts: Partial<Record<KbsBoardTab, number>>;
  onChange: (tab: KbsBoardTab) => void;
};

const TABS: KbsBoardTab[] = ['reached', 'inProgress', 'queued', 'failed'];

const ACCENT: Record<KbsBoardTab, string> = {
  reached: '#0f766e',
  inProgress: '#0369a1',
  queued: '#a16207',
  failed: '#b91c1c',
};

export function KbsStatusTabBar({ active, counts, onChange }: Props) {
  return (
    <View style={styles.row}>
      {TABS.map((tab) => {
        const on = active === tab;
        const n = counts[tab] ?? 0;
        return (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, on && { backgroundColor: ACCENT[tab], borderColor: ACCENT[tab] }]}
            onPress={() => onChange(tab)}
            activeOpacity={0.88}
          >
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {boardTabLabel(tab)}
            </Text>
            <Text style={[styles.count, on && styles.countOn]}>{n}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    gap: 2,
  },
  label: { fontSize: 11, fontWeight: '800', color: theme.colors.textSecondary },
  labelOn: { color: '#fff' },
  count: { fontSize: 15, fontWeight: '900', color: theme.colors.text },
  countOn: { color: '#fff' },
});
