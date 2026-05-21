import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

type Row = {
  id: string;
  code: string;
  name: string;
  applies_to: string;
  sort_order: number;
};

const APPLIES_LABELS: Record<string, string> = {
  income: 'Gelir',
  expense: 'Gider',
  both: 'Gelir + Gider',
};

export default function AccountingCategoriesScreen() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState('');
  const [appliesTo, setAppliesTo] = useState<'income' | 'expense' | 'both'>('expense');
  const [saving, setSaving] = useState(false);

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgId || orgId === 'all') {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('finance_movement_categories')
      .select('id, code, name, applies_to, sort_order')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('sort_order')
      .order('name');
    setRows(error ? [] : ((data as Row[]) ?? []));
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const addCategory = async () => {
    if (!orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Üstten işletme seçin.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Form', 'Kategori adı girin.');
      return;
    }
    const code =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) || `cat_${Date.now()}`;

    setSaving(true);
    const maxSort = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const { error } = await supabase.from('finance_movement_categories').insert({
      organization_id: orgId,
      code,
      name: name.trim(),
      applies_to: appliesTo,
      sort_order: maxSort + 1,
    });
    setSaving(false);
    if (error) Alert.alert('Hata', error.message);
    else {
      setName('');
      load();
    }
  };

  const seedDefaults = async () => {
    if (!orgId || orgId === 'all') return;
    const { data: org } = await supabase.from('organizations').select('kind').eq('id', orgId).maybeSingle();
    const kind = (org as { kind?: string } | null)?.kind ?? 'general';
    const { error } = await supabase.rpc('seed_finance_categories_for_org', {
      p_org_id: orgId,
      p_kind: kind,
    });
    if (error) Alert.alert('Hata', error.message);
    else load();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
          <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.backHubText}>Muhasebe</Text>
        </TouchableOpacity>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <AdminCard>
          <Text style={styles.cardTitle}>Yeni kategori</Text>
          <TextInput
            style={styles.input}
            placeholder="Örn. İş makinesi, Kira, Hakediş"
            value={name}
            onChangeText={setName}
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <View style={styles.chips}>
            {(['expense', 'income', 'both'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, appliesTo === t && styles.chipOn]}
                onPress={() => setAppliesTo(t)}
              >
                <Text style={[styles.chipText, appliesTo === t && styles.chipTextOn]}>{APPLIES_LABELS[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={addCategory} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.addBtnText}>Kategori ekle</Text>}
          </TouchableOpacity>
          {rows.length === 0 ? (
            <TouchableOpacity style={styles.seedBtn} onPress={seedDefaults}>
              <Text style={styles.seedBtnText}>Varsayılan kategorileri yükle</Text>
            </TouchableOpacity>
          ) : null}
        </AdminCard>

        <Text style={styles.listTitle}>Kategoriler ({rows.length})</Text>
        {rows.map((r) => (
          <AdminCard key={r.id} style={styles.rowCard}>
            <Text style={styles.rowName}>{r.name}</Text>
            <Text style={styles.rowMeta}>
              {APPLIES_LABELS[r.applies_to] ?? r.applies_to} · kod: {r.code}
            </Text>
          </AdminCard>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { fontSize: 12, color: adminTheme.colors.text },
  chipTextOn: { color: '#fff', fontWeight: '600' },
  addBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '700' },
  seedBtn: { marginTop: 12, alignItems: 'center', padding: 10 },
  seedBtnText: { color: adminTheme.colors.primary, fontWeight: '600' },
  listTitle: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 16, marginBottom: 8 },
  rowCard: { marginBottom: 8, padding: 14 },
  rowName: { fontSize: 16, fontWeight: '600' },
  rowMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },
});
