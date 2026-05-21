import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard, AdminOrganizationPicker } from '@/components/admin';
import {
  fetchAuditCategories,
  fetchAuditCriteria,
  upsertAuditCategory,
  upsertAuditCriterion,
  type AuditCategoryRow,
  type AuditCriterionRow,
} from '@/lib/audit';

export default function AuditCategoriesScreen() {
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id ?? null;
  }, [me, selectedOrganizationId]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<AuditCategoryRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [criteriaMap, setCriteriaMap] = useState<Record<string, AuditCriterionRow[]>>({});
  const [newCatName, setNewCatName] = useState('');
  const [newCritTitle, setNewCritTitle] = useState<Record<string, string>>({});
  const [newCritPts, setNewCritPts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) {
      setCategories([]);
      setLoading(false);
      return;
    }
    const { data } = await fetchAuditCategories(orgId);
    setCategories(data);
    setLoading(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const expand = async (catId: string) => {
    if (expandedId === catId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(catId);
    if (!criteriaMap[catId]) {
      const { data, error } = await fetchAuditCriteria(catId, orgId ?? undefined);
      if (error) Alert.alert('Kriterler yüklenemedi', error);
      setCriteriaMap((m) => ({ ...m, [catId]: data }));
    }
  };

  const reloadDefaults = async () => {
    if (!orgId) return;
    const { ensureAuditDefaults } = await import('@/lib/audit');
    const { error } = await ensureAuditDefaults(orgId);
    if (error) Alert.alert('Hata', error);
    else {
      Alert.alert('Tamam', 'Varsayılan bölüm ve kriterler yüklendi.');
      setCriteriaMap({});
      await load();
    }
  };

  const addCategory = async () => {
    if (!orgId || !newCatName.trim()) return;
    const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const { error } = await upsertAuditCategory({ organizationId: orgId, name: newCatName.trim(), slug });
    if (error) Alert.alert('Hata', error);
    else {
      setNewCatName('');
      await load();
    }
  };

  const addCriterion = async (catId: string) => {
    const title = (newCritTitle[catId] ?? '').trim();
    const pts = parseInt(newCritPts[catId] ?? '10', 10);
    if (!title) return;
    const { error } = await upsertAuditCriterion({ categoryId: catId, title, maxPoints: pts || 10 });
    if (error) Alert.alert('Hata', error);
    else {
      setNewCritTitle((t) => ({ ...t, [catId]: '' }));
      const { data } = await fetchAuditCriteria(catId);
      setCriteriaMap((m) => ({ ...m, [catId]: data }));
    }
  };

  if (!orgId) {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <Text style={styles.muted}>İşletme seçin.</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <AdminOrganizationPicker
        canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
        ownOrganizationId={me?.organization_id}
      />

      <Text style={styles.hint}>Mutfak, Reception, Ofis gibi bölümler ve her bölümün puan kriterleri.</Text>
      <AdminButton title="Varsayılan kriterleri yükle" variant="outline" onPress={reloadDefaults} />

      <AdminCard style={styles.addRow}>
        <TextInput
          style={styles.input}
          placeholder="Yeni bölüm adı"
          placeholderTextColor={adminTheme.colors.textMuted}
          value={newCatName}
          onChangeText={setNewCatName}
        />
        <AdminButton title="Ekle" onPress={addCategory} />
      </AdminCard>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={adminTheme.colors.accent} />
      ) : (
        categories.map((c) => (
          <AdminCard key={c.id} style={styles.catCard}>
            <TouchableOpacity style={styles.catHead} onPress={() => expand(c.id)}>
              <Ionicons
                name={(c.icon as keyof typeof Ionicons.glyphMap) ?? 'layers-outline'}
                size={20}
                color={adminTheme.colors.accent}
              />
              <Text style={styles.catName}>{c.name}</Text>
              <Ionicons
                name={expandedId === c.id ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={adminTheme.colors.textMuted}
              />
            </TouchableOpacity>
            {expandedId === c.id ? (
              <View style={styles.critBlock}>
                {(criteriaMap[c.id] ?? []).length === 0 ? (
                  <Text style={styles.muted}>Kriter yok — aşağıdan ekleyin veya panodan varsayılanları yükleyin.</Text>
                ) : null}
                {(criteriaMap[c.id] ?? []).map((cr) => (
                  <View key={cr.id} style={styles.critRow}>
                    <Text style={styles.critTitle}>{cr.title}</Text>
                    <Text style={styles.critPts}>{Number(cr.max_points)} puan</Text>
                  </View>
                ))}
                <View style={styles.addCritRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Kriter adı"
                    placeholderTextColor={adminTheme.colors.textMuted}
                    value={newCritTitle[c.id] ?? ''}
                    onChangeText={(t) => setNewCritTitle((m) => ({ ...m, [c.id]: t }))}
                  />
                  <TextInput
                    style={[styles.input, { width: 56 }]}
                    placeholder="Puan"
                    keyboardType="number-pad"
                    placeholderTextColor={adminTheme.colors.textMuted}
                    value={newCritPts[c.id] ?? ''}
                    onChangeText={(t) => setNewCritPts((m) => ({ ...m, [c.id]: t }))}
                  />
                  <TouchableOpacity onPress={() => addCriterion(c.id)} style={styles.addCritBtn}>
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </AdminCard>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 14, color: adminTheme.colors.textMuted, marginBottom: 12 },
  muted: { color: adminTheme.colors.textMuted },
  addRow: { marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  catCard: { marginBottom: 10 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catName: { flex: 1, fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  critBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: adminTheme.colors.border, paddingTop: 12 },
  critRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  critTitle: { fontSize: 14, color: adminTheme.colors.text },
  critPts: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  addCritRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 8 },
  addCritBtn: {
    backgroundColor: adminTheme.colors.accent,
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
