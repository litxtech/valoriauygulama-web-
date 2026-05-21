import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';

const FACILITY_IDS = ['reception', 'restaurant', 'pool', 'gym', 'spa', 'bar', 'parking'] as const;
const FACILITY_ICONS: Record<(typeof FACILITY_IDS)[number], string> = {
  reception: '🛎️',
  restaurant: '🍽️',
  pool: '🏊',
  gym: '💪',
  spa: '💆',
  bar: '🍷',
  parking: '🅿️',
};

const EMERGENCY_IDS = ['stairs', 'assembly', 'extinguisher', 'firstaid'] as const;

export default function HotelMapScreen() {
  const { t } = useTranslation();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t('hotelMap_title')}</Text>
      <Text style={styles.subtitle}>{t('hotelMap_subtitle')}</Text>

      <Text style={styles.sectionTitle}>{t('hotelMap_facilitiesSection')}</Text>
      {FACILITY_IDS.map((id) => (
        <View key={id} style={styles.card}>
          <Text style={styles.cardIcon}>{FACILITY_ICONS[id]}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardName}>{t(`hotelMap_fac_${id}_name`)}</Text>
            <Text style={styles.cardFloor}>{t(`hotelMap_fac_${id}_floor`)}</Text>
            <Text style={styles.cardDir}>{t(`hotelMap_fac_${id}_dir`)}</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.sectionTitle, styles.emergencySection]}>{t('hotelMap_emergencySection')}</Text>
      {EMERGENCY_IDS.map((id) => (
        <View key={id} style={styles.emergencyCard}>
          <Text style={styles.emergencyLabel}>{t(`hotelMap_em_${id}_label`)}</Text>
          <Text style={styles.emergencyDesc}>{t(`hotelMap_em_${id}_desc`)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl },
  title: { ...theme.typography.title, color: theme.colors.text, marginBottom: 4 },
  subtitle: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, marginBottom: theme.spacing.xl },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: theme.spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  cardIcon: { fontSize: 28, marginRight: theme.spacing.md },
  cardBody: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  cardFloor: { fontSize: 13, color: theme.colors.primary, marginTop: 2 },
  cardDir: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  emergencySection: { marginTop: theme.spacing.xl },
  emergencyCard: {
    backgroundColor: '#fef2f2',
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    marginBottom: theme.spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.error,
  },
  emergencyLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  emergencyDesc: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
});
