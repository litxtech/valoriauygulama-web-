import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { PartnerHotelPriceEditor } from '@/components/breakfastPartner/PartnerHotelPriceEditor';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import { fetchPartnerSettings, fmtPartnerMoney } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function AdminBreakfastPartnerPricesScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminBreakfastPartnerPricesForm />
    </BreakfastPartnerAdminGate>
  );
}

function AdminBreakfastPartnerPricesForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId } = useBreakfastPartnerProviderOrgId();
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const settings = await fetchPartnerSettings(orgId);
    setDefaultPrice(settings?.default_unit_price ?? 0);
    setLoading(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        <Text style={styles.backText}>Geri</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Otel bazlı kahvaltı fiyatları</Text>
      <Text style={styles.subtitle}>
        Her partner otel için ayrı kişi başı ücret tanımlayın. Varsayılan:{' '}
        {defaultPrice > 0 ? fmtPartnerMoney(defaultPrice) : '—'} / kişi
      </Text>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/admin/breakfast-partners/settings')}>
        <Ionicons name="settings-outline" size={18} color={partnerTheme.accent} />
        <Text style={styles.linkText}>Varsayılan fiyatı düzenle</Text>
      </TouchableOpacity>

      {loading || !orgId ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <PartnerHotelPriceEditor
          key={editorKey}
          organizationId={orgId}
          defaultUnitPrice={defaultPrice}
          onSaved={() => setEditorKey((k) => k + 1)}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: partnerTheme.text },
  title: { color: partnerTheme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: partnerTheme.muted, marginTop: 4, marginBottom: 12, lineHeight: 20 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  linkText: { color: partnerTheme.accent, fontWeight: '700' },
});
