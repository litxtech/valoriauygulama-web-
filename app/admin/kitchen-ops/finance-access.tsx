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
  fetchKitchenFinanceStaffIds,
  saveKitchenFinanceStaffIds,
} from '@/lib/kitchenOps/financeAccessSettings';

type StaffRow = { id: string; full_name: string | null; role: string; department: string | null };

export default function AdminKitchenFinanceAccessScreen() {
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
      const [{ data: staffData, error: staffErr }, financeIds] = await Promise.all([
        supabase
          .from('staff')
          .select('id, full_name, role, department')
          .eq('organization_id', orgScoped)
          .eq('is_active', true)
          .order('full_name'),
        fetchKitchenFinanceStaffIds(orgScoped),
      ]);
      if (staffErr) {
        Alert.alert('Hata', staffErr.message);
        return;
      }
      setStaffList((staffData ?? []) as StaffRow[]);
      setSelected(new Set(financeIds));
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
      const res = await saveKitchenFinanceStaffIds(orgScoped, [...selected]);
      if (!res.ok) {
        Alert.alert('Hata', res.message);
        return;
      }
      Alert.alert('Kaydedildi', 'Finans paneli erişim listesi güncellendi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      <Text style={styles.hint}>
        Mutfak–resepsiyon finans paneline (hasılat, gider, temiz kalan para) yalnızca seçili personel erişir.
        Tüm mutfakçılar otomatik erişemez. Resepsiyon yetkilileri ve admin her zaman erişebilir.
      </Text>
      {loading ? (
        <ActivityIndicator color={T.colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={staffList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name || '—'}</Text>
                <Text style={styles.role}>
                  {item.role}
                  {item.department ? ` · ${item.department}` : ''}
                </Text>
              </View>
              <Switch value={selected.has(item.id)} onValueChange={() => toggle(item.id)} />
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Bu işletmede aktif personel yok.</Text>}
        />
      )}
      <AdminButton
        title={saving ? 'Kaydediliyor…' : 'Kaydet'}
        onPress={() => void save()}
        disabled={saving || loading || !orgScoped}
        fullWidth
      />
    </View>
  );
}

const T = adminTheme;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: T.colors.surfaceSecondary, padding: 16, gap: 10 },
  hint: { fontSize: 13, color: T.colors.textMuted, lineHeight: 18 },
  list: { paddingBottom: 12, gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.colors.border,
    padding: 12,
    marginBottom: 6,
  },
  name: { fontSize: 15, fontWeight: '700', color: T.colors.text },
  role: { fontSize: 12, color: T.colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: T.colors.textMuted, marginTop: 32 },
});
