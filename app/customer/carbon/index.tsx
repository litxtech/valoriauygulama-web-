import { useCallback, useMemo, useState } from 'react';
import { useCachedFocusLoad } from '@/hooks/useCachedFocusLoad';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { CARBON_OFFSET_INFO_URL, CARBON_TURKEY_CLIMATE_URL, DEFAULT_METHODOLOGY_SUMMARY } from '@/lib/carbonConstants';

function fmtLocale(): string {
  const raw = (i18n.language || 'tr').split('-')[0];
  const map: Record<string, string> = {
    tr: 'tr-TR',
    en: 'en-GB',
    ar: 'ar-SA',
    de: 'de-DE',
    fr: 'fr-FR',
    ru: 'ru-RU',
    es: 'es-ES',
  };
  return map[raw] ?? 'tr-TR';
}

type CarbonRow = {
  month_start: string;
  stay_nights: number;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  electricity_kg_co2: number;
  water_kg_co2: number;
  gas_kg_co2: number;
  waste_kg_co2: number;
  total_kg_co2: number;
  kg_co2_per_stay_night?: number | null;
  methodology_version?: string | null;
  methodology_summary?: string | null;
  electricity_factor_source?: string | null;
  water_factor_source?: string | null;
  gas_factor_source?: string | null;
  waste_factor_source?: string | null;
  data_collection_notes?: string | null;
  verification_notes?: string | null;
};

function fmtNum(n: number, max = 2): string {
  return new Intl.NumberFormat(fmtLocale(), { maximumFractionDigits: max }).format(n);
}

export default function CustomerCarbonScreen() {
  const { t } = useTranslation();
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  const fetchData = useCallback(async (): Promise<CarbonRow | null> => {
    const { data, error } = await supabase.rpc('get_my_latest_stay_carbon');
    if (error || !data?.length) return null;
    return (data[0] as CarbonRow) ?? null;
  }, []);

  const { data: row, loading, refreshing, refresh, showContent } = useCachedFocusLoad<CarbonRow>({
    cacheKey: 'customer-carbon:latest-stay',
    fetchData,
  });

  const treeCount = useMemo(() => {
    if (!row?.total_kg_co2) return 0;
    return Math.max(1, Math.round(row.total_kg_co2 / 25));
  }, [row?.total_kg_co2]);

  const methodologyText = row?.methodology_summary?.trim() || DEFAULT_METHODOLOGY_SUMMARY;

  const openOffsetInfo = () => {
    Alert.alert(
      t('customerCarbonOffsetAlertTitle'),
      t('customerCarbonOffsetAlertBody'),
      [
        { text: t('ok'), style: 'cancel' },
        {
          text: t('customerCarbonLinkGoldStandard'),
          onPress: () => Linking.openURL(CARBON_OFFSET_INFO_URL).catch(() => {}),
        },
        {
          text: t('customerCarbonLinkMinistry'),
          onPress: () => Linking.openURL(CARBON_TURKEY_CLIMATE_URL).catch(() => {}),
        },
      ]
    );
  };

  if (!showContent && loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[theme.colors.primary]} />}
    >
      <View style={styles.header}>
        <Ionicons name="leaf-outline" size={24} color={theme.colors.primary} />
        <Text style={styles.title}>{t('screenCarbonFootprint')}</Text>
      </View>

      <View style={styles.disclaimerCard}>
        <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
        <Text style={styles.disclaimerText}>{t('customerCarbonDisclaimer')}</Text>
      </View>

      {!row ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>{t('customerCarbonEmptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('customerCarbonEmptyBody')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.subtitle}>{t('customerCarbonStayLabel')}</Text>
            <Text style={styles.total}>{fmtNum(row.total_kg_co2, 1)} kg CO₂e</Text>
            <Text style={styles.meta}>
              {t('customerCarbonMetaLine', {
                nights: fmtNum(row.stay_nights, 0),
                ym: row.month_start.slice(0, 7),
                ver: row.methodology_version ?? '1.0',
              })}
            </Text>
            {row.kg_co2_per_stay_night != null && row.kg_co2_per_stay_night > 0 && (
              <Text style={styles.intensity}>
                {t('customerCarbonIntensity', { value: fmtNum(row.kg_co2_per_stay_night, 3) })}
              </Text>
            )}

            <View style={styles.divider} />

            <Row
              label={t('customerCarbonLabelElectric', { kwh: fmtNum(row.electricity_kwh) })}
              value={`${fmtNum(row.electricity_kg_co2)} kg`}
            />
            <Row
              label={t('customerCarbonLabelWater', { m3: fmtNum(row.water_m3) })}
              value={`${fmtNum(row.water_kg_co2)} kg`}
            />
            <Row
              label={t('customerCarbonLabelGas', { m3: fmtNum(row.gas_m3) })}
              value={`${fmtNum(row.gas_kg_co2)} kg`}
            />
            <Row
              label={t('customerCarbonLabelWaste', { kg: fmtNum(row.waste_kg) })}
              value={`${fmtNum(row.waste_kg_co2)} kg`}
            />

            <View style={styles.offsetBox}>
              <Text style={styles.offsetText}>
                {t('customerCarbonOffsetRough', { trees: String(treeCount) })}
              </Text>
              <TouchableOpacity style={styles.offsetBtn} activeOpacity={0.8} onPress={openOffsetInfo}>
                <Text style={styles.offsetBtnText}>{t('customerCarbonOffsetOptions')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.methodToggle} onPress={() => setMethodologyOpen(!methodologyOpen)} activeOpacity={0.85}>
            <Text style={styles.methodToggleText}>
              {methodologyOpen ? t('customerCarbonMethodologyHide') : t('customerCarbonMethodologyShow')}
            </Text>
            <Ionicons name={methodologyOpen ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.primary} />
          </TouchableOpacity>

          {methodologyOpen && (
            <View style={styles.methodCard}>
              <Text style={styles.methodBody}>{methodologyText}</Text>
              <Text style={styles.methodSub}>{t('customerCarbonSourceFactors')}</Text>
              <Text style={styles.methodSmall}>
                {t('customerCarbonSourceLineElectric', { val: row.electricity_factor_source?.trim() || '—' })}
              </Text>
              <Text style={styles.methodSmall}>
                {t('customerCarbonSourceLineWater', { val: row.water_factor_source?.trim() || '—' })}
              </Text>
              <Text style={styles.methodSmall}>
                {t('customerCarbonSourceLineGas', { val: row.gas_factor_source?.trim() || '—' })}
              </Text>
              <Text style={styles.methodSmall}>
                {t('customerCarbonSourceLineWaste', { val: row.waste_factor_source?.trim() || '—' })}
              </Text>
              {(row.data_collection_notes?.trim() || row.verification_notes?.trim()) && (
                <>
                  <Text style={[styles.methodSub, { marginTop: 10 }]}>{t('customerCarbonDataControl')}</Text>
                  {!!row.data_collection_notes?.trim() && (
                    <Text style={styles.methodSmall}>{row.data_collection_notes}</Text>
                  )}
                  {!!row.verification_notes?.trim() && <Text style={styles.methodSmall}>{row.verification_notes}</Text>}
                </>
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 28 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  disclaimerCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginBottom: 12,
  },
  disclaimerText: { flex: 1, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
  },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13 },
  total: { marginTop: 4, color: theme.colors.text, fontSize: 30, fontWeight: '800' },
  meta: { marginTop: 4, color: theme.colors.textMuted, fontSize: 13 },
  intensity: { marginTop: 6, color: theme.colors.textSecondary, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  rowLabel: { flex: 1, color: theme.colors.textSecondary, fontSize: 14 },
  rowValue: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  offsetBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 12,
  },
  offsetText: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 19 },
  offsetBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  offsetBtnText: { color: '#fff', fontWeight: '700' },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  methodToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
  },
  methodToggleText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  methodCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
  },
  methodBody: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 21 },
  methodSub: { marginTop: 12, color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  methodSmall: { marginTop: 6, color: theme.colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
