import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import {
  fetchStaffPerfCategories,
  fetchStaffPerfCriteria,
  type StaffPerfCategory,
  type StaffPerfCriterion,
} from '@/lib/staffPerfSystem';

export default function StaffPerfCategoriesScreen() {
  const staff = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [categories, setCategories] = useState<StaffPerfCategory[]>([]);
  const [criteriaByCat, setCriteriaByCat] = useState<Record<string, StaffPerfCriterion[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const orgId = useMemo(() => {
    if (staff?.app_permissions?.super_admin === true || staff?.role === 'admin') {
      return selectedOrganizationId && selectedOrganizationId !== 'all'
        ? selectedOrganizationId
        : staff?.organization_id;
    }
    return staff?.organization_id ?? null;
  }, [staff, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const { data } = await fetchStaffPerfCategories(orgId);
    setCategories(data);
    const map: Record<string, StaffPerfCriterion[]> = {};
    await Promise.all(
      data.map(async (c) => {
        const res = await fetchStaffPerfCriteria(c.id);
        map[c.id] = res.data;
      })
    );
    setCriteriaByCat(map);
    setLoading(false);
    setRefreshing(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Text style={styles.intro}>
        10 resmi denetim başlığı. Her madde olay kaydında artı/eksi puan, not, fotoğraf, video,
        kanıt ve imza ile işlenir.
      </Text>
      {categories.map((cat, idx) => (
        <View key={cat.id} style={styles.card}>
          <Text style={styles.catTitle}>
            {idx + 1}. {cat.name}
          </Text>
          {(criteriaByCat[cat.id] ?? []).map((cr) => (
            <View key={cr.id} style={styles.row}>
              <Text style={styles.crit}>{cr.title}</Text>
              <Text
                style={{
                  fontWeight: '800',
                  color: cr.default_delta >= 0 ? '#047857' : '#b91c1c',
                }}
              >
                {cr.default_delta > 0 ? '+' : ''}
                {cr.default_delta}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  intro: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 12, lineHeight: 18 },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catTitle: { fontWeight: '800', fontSize: 15, color: '#0f3d3a', marginBottom: 8 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.border,
  },
  crit: { flex: 1, paddingRight: 8, fontSize: 13, color: adminTheme.colors.text },
});
