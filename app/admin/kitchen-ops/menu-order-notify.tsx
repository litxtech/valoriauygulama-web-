import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  fetchKitchenMenuOrderNotifyStaffIds,
  saveKitchenMenuOrderNotifyStaffIds,
} from '@/lib/kitchenOps/menuOrderNotifySettings';

type StaffRow = { id: string; full_name: string | null; role: string };

export default function AdminKitchenMenuOrderNotifyScreen() {
  const T = adminTheme;
  const { staff, canUseAll, canQuery, orgScoped } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: staffData, error: staffErr }, notifyIds] = await Promise.all([
        supabase
          .from('staff')
          .select('id, full_name, role')
          .eq('organization_id', orgScoped)
          .eq('is_active', true)
          .order('full_name'),
        fetchKitchenMenuOrderNotifyStaffIds(orgScoped),
      ]);
      if (staffErr) {
        Alert.alert('Hata', staffErr.message);
        return;
      }
      setStaffList((staffData ?? []) as StaffRow[]);
      setSelected(new Set(notifyIds));
    } finally {
      setLoading(false);
    }
  }, [canQuery, orgScoped]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!orgScoped) {
      Alert.alert('Hata', 'İşletme seçin.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveKitchenMenuOrderNotifyStaffIds(orgScoped, [...selected]);
      if (!res.ok) {
        Alert.alert('Hata', res.message);
        return;
      }
      Alert.alert('Kaydedildi', 'Menü sipariş bildirimi alıcıları güncellendi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      <Text style={styles.hint}>
        QR menüden ödeme tamamlandığında bildirim yalnızca seçili mutfak personeline gider (uygulama içi +
        push). Şef ve mutfak ekibini buradan seçin. Hiç seçim yoksa bildirim gönderilmez.
      </Text>
      {loading ? (
        <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={staffList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name ?? '—'}</Text>
                <Text style={styles.role}>{item.role}</Text>
              </View>
              <Switch value={selected.has(item.id)} onValueChange={() => toggle(item.id)} />
            </View>
          )}
        />
      )}
      <AdminButton label="Kaydet" onPress={() => void save()} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary, padding: 16 },
  hint: { fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 20, marginBottom: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  name: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  role: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2, textTransform: 'capitalize' },
});
