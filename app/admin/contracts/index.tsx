import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';

type Template = {
  id: string;
  lang: string;
  version: number;
  title: string;
  is_active: boolean;
};

const H_PAD = 20;

const LANG_LABELS: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
  ar: 'Arapça',
  de: 'Almanca',
  fr: 'Fransızca',
  ru: 'Rusça',
  es: 'İspanyolca',
};

type NavRow = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  badge?: number;
};

type SectionDef = { id: string; title: string; subtitle?: string; rows: NavRow[] };

const SECTIONS: SectionDef[] = [
  {
    id: 'ops',
    title: 'Günlük işler',
    subtitle: 'Onaylar, arşiv ve misafir iletişimi',
    rows: [
      {
        href: '/admin/contracts/acceptances',
        icon: 'checkmark-done-outline',
        title: 'Son onaylar',
        subtitle: 'Listeyi güncelle, personele ata, PDF',
      },
      {
        href: '/admin/contracts/all',
        icon: 'calendar-outline',
        title: 'Tarih aralığı ile arşiv',
        subtitle: 'Son 30 gün vb. filtreleyerek tüm onayları görün',
      },
      {
        href: '/admin/contracts/contact-directory',
        icon: 'call-outline',
        title: 'İletişim rehberi',
        subtitle: 'Misafir / oda iletişim bilgileri',
      },
    ],
  },
  {
    id: 'content',
    title: 'Metin ve kurallar',
    subtitle: 'Misafirin gördüğü sözleşme içeriği',
    rows: [
      {
        href: '/admin/contracts/rules',
        icon: 'list-outline',
        title: 'Konaklama kuralları',
        subtitle: 'Genel kurallar metni',
      },
    ],
  },
  {
    id: 'setup',
    title: 'Bağlantı ve görünüm',
    subtitle: 'QR, PDF tasarımı ve form alanları',
    rows: [
      {
        href: '/admin/contracts/settings',
        icon: 'qr-code-outline',
        title: 'QR ve mağaza bağlantıları',
        subtitle: 'Uygulama indirme / yönlendirme',
      },
      {
        href: '/admin/contracts/design',
        icon: 'color-palette-outline',
        title: 'PDF / yazdırma görünümü',
        subtitle: 'Logo, renkler, çıktı düzeni',
      },
      {
        href: '/admin/contracts/form-fields',
        icon: 'reader-outline',
        title: 'Form alanları',
        subtitle: 'Check-in’de hangi bilgiler istenecek',
      },
    ],
  },
];

function NavRowButton({
  row,
  onPress,
}: {
  row: NavRow;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.navIconWrap}>
        <Ionicons name={row.icon} size={22} color={adminTheme.colors.primary} />
      </View>
      <View style={styles.navTextWrap}>
        <View style={styles.navTitleRow}>
          <Text style={styles.navTitle}>{row.title}</Text>
          {row.badge != null && row.badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{row.badge > 99 ? '99+' : row.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.navSubtitle}>{row.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function ContractsHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const canUseAllOrganizations = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [templateQuery, setTemplateQuery] = useState('');
  const [stats, setStats] = useState({ unassigned: 0, last7: 0, activeTemplates: 0 });

  const headerPaddingTop = Platform.OS === 'ios' ? insets.top : insets.top + 8;

  const load = useCallback(async () => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fromIso = weekAgo.toISOString();
    const orgId = canUseAllOrganizations ? selectedOrganizationId : staff?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;

    let unassignedQuery = supabase
      .from('contract_acceptances')
      .select('id', { count: 'exact', head: true })
      .is('assigned_staff_id', null);
    let weekQuery = supabase.from('contract_acceptances').select('id', { count: 'exact', head: true }).gte('accepted_at', fromIso);
    if (orgScoped) {
      unassignedQuery = unassignedQuery.eq('organization_id', orgScoped);
      weekQuery = weekQuery.eq('organization_id', orgScoped);
    }

    const [tplRes, unassignedRes, weekRes] = await Promise.all([
      supabase.from('contract_templates').select('id, lang, version, title, is_active').order('lang'),
      unassignedQuery,
      weekQuery,
    ]);

    setTemplates((tplRes.data as Template[]) ?? []);
    setStats({
      unassigned: unassignedRes.count ?? 0,
      last7: weekRes.count ?? 0,
      activeTemplates: ((tplRes.data as Template[]) ?? []).filter((t) => t.is_active).length,
    });
  }, [canUseAllOrganizations, selectedOrganizationId, staff?.organization_id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const sectionsWithBadges = useMemo(() => {
    return SECTIONS.map((sec) => {
      if (sec.id !== 'ops') return sec;
      return {
        ...sec,
        rows: sec.rows.map((r) =>
          r.href === '/admin/contracts/acceptances' ? { ...r, badge: stats.unassigned } : r
        ),
      };
    });
  }, [stats.unassigned]);

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.lang.toLowerCase().includes(q) ||
        (LANG_LABELS[t.lang] ?? '').toLowerCase().includes(q)
    );
  }, [templates, templateQuery]);

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: headerPaddingTop }]}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        <Text style={styles.loadingText}>Yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.headerBack}
            onPress={() => router.back()}
            activeOpacity={0.8}
            accessibilityLabel="Geri"
          >
            <Ionicons name="arrow-back" size={24} color={adminTheme.colors.surface} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Sözleşmeler</Text>
            <Text style={styles.headerSub}>
              {templates.length} dil şablonu · son 7 günde {stats.last7} onay
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerAction}
            onPress={() => router.push('/admin')}
            activeOpacity={0.8}
            accessibilityLabel="Ana sayfa"
          >
            <Ionicons name="home-outline" size={22} color={adminTheme.colors.surface} />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAllOrganizations} ownOrganizationId={staff?.organization_id} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 28 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.last7}</Text>
            <Text style={styles.statLabel}>Onay (7 gün)</Text>
          </View>
          <View style={[styles.statCard, stats.unassigned > 0 && styles.statCardWarn]}>
            <Text style={[styles.statValue, stats.unassigned > 0 && styles.statValueWarn]}>{stats.unassigned}</Text>
            <Text style={styles.statLabel}>Personele atanmamış</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.activeTemplates}</Text>
            <Text style={styles.statLabel}>Aktif şablon</Text>
          </View>
        </View>

        {sectionsWithBadges.map((section) => (
          <View key={section.id} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.subtitle ? <Text style={styles.sectionSubtitle}>{section.subtitle}</Text> : null}
            <View style={styles.card}>
              {section.rows.map((row, i) => (
                <View key={row.href}>
                  {i > 0 ? <View style={styles.rowSep} /> : null}
                  <NavRowButton row={row} onPress={() => router.push(row.href)} />
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dil şablonları</Text>
          <Text style={styles.sectionSubtitle}>Her dil için metin düzenleme — misafir uygulamasında gösterilir</Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={20} color={adminTheme.colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Dil veya başlık ara…"
              placeholderTextColor={adminTheme.colors.textMuted}
              value={templateQuery}
              onChangeText={setTemplateQuery}
            />
            {templateQuery.length > 0 ? (
              <TouchableOpacity onPress={() => setTemplateQuery('')} hitSlop={12} style={styles.searchClear}>
                <Ionicons name="close-circle" size={20} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          {filteredTemplates.length === 0 ? (
            <Text style={styles.emptyTemplates}>Eşleşen şablon yok.</Text>
          ) : (
            <View style={styles.card}>
              {filteredTemplates.map((item, i) => (
                <View key={item.id}>
                  {i > 0 ? <View style={styles.rowSep} /> : null}
                  <TouchableOpacity
                    style={styles.navRow}
                    onPress={() => router.push(`/admin/contracts/contract/${item.lang}`)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.navIconWrap}>
                      <Ionicons name="document-text-outline" size={22} color={adminTheme.colors.primary} />
                    </View>
                    <View style={styles.navTextWrap}>
                      <Text style={styles.navTitle}>{item.title}</Text>
                      <Text style={styles.navSubtitle}>
                        {LANG_LABELS[item.lang] ?? item.lang} · sürüm {item.version}
                        {item.is_active ? '' : ' · pasif'}
                      </Text>
                    </View>
                    {item.is_active ? (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>Aktif</Text>
                      </View>
                    ) : (
                      <View style={styles.inactivePill}>
                        <Text style={styles.inactivePillText}>Pasif</Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  loadingText: { marginTop: 12, color: adminTheme.colors.textSecondary, fontSize: 15 },
  header: {
    backgroundColor: adminTheme.colors.primary,
    paddingBottom: adminTheme.spacing.lg,
    paddingHorizontal: adminTheme.spacing.lg,
    ...adminTheme.shadow.md,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, marginHorizontal: 12 },
  headerTitle: { color: adminTheme.colors.surface, fontSize: 20, fontWeight: '700' },
  headerSub: { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 4 },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgPickerWrap: {
    paddingHorizontal: H_PAD,
    paddingTop: 10,
  },
  scrollContent: { paddingHorizontal: H_PAD, paddingTop: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  statCardWarn: { borderColor: adminTheme.colors.accentLight, backgroundColor: adminTheme.colors.warningLight },
  statValue: { fontSize: 20, fontWeight: '700', color: adminTheme.colors.text },
  statValueWarn: { color: adminTheme.colors.accent },
  statLabel: { fontSize: 11, color: adminTheme.colors.textSecondary, textAlign: 'center', marginTop: 4 },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 4 },
  sectionSubtitle: { fontSize: 13, color: adminTheme.colors.textMuted, marginBottom: 10, lineHeight: 18 },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    overflow: 'hidden',
  },
  rowSep: { height: 1, backgroundColor: adminTheme.colors.borderLight, marginLeft: 58 },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  navTextWrap: { flex: 1, minWidth: 0 },
  navTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navTitle: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text },
  navSubtitle: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 3, lineHeight: 18 },
  badge: {
    backgroundColor: adminTheme.colors.error,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: adminTheme.colors.text, paddingVertical: 10 },
  searchClear: { padding: 4 },
  emptyTemplates: { color: adminTheme.colors.textMuted, fontSize: 14, paddingVertical: 8 },
  activePill: {
    backgroundColor: adminTheme.colors.successLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  activePillText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.success },
  inactivePill: {
    backgroundColor: adminTheme.colors.surfaceTertiary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 6,
  },
  inactivePillText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
});
