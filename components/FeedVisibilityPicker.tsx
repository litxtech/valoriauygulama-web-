import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { FeedPostVisibility } from '@/lib/feedVisibility';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Option = {
  value: FeedPostVisibility;
  labelKey: string;
  hintKey: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const STAFF_OPTIONS: Option[] = [
  {
    value: 'all_staff',
    labelKey: 'feedVisibilityAllStaff',
    hintKey: 'feedVisibilityAllStaffHint',
    icon: 'people-outline',
  },
  {
    value: 'my_team',
    labelKey: 'feedVisibilityMyTeam',
    hintKey: 'feedVisibilityMyTeamHint',
    icon: 'git-branch-outline',
  },
  {
    value: 'customers',
    labelKey: 'feedVisibilityCustomers',
    hintKey: 'feedVisibilityCustomersHint',
    icon: 'sunny-outline',
  },
];

const GUEST_OPTIONS: Option[] = [
  {
    value: 'customers',
    labelKey: 'feedVisibilityGuestEveryone',
    hintKey: 'feedVisibilityGuestEveryoneHint',
    icon: 'globe-outline',
  },
  {
    value: 'guests_only',
    labelKey: 'feedVisibilityGuestsOnly',
    hintKey: 'feedVisibilityGuestsOnlyHint',
    icon: 'lock-closed-outline',
  },
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
  accentColor,
}: Props) {
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const accent = accentColor ?? palette.accent;
  const options = audience === 'staff' ? STAFF_OPTIONS : GUEST_OPTIONS;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: palette.text }]}>{t('feedVisibilityLabel')}</Text>
      <View style={styles.list}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onChange(opt.value)}
              disabled={disabled}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: active
                    ? isNight
                      ? 'rgba(45,212,191,0.12)'
                      : accent + '12'
                    : isNight
                      ? 'rgba(255,255,255,0.04)'
                      : '#FFFFFF',
                  borderColor: active ? accent : palette.borderLight,
                  opacity: disabled ? 0.55 : pressed ? 0.94 : 1,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, disabled }}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: active ? accent : isNight ? 'rgba(255,255,255,0.08)' : palette.accentSoft,
                  },
                ]}
              >
                <Ionicons name={opt.icon} size={18} color={active ? '#fff' : accent} />
              </View>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: active ? accent : palette.text }]}>
                  {t(opt.labelKey)}
                </Text>
                <Text style={[styles.rowHint, { color: palette.muted }]}>{t(opt.hintKey)}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  {
                    borderColor: active ? accent : palette.borderLight,
                    backgroundColor: active ? accent : 'transparent',
                  },
                ]}
              >
                {active ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  label: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 10,
    opacity: 0.85,
  },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowHint: { fontSize: 12, fontWeight: '500', marginTop: 2, lineHeight: 16 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
