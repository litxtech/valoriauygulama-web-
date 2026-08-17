import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: string;
  children: ReactNode;
};

export function HotelIssueArchiveSection({ title, subtitle, icon, accent = theme.colors.primary, children }: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}14` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: theme.colors.background,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: theme.colors.text, letterSpacing: -0.2 },
  subtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 3, lineHeight: 18 },
});
