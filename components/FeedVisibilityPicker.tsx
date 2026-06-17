import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { FeedPostVisibility } from '@/lib/feedVisibility';

type Option = {
  value: FeedPostVisibility;
  labelKey: string;
  hintKey: string;
};

const STAFF_OPTIONS: Option[] = [
  { value: 'all_staff', labelKey: 'feedVisibilityAllStaff', hintKey: 'feedVisibilityAllStaffHint' },
  { value: 'my_team', labelKey: 'feedVisibilityMyTeam', hintKey: 'feedVisibilityMyTeamHint' },
  { value: 'customers', labelKey: 'feedVisibilityCustomers', hintKey: 'feedVisibilityCustomersHint' },
];

const GUEST_OPTIONS: Option[] = [
  { value: 'customers', labelKey: 'feedVisibilityGuestEveryone', hintKey: 'feedVisibilityGuestEveryoneHint' },
  { value: 'guests_only', labelKey: 'feedVisibilityGuestsOnly', hintKey: 'feedVisibilityGuestsOnlyHint' },
];

type Props = {
  audience: 'staff' | 'guest';
  value: FeedPostVisibility;
  onChange: (value: FeedPostVisibility) => void;
  disabled?: boolean;
  accentColor?: string;
};

export function FeedVisibilityPicker({
  audience,
  value,
  onChange,
  disabled = false,
  accentColor = '#b8860b',
}: Props) {
  const { t } = useTranslation();
  const options = audience === 'staff' ? STAFF_OPTIONS : GUEST_OPTIONS;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('feedVisibilityLabel')}</Text>
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.row,
              active && { borderColor: accentColor, backgroundColor: accentColor + '0c' },
              disabled && styles.rowDisabled,
            ]}
            onPress={() => onChange(opt.value)}
            disabled={disabled}
            activeOpacity={0.85}
          >
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, active && { color: accentColor }]}>{t(opt.labelKey)}</Text>
              <Text style={styles.rowHint}>{t(opt.hintKey)}</Text>
            </View>
            {active ? <Text style={[styles.check, { color: accentColor }]}>✓</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  label: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowDisabled: { opacity: 0.6 },
  rowText: { flex: 1, paddingRight: 8 },
  rowLabel: { fontSize: 15, fontWeight: '600', color: '#374151' },
  rowHint: { fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 16 },
  check: { fontWeight: '700', fontSize: 18 },
});
