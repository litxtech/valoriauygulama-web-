import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveStaffOrganizationScope } from '@/lib/organizationScope';
import { getContractCounts, listManagedContracts } from '@/lib/managedContracts';
import { MANAGED_CONTRACT_STATUSES } from '@/lib/managedContracts/constants';
import { ManagedContractListItem } from '@/components/contracts/ManagedContractListItem';
import { canManageManagedContracts } from '@/lib/staffPermissions';

type NavItem = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  statusKey?: keyof Awaited<ReturnType<typeof getContractCounts>>;
};

const NAV: NavItem[] = [
  { href: '/admin/managed-contracts/list?filter=all', icon: 'documents-outline', title: 'Sözleşmeler', subtitle: 'Tüm kayıtlar' },
  { href: '/admin/managed-contracts/list?filter=draft', icon: 'create-outline', title: 'Taslaklar', subtitle: 'Henüz gönderilmemiş', statusKey: 'draft' },
  { href: '/admin/managed-contracts/list?filter=pending', icon: 'time-outline', title: 'Onay Bekleyenler', subtitle: 'İmza / onay süreci', statusKey: 'pending' },
  { href: '/admin/managed-contracts/list?filter=active', icon: 'checkmark-circle-outline', title: 'Aktif Sözleşmeler', subtitle: 'Yürürlükte', statusKey: 'active' },
  { href: '/admin/managed-contracts/list?filter=expired', icon: 'calendar-outline', title: 'Süresi Dolanlar', subtitle: 'Bitiş tarihi geçmiş', statusKey: 'expired' },
  { href: '/admin/managed-contracts/list?filter=terminated', icon: 'close-circle-outline', title: 'Feshedilenler', subtitle: 'Erken sonlandırılan', statusKey: 'terminated' },
  { href: '/admin/managed-contracts/list?filter=archived', icon: 'archive-outline', title: 'Arşiv', subtitle: 'Kalıcı arşiv', statusKey: 'archived' },
];

export default function ManagedContractsHub() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canManage = canManageManagedContracts(staff);
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const orgScoped = resolveStaffOrganizationScope({
    canUseAll: canUseAllOrganizations,
    selectedOrganizationId,
    ownOrganizationId: staff?.organization_id,
  });

  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ draft: 0, pending: 0, active: 0, expired: 0, terminated: 0, archived: 0 });
  const [recent, setRecent] = useState<Awaited<ReturnType<typeof listManagedContracts>>['data']>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, r] = await Promise.all([
      getContractCounts(orgScoped ?? undefined),
      listManagedContracts({ organizationId: orgScoped, limit: 6 }),
    ]);
    setCounts(c);
    setRecent(r.data);
    setLoading(false);
  }, [orgScoped]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const metrics = useMemo(
    () => [
      { key: 'active', label: 'Aktif', value: counts.active, tone: '#059669' },
      { key: 'pending', label: 'Onay', value: counts.pending, tone: '#d97706' },
      { key: 'draft', label: 'Taslak', value: counts.draft, tone: '#64748b' },
      { key: 'archived', label: 'Arşiv', value: counts.archived, tone: '#475569' },
    ],
    [counts],
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#0c1929', '#1e3a5f', '#0f766e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroKicker}>VALORIA SÖZLEŞME YÖNETİMİ</Text>
        <Text style={styles.heroTitle}>İş ortakları, mutfak, personel ve taşeron sözleşmeleri</Text>
        <Text style={styles.heroSub}>Taraflar, tarihler ve metin tamamen özelleştirilebilir · imza · PDF · arşiv</Text>
        {canManage ? (
          <TouchableOpacity style={styles.primaryCta} activeOpacity={0.9} onPress={() => router.push('/admin/managed-contracts/new' as never)}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.primaryCtaText}>Yeni sözleşme</Text>
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
            {item.statusKey != null && counts[item.statusKey] > 0 ? (
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
        <Text style={styles.empty}>Henüz sözleşme yok.</Text>
      ) : (
        recent.map((item) => (
          <ManagedContractListItem key={item.id} item={item} onPress={() => router.push(`/admin/managed-contracts/${item.id}` as never)} />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  hero: {
    borderRadius: adminTheme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    ...((Platform.OS === 'ios' ? adminTheme.shadow.sm : { elevation: 3 }) as ViewStyle),
  },
  heroKicker: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.72)', letterSpacing: 1.2 },
  heroTitle: { marginTop: 8, fontSize: 17, fontWeight: '900', color: '#fff' },
  heroSub: { marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.78)' },
  primaryCta: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  primaryCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  orgPickerWrap: { marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  metricCard: {
    width: '48%',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  metricLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  metricValue: { marginTop: 4, fontSize: 22, fontWeight: '900' },
  sectionHead: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '900', color: adminTheme.colors.text },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 16, minHeight: 56 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  rowSub: { marginTop: 2, fontSize: 12, color: adminTheme.colors.textMuted },
  badge: { backgroundColor: adminTheme.colors.error, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, marginRight: 6 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  recentTitle: { marginTop: 16, marginBottom: 8, fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  empty: { fontSize: 13, color: adminTheme.colors.textMuted, paddingVertical: 8 },
});
