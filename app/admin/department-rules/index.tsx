import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { getRuleCounts, listDepartmentRules } from '@/lib/departmentRules';
import { DepartmentRuleListItem } from '@/components/departmentRules/DepartmentRuleListItem';
import { canCreateDepartmentRules } from '@/lib/staffPermissions';

type NavItem = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  statusKey?: string;
};

const NAV: NavItem[] = [
  { href: '/admin/department-rules/list?filter=all', icon: 'documents-outline', title: 'Tüm kurallar', subtitle: 'Liste görünümü' },
  { href: '/admin/department-rules/list?filter=published', icon: 'checkmark-circle-outline', title: 'Aktif kurallar', subtitle: 'Yayında olanlar', statusKey: 'published' },
  { href: '/admin/department-rules/list?filter=draft', icon: 'create-outline', title: 'Taslaklar', subtitle: 'Henüz yayınlanmamış', statusKey: 'draft' },
  { href: '/admin/department-rules/list?filter=scheduled', icon: 'calendar-outline', title: 'Planlanan', subtitle: 'Tarih seçilmiş yayın', statusKey: 'scheduled' },
  { href: '/admin/department-rules/list?filter=expired', icon: 'time-outline', title: 'Süresi dolanlar', subtitle: 'Geçerliliği bitmiş', statusKey: 'expired' },
  { href: '/admin/department-rules/list?filter=archived', icon: 'archive-outline', title: 'Arşiv', subtitle: 'Arşivlenmiş kurallar', statusKey: 'archived' },
];

export default function DepartmentRulesHub() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canCreate = canCreateDepartmentRules(staff);
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped = resolveStaffOrganizationScope({
    canUseAll: canUseAllOrganizations,
    selectedOrganizationId,
    ownOrganizationId: staff?.organization_id,
  });

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof listDepartmentRules>>['data']>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r] = await Promise.all([
      getRuleCounts(orgScoped ?? undefined),
      listDepartmentRules({ organizationId: orgScoped, limit: 6 }),
    ]);
    setCounts(c as Record<string, number>);
    setRecent(r.data);
    setLoading(false);
  }, [orgScoped]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const metrics = useMemo(
    () => [
      { key: 'published', label: 'Aktif', value: counts.published ?? 0, tone: '#059669' },
      { key: 'draft', label: 'Taslak', value: counts.draft ?? 0, tone: '#64748b' },
      { key: 'scheduled', label: 'Planlı', value: counts.scheduled ?? 0, tone: '#2563eb' },
      { key: 'expired', label: 'Süresi doldu', value: counts.expired ?? 0, tone: '#dc2626' },
    ],
    [counts],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#0c1929', '#134e4a', '#0f766e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroKicker}>VALORIA · BÖLÜM KURALLARI</Text>
        <Text style={styles.heroTitle}>Departman kuralları, talimatlar ve prosedürler</Text>
        <Text style={styles.heroSub}>Başlık serbest yazılır · onay takibi · PDF · QR doğrulama · versiyon</Text>
        {canCreate ? (
          <TouchableOpacity style={styles.primaryCta} activeOpacity={0.9} onPress={() => router.push('/admin/department-rules/new' as never)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.primaryCtaText}>Yeni kural oluştur</Text>
          </TouchableOpacity>
        ) : null}
      </LinearGradient>

      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />
      </View>

      <View style={styles.grid}>
        {metrics.map((m) => (
          <View key={m.key} style={styles.metricCard}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <Text style={[styles.metricValue, { color: m.tone }]}>{loading ? '—' : m.value}</Text>
          </View>
        ))}
      </View>

      <AdminCard padded={false} elevated>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Modüller</Text>
        </View>
        {NAV.map((item, idx) => (
          <TouchableOpacity
            key={item.href}
            style={[styles.row, idx < NAV.length - 1 && styles.rowBorder]}
            activeOpacity={0.75}
            onPress={() => router.push(item.href as never)}
          >
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={22} color={adminTheme.colors.primaryMuted} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text style={styles.rowSub}>{item.subtitle}</Text>
            </View>
            {item.statusKey && (counts[item.statusKey] ?? 0) > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{counts[item.statusKey]}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        ))}
      </AdminCard>

      <Text style={styles.recentTitle}>Son güncellenenler</Text>
      {loading ? (
        <ActivityIndicator color={adminTheme.colors.accent} style={{ marginTop: 12 }} />
      ) : recent.length === 0 ? (
        <Text style={styles.empty}>Henüz kural yok.</Text>
      ) : (
        recent.map((item) => (
          <DepartmentRuleListItem key={item.id} item={item} onPress={() => router.push(`/admin/department-rules/${item.id}` as never)} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { paddingBottom: 32 },
  hero: { padding: 24, paddingTop: 20, marginBottom: 0 },
  heroKicker: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.75)', letterSpacing: 1.2 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 8, lineHeight: 28 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 8, lineHeight: 19 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  primaryCtaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  orgPickerWrap: { paddingHorizontal: 20, paddingTop: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 20, paddingVertical: 16 },
  metricCard: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  metricLabel: { fontSize: 12, color: adminTheme.colors.textMuted },
  metricValue: { fontSize: 24, fontWeight: '900', marginTop: 4 },
  sectionHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: adminTheme.colors.border },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  rowSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  badge: { backgroundColor: adminTheme.colors.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginRight: 4 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  recentTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, paddingHorizontal: 20, marginTop: 8 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 16, paddingHorizontal: 20 },
});
