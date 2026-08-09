import { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { premiumTheme } from '@/constants/premiumTheme';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

export type StaffPresenceStatus = 'available' | 'busy' | 'urgent' | 'break';

const STATUS_COLOR: Record<StaffPresenceStatus, string> = {
  available: premiumTheme.status.available,
  busy: premiumTheme.status.busy,
  urgent: premiumTheme.status.urgent,
  break: premiumTheme.status.break,
};

type Props = {
  children: ReactNode;
  status?: StaffPresenceStatus;
  size?: number;
};

export function StaffStatusRing({ children, status = 'available', size = 72 }: Props) {
  const { isNight } = usePremiumTheme();
  const color = STATUS_COLOR[status];
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          backgroundColor: isNight ? 'transparent' : '#FFFFFF',
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    overflow: 'hidden',
  },
});
