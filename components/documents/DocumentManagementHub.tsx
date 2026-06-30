import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useAuthStore } from '@/stores/authStore';
import { canAccessDocumentManagement } from '@/lib/staffPermissions';
import { supabase } from '@/lib/supabase';
import {
  DOC_HUB_SECTIONS,
  DOC_HUB_TAGLINE,
  type DocCountKey,
  type DocHubItem,
} from '@/constants/documentManagementCopy';
import { DOC_ACCENT_STYLES, docTheme } from '@/constants/documentManagementTheme';
import type { DocumentsBasePath } from '@/lib/documentManagementRoutes';

type Counts = Record<DocCountKey, number>;

type Props = {
  basePath: DocumentsBasePath;
  showRecent?: boolean;
};

function HubRow({
  item,
  href,
  count,
  loading,
}: {
  item: DocHubItem;
  href: string;
  count?: number;
  loading: boolean;
}) {
  const router = useRouter();
  const accent = item.accent ? DOC_ACCENT_STYLES[item.accent] : DOC_ACCENT_STYLES.indigo;
  const showBadge = item.countKey != null && !loading && (count ?? 0) > 0;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.85} onPress={() => router.push(href as never)}>
      <View style={[styles.rowIcon, { backgroundColor: accent.bg }]}>
        <Ionicons name={item.icon} size={20} color={accent.fg} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleRow}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          {showBadge ? (
            <View style={[styles.badge, { backgroundColor: accent.badge }]}>
              <Text style={styles.badgeText}>{count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowDesc}>{item.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={docTheme.textSoft} />
    </TouchableOpacity>
  );
}

export function DocumentManagementHub({ basePath, showRecent = false }: Props) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({
    totalActive: 0,
    pendingApprovals: 0,
    expiringSoon: 0,
    expired: 0,
    archived: 0,
  });
  const [recent, setRecent] = useState<Array<{ id: string; title: string; updated_at: string; status: string | null }>>(
    []
  );

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const queries = [
      supabase.from('documents').select('id', { count: 'exact', head: true }).is('archived_at', null),
      supabase.from('document_approvals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .not('expiry_date', 'is', null)
        .gte('expiry_date', todayStr)
        .lte('expiry_date', in30),
      supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .is('archived_at', null)
        .not('expiry_date', 'is', null)
        .lt('expiry_date', todayStr),
      supabase.from('documents').select('id', { count: 'exact', head: true }).not('archived_at', 'is', null),
    ] as const;

    if (showRecent) {
      const [totalActiveRes, pendingRes, expiringRes, expiredRes, archivedRes, recentRes] = await Promise.all([
        ...queries,
        supabase.from('documents').select('id, title, updated_at, status').order('updated_at', { ascending: false }).limit(5),
      ]);
      setCounts({
        totalActive: totalActiveRes.count ?? 0,
        pendingApprovals: pendingRes.count ?? 0,
        expiringSoon: expiringRes.count ?? 0,
        expired: expiredRes.count ?? 0,
        archived: archivedRes.count ?? 0,
      });
      if (!recentRes.error && recentRes.data) setRecent(recentRes.data as typeof recent);
    } else {
      const [totalActiveRes, pendingRes, expiringRes, expiredRes, archivedRes] = await Promise.all(queries);
      setCounts({
        totalActive: totalActiveRes.count ?? 0,
        pendingApprovals: pendingRes.count ?? 0,
        expiringSoon: expiringRes.count ?? 0,
        expired: expiredRes.count ?? 0,
        archived: archivedRes.count ?? 0,
      });
    }
    setLoading(false);
  }, [showRecent]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const urgentTotal = useMemo(
    () => counts.pendingApprovals + counts.expiringSoon + counts.expired,
    [counts]
  );

  if (!canAccessDocumentManagement(staff)) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={44} color={docTheme.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedSub}>Doküman yükleme ve yönetim yetkiniz bulunmuyor.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>Doküman yönetimi</Text>
        <Text style={styles.heroText}>{DOC_HUB_TAGLINE}</Text>

        <View style={styles.heroActions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.9}
            onPress={() => router.push(`${basePath}/new` as never)}
          >
            <Ionicons name="cloud-upload-outline" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>Belge yükle</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.refreshBtn} activeOpacity={0.85} onPress={() => void load()}>
            {loading ? (
              <ActivityIndicator color={docTheme.accent} size="small" />
            ) : (
              <Ionicons name="refresh-outline" size={20} color={docTheme.accent} />
            )}
          </TouchableOpacity>
        </View>

        {!loading && urgentTotal > 0 ? (
          <View style={styles.alertBanner}>
            <Ionicons name="notifications-outline" size={16} color={docTheme.amber} />
            <Text style={styles.alertText}>
              {urgentTotal} belge onay veya süre takibi bekliyor
            </Text>
          </View>
        ) : null}
      </View>

      {showRecent && recent.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Son güncellenenler</Text>
            <TouchableOpacity onPress={() => router.push(`${basePath}/all` as never)}>
              <Text style={styles.sectionLink}>Tümü</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            {recent.map((r, idx) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.recentRow, idx < recent.length - 1 && styles.rowBorder]}
                onPress={() => router.push(`${basePath}/${r.id}` as never)}
              >
                <Ionicons name="document-text-outline" size={18} color={docTheme.accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.recentTitle} numberOfLines={1}>
                    {r.title}
                  </Text>
                  <Text style={styles.recentMeta} numberOfLines={1}>
                    {new Date(r.updated_at).toLocaleString('tr-TR')} · {r.status ?? '—'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {DOC_HUB_SECTIONS.map((section) => (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          <Text style={styles.sectionSub}>{section.subtitle}</Text>
          <View style={styles.card}>
            {section.items.map((item, idx) => (
              <View key={item.key}>
                <HubRow
                  item={item}
                  href={`${basePath}/${item.suffix}`}
                  count={item.countKey ? counts[item.countKey] : undefined}
                  loading={loading}
                />
                {idx < section.items.length - 1 ? <View style={styles.divider} /> : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: docTheme.bg },
  content: { padding: 16, paddingBottom: 28 },
  denied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: docTheme.bg,
    gap: 8,
  },
  deniedTitle: { fontSize: 18, fontWeight: '800', color: docTheme.text },
  deniedSub: { fontSize: 14, color: docTheme.textMuted, textAlign: 'center', lineHeight: 20 },
  hero: {
    backgroundColor: docTheme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: docTheme.border,
    padding: 16,
    marginBottom: 18,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: docTheme.accent,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroText: { marginTop: 8, fontSize: 15, color: docTheme.textSecondary, lineHeight: 22 },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: docTheme.accent,
    borderRadius: 12,
    paddingVertical: 12,
  },
  primaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: docTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: docTheme.cardMuted,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: docTheme.amberSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertText: { flex: 1, fontSize: 12, fontWeight: '700', color: docTheme.amber },
  section: { marginBottom: 16 },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: docTheme.text },
  sectionSub: { fontSize: 12, color: docTheme.textMuted, marginBottom: 8, marginTop: 2 },
  sectionLink: { fontSize: 12, fontWeight: '700', color: docTheme.accent },
  card: {
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: docTheme.border },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: docTheme.border, marginLeft: 66 },
  rowIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: docTheme.text },
  rowDesc: { fontSize: 12, color: docTheme.textMuted, lineHeight: 17 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: docTheme.text },
  recentMeta: { fontSize: 11, color: docTheme.textMuted, marginTop: 2 },
});
