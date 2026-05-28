import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type HeaderTheme = {
  colors: [string, string];
  titleColor: string;
};

export const headerThemes = {
  customer: {
    colors: ['#0ea5e9', '#22c55e'],
    titleColor: '#0b1220',
  },
  feed: {
    colors: ['#fb7185', '#f59e0b'],
    titleColor: '#1b0b12',
  },
  staff: {
    colors: ['#10b981', '#06b6d4'],
    titleColor: '#06161a',
  },
  admin: {
    colors: ['#6366f1', '#a855f7'],
    titleColor: '#100b1f',
  },
} satisfies Record<string, HeaderTheme>;

export function makeGradientHeaderOptions(theme: HeaderTheme) {
  return {
    headerStyle: styles.headerTransparent,
    headerShadowVisible: false as const,
    headerTintColor: theme.titleColor,
    headerTitleStyle: {
      fontWeight: '800' as const,
    },
    headerBackground: () => <LinearGradient colors={theme.colors} style={StyleSheet.absoluteFillObject} />,
    ...(Platform.OS === 'android' ? { statusBarStyle: 'dark' as const } : null),
  };
}

const styles = StyleSheet.create({
  headerTransparent: {
    backgroundColor: 'transparent',
  },
});

