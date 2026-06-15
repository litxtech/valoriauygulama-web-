import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { getRoleAuraColor } from '@/lib/roleAuraColors';

type Props = {
  children: ReactNode;
  role?: string | null;
  department?: string | null;
  radius?: number;
};

/** Rol bazlı hafif kenar glow */
export function RoleAura({ children, role, department, radius = 36 }: Props) {
  const color = getRoleAuraColor({ role, department });
  return (
    <View style={[styles.host, { borderRadius: radius }]}>
      <View
        style={[
          styles.glow,
          {
            borderRadius: radius + 4,
            shadowColor: color,
            backgroundColor: color + '18',
            borderColor: color + '55',
          },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  glow: {
    ...StyleSheet.absoluteFillObject,
    margin: -3,
    borderWidth: 1.5,
    ...(Platform.OS === 'ios'
      ? {
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.65,
          shadowRadius: 10,
        }
      : { elevation: 6 }),
  },
});
