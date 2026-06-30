import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { CHECK_QUICK_ACTIONS } from '@/lib/financeCheckTheme';
import type { FinanceCheckStatus } from '@/lib/finance';

type Props = {
  status: FinanceCheckStatus;
  onSelect: (status: FinanceCheckStatus) => void;
  compact?: boolean;
  disabled?: boolean;
  saving?: boolean;
};

export function FinanceCheckQuickStatusButtons({
  status,
  onSelect,
  compact = false,
  disabled = false,
  saving = false,
}: Props) {
  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      {CHECK_QUICK_ACTIONS.map((action) => {
        const active = status === action.status;
        return (
          <TouchableOpacity
            key={action.status}
            style={[
              compact ? styles.chipCompact : styles.btn,
              active && { backgroundColor: action.color, borderColor: action.color },
              !active && { backgroundColor: action.bg, borderColor: action.color },
              (disabled || saving) && styles.disabled,
            ]}
            onPress={() => onSelect(action.status)}
            disabled={disabled || saving}
            activeOpacity={0.85}
          >
            {saving && active ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name={action.icon} size={compact ? 15 : 18} color={active ? '#fff' : action.color} />
            )}
            <Text
              style={[
                compact ? styles.chipText : styles.btnText,
                { color: active ? '#fff' : action.color },
              ]}
              numberOfLines={2}
            >
              {action.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const T = adminTheme;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  rowCompact: { gap: 6, marginTop: 10 },
  btn: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    minHeight: 72,
  },
  chipCompact: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnText: { fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  chipText: { fontSize: 10, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  disabled: { opacity: 0.55 },
});
