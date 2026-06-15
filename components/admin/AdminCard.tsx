import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';
import { GlassSurface } from '@/components/premium/GlassSurface';

type AdminCardProps = {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
  /** Cam + premium kenar glow */
  premium?: boolean;
  auraColor?: string;
};

export function AdminCard({
  children,
  style,
  padded = true,
  elevated = true,
  premium = false,
  auraColor = '#6366f1',
}: AdminCardProps) {
  if (premium) {
    return (
      <View style={[premium && styles.auraHost, premium && { shadowColor: auraColor }, style]}>
        <GlassSurface style={[padded && styles.padded, elevated && styles.premiumBorder]} borderRadius={adminTheme.radius.lg} strong>
          {children}
        </GlassSurface>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        elevated && (Platform.OS === 'ios' ? styles.shadow : styles.elevation),
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  padded: {
    padding: adminTheme.spacing.xl,
  },
  shadow: adminTheme.shadow.md,
  elevation: { elevation: 4 },
  premiumBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(99,102,241,0.2)',
  },
  auraHost: {
    ...(Platform.OS === 'ios'
      ? {
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 12,
        }
      : { elevation: 5 }),
  },
});
