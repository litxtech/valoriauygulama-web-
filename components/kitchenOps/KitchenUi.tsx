import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { theme } from '@/constants/theme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';

type Props = {
  label: string;
  value: string;
  icon?: string;
  onPress?: () => void;
  highlight?: boolean;
};

export function KitchenStatCard({ label, value, onPress, highlight }: Props) {
  const inner = (
    <View style={[styles.card, highlight && styles.highlight]}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, highlight && styles.valueHighlight]}>{value}</Text>
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.flex, pressed && { opacity: 0.9 }]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={styles.flex}>{inner}</View>;
}

export function KitchenMoneyStat({ label, amount, highlight }: { label: string; amount: number; highlight?: boolean }) {
  return <KitchenStatCard label={label} value={fmtKitchenMoney(amount)} highlight={highlight} />;
}

export function KitchenSaveButton({ label, onPress, loading, disabled }: { label: string; onPress: () => void; loading?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [styles.saveBtn, (loading || disabled) && styles.saveBtnDisabled, pressed && !loading && styles.saveBtnPressed]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{label}</Text>}
    </Pressable>
  );
}

export function KitchenChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | '';
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: '46%' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 10,
  },
  highlight: { borderColor: theme.colors.primary, backgroundColor: '#fffbeb' },
  label: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  value: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginTop: 4 },
  valueHighlight: { color: theme.colors.primary },
  saveBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    minHeight: 54,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnPressed: { opacity: 0.9 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipActive: { backgroundColor: '#fffbeb', borderColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  chipTextActive: { color: theme.colors.primaryDark, fontWeight: '700' },
});
