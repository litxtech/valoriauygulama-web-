import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { adminTheme } from '@/constants/adminTheme';
import { fmtKitchenMoney } from '@/lib/kitchenOps/stockStatus';
import { formatDateShort } from '@/lib/date';

export default function AdminKitchenReportsScreen() {
  const orgScoped = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ revenue: 0, expenses: 0, waste: 0, personnel: 0, topProduct: '-' });

  const load = useCallback(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    let revQ = supabase.from('kitchen_revenues').select('amount').gte('entry_date', weekAgo);
    let expQ = supabase.from('kitchen_expenses').select('amount').gte('entry_date', weekAgo);
    let wasteQ = supabase.from('kitchen_stock_movements').select('quantity, item:kitchen_stock_items(name)').eq('movement_type', 'waste').gte('created_at', weekAgo);
    let perQ = supabase.from('kitchen_personnel_payments').select('amount').gte('entry_date', weekAgo);
    if (orgScoped) {
      revQ = revQ.eq('organization_id', orgScoped);
      expQ = expQ.eq('organization_id', orgScoped);
      wasteQ = wasteQ.eq('organization_id', orgScoped);
      perQ = perQ.eq('organization_id', orgScoped);
    }

    const [{ data: rev }, { data: exp }, { data: waste }, { data: per }] = await Promise.all([revQ, expQ, wasteQ, perQ]);

    const revenue = (rev ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const expenses = (exp ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const personnel = (per ?? []).reduce((s, r) => s + Number(r.amount), 0);
    const wasteQty = (waste ?? []).reduce((s, r) => s + Number(r.quantity), 0);

    setStats({ revenue, expenses, waste: wasteQty, personnel, topProduct: `${wasteQty} birim zayi (7 gün)` });
    setLoading(false);
  }, [orgScoped]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={adminTheme.colors.primary} /></View>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}>
      <Text style={styles.period}>Son 7 gün ({formatDateShort(new Date(Date.now() - 7 * 86400000).toISOString())} — bugün)</Text>

      <View style={styles.card}><Text style={styles.label}>Hasılat</Text><Text style={styles.value}>{fmtKitchenMoney(stats.revenue)}</Text></View>
      <View style={styles.card}><Text style={styles.label}>Gider</Text><Text style={styles.value}>{fmtKitchenMoney(stats.expenses)}</Text></View>
      <View style={styles.card}><Text style={styles.label}>Personel maliyeti</Text><Text style={styles.value}>{fmtKitchenMoney(stats.personnel)}</Text></View>
      <View style={styles.card}><Text style={styles.label}>Fire / Zayi</Text><Text style={styles.value}>{stats.topProduct}</Text></View>
      <View style={[styles.card, styles.netCard]}>
        <Text style={styles.label}>Net (hasilat − gider − personel)</Text>
        <Text style={[styles.value, { color: adminTheme.colors.primary }]}>{fmtKitchenMoney(stats.revenue - stats.expenses - stats.personnel)}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  period: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 16, fontWeight: '600' },
  card: { backgroundColor: adminTheme.colors.surface, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: adminTheme.colors.borderLight },
  netCard: { borderColor: adminTheme.colors.primary, backgroundColor: '#fffbeb' },
  label: { fontSize: 13, color: adminTheme.colors.textMuted, fontWeight: '600' },
  value: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
});
