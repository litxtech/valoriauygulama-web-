import { useEffect, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Alert, Switch } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { adminTheme } from '@/constants/adminTheme';
import { KitchenSaveButton } from '@/components/kitchenOps/KitchenUi';

export default function AdminKitchenOpsSettings() {
  const orgScoped = useAdminOrganizationQueryScope();
  const [cariLimit, setCariLimit] = useState('50000');
  const [receiptAbove, setReceiptAbove] = useState('1000');
  const [sktWarning, setSktWarning] = useState('3');
  const [sktCritical, setSktCritical] = useState('1');
  const [dayCloseRequired, setDayCloseRequired] = useState(true);
  const [doubleApproval, setDoubleApproval] = useState('5000');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!orgScoped) return;
    supabase.from('kitchen_ops_settings').select('*').eq('organization_id', orgScoped).maybeSingle().then(({ data }) => {
      if (!data) return;
      setCariLimit(String(data.cari_debt_limit ?? 50000));
      setReceiptAbove(String(data.receipt_required_above ?? 1000));
      setSktWarning(String(data.skt_warning_days ?? 3));
      setSktCritical(String(data.skt_critical_days ?? 1));
      setDayCloseRequired(data.day_close_required ?? true);
      setDoubleApproval(String(data.double_approval_above ?? 5000));
    });
  }, [orgScoped]);

  const save = async () => {
    if (!orgScoped) {
      Alert.alert('İşletme seçin', 'Ayarları kaydetmek için işletme seçin.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('kitchen_ops_settings').upsert({
        organization_id: orgScoped,
        cari_debt_limit: parseFloat(cariLimit.replace(',', '.')),
        receipt_required_above: parseFloat(receiptAbove.replace(',', '.')),
        skt_warning_days: parseInt(sktWarning, 10),
        skt_critical_days: parseInt(sktCritical, 10),
        day_close_required: dayCloseRequired,
        double_approval_above: parseFloat(doubleApproval.replace(',', '.')),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      Alert.alert('Tamam', 'Ayarlar kaydedildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Cari borç limiti (₺)</Text>
      <TextInput style={styles.input} value={cariLimit} onChangeText={setCariLimit} keyboardType="decimal-pad" />

      <Text style={styles.label}>Fiş zorunlu limit (₺)</Text>
      <TextInput style={styles.input} value={receiptAbove} onChangeText={setReceiptAbove} keyboardType="decimal-pad" />

      <Text style={styles.label}>SKT uyarı (gün)</Text>
      <TextInput style={styles.input} value={sktWarning} onChangeText={setSktWarning} keyboardType="number-pad" />

      <Text style={styles.label}>SKT kritik (gün)</Text>
      <TextInput style={styles.input} value={sktCritical} onChangeText={setSktCritical} keyboardType="number-pad" />

      <Text style={styles.label}>Çift onay limiti (₺)</Text>
      <TextInput style={styles.input} value={doubleApproval} onChangeText={setDoubleApproval} keyboardType="decimal-pad" />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Gün kapatma zorunlu</Text>
        <Switch value={dayCloseRequired} onValueChange={setDayCloseRequired} />
      </View>

      <KitchenSaveButton label="Kaydet" onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: adminTheme.colors.surface, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: adminTheme.colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingVertical: 8 },
  switchLabel: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
});
