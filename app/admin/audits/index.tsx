import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import {
  auditScoreColor,
  auditScoreLabel,
  fetchDepartmentLeaderboard,
  fetchRecentAuditSessions,
  type AuditSessionRow,
  type DepartmentLeaderboardRow,
} from '@/lib/audit';
import { monthKey, monthLabelTr } from '@/lib/financeLedger';

const LINKS: { href: Href; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { href: '/admin/audits/new', icon: 'add-circle-outline', label: 'Yeni denetim başlat' },
  { href: '/admin/audits/categories', icon: 'options-outline', label: 'Bölümler & kriterler' },
  { href: '/staff/performance', icon: 'stats-chart-outline', label: 'Puan sistemi panosu' },
];

export default function AuditDashboardScreen() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [ym, setYm] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [departments, setDepartments] = useState<DepartmentLeaderboardRow[]>([]);
  const [recent, setRecent] = useState<AuditSessionRow[]>([]);

  const orgFilter = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId;
    }
    return me?.organization_id ?? null;
  }, [me, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgFilter || orgFilter === 'all') {
      setDepartments([]);
      setRecent([]);
      setLoading(false);
      return;
    }
    const [lb, rec] = await Promise.all([
      fetchDepartmentLeaderboard(orgFilter, ym),
      fetchRecentAuditSessions(orgFilter, 12),
    ]);
    setDepartments(lb.departments);
    setRecent(rec.data);
    setLoading(false);
  }, [orgFilter, ym]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYm(monthKey(d));
    setLoading(true);
    setTimeout(() => load(), 0);
  };

  const orgAvg = useMemo(() => {
    const scored = departments.filter((d) => d.avg_score != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((s, d) => s + (d.avg_score ?? 0), 0) / scored.length);
  }, [departments]);

  const best = departments.find((d) => d.rank === 1);
  const worst = departments.length ? departments[departments.length - 1] : null;

  if (!orgFilter || orgFilter === 'all') {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard>
          <Text style={styles.muted}>Denetim panosu için üstten bir işletme seçin.</Text>
        </AdminCard>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <AdminOrganizationPicker
        canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
        ownOrganizationId={me?.organization_id}
      />

      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthBtn}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthLabelTr(ym)}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthBtn}>
          <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginVertical: 32 }} color={adminTheme.colors.accent} />
      ) : (
        <>
          <View style={styles.summaryRow}>
            <AdminCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Ortalama</Text>
              <Text style={[styles.summaryValue, { color: auditScoreColor(orgAvg) }]}>
                {orgAvg != null ? auditScoreLabel(orgAvg) : '—'}
              </Text>
            </AdminCard>
            <AdminCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>1. sıra</Text>
              <Text style={styles.summaryValueSmall} numberOfLines={1}>
                {best?.name ?? '—'}
              </Text>
              {best?.avg_score != null ? (
                <Text style={{ color: auditScoreColor(best.avg_score), fontWeight: '700' }}>
                  {auditScoreLabel(best.avg_score)}
                </Text>
              ) : null}
            </AdminCard>
            <AdminCard style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Dikkat</Text>
              <Text style={styles.summaryValueSmall} numberOfLines={1}>
                {worst?.name ?? '—'}
              </Text>
              {worst?.avg_score != null ? (
                <Text style={{ color: auditScoreColor(worst.avg_score), fontWeight: '700' }}>
                  {auditScoreLabel(worst.avg_score)}
                </Text>
              ) : null}
            </AdminCard>
          </View>

          <Text style={styles.sectionTitle}>Bölüm sıralaması</Text>
          {departments.length === 0 ? (
            <AdminCard>
              <Text style={styles.muted}>Bu ay henüz denetim yok. Yeni denetim başlatın.</Text>
            </AdminCard>
          ) : (
            departments.map((d) => (
              <TouchableOpacity
                key={d.category_id}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({ pathname: '/admin/audits/new', params: { categoryId: d.category_id } })
                }
              >
                <AdminCard style={styles.rankCard}>
                  <View style={styles.rankLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankNum}>{d.rank}</Text>
                    </View>
                    <Ionicons
                      name={(d.icon as keyof typeof Ionicons.glyphMap) ?? 'layers-outline'}
                      size={22}
                      color={adminTheme.colors.primaryMuted}
                      style={{ marginRight: 10 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankName}>{d.name}</Text>
                      <Text style={styles.muted}>
                        {d.audit_count} denetim
                        {d.trend_delta !== 0 ? ` · ${d.trend_delta > 0 ? '+' : ''}${d.trend_delta}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.rankScore, { color: auditScoreColor(d.avg_score) }]}>
                    {d.avg_score != null ? auditScoreLabel(d.avg_score) : '—'}
                  </Text>
                </AdminCard>
              </TouchableOpacity>
            ))
          )}

          <Text style={styles.sectionTitle}>Son denetimler</Text>
          {recent.length === 0 ? (
            <AdminCard>
              <Text style={styles.muted}>Kayıt yok.</Text>
            </AdminCard>
          ) : (
            recent.map((s) => {
              const cat = s.category as { name?: string } | null;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => router.push(`/admin/audits/${s.id}` as Href)}
                  activeOpacity={0.85}
                >
                  <AdminCard style={styles.recentCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rankName}>{cat?.name ?? 'Denetim'}</Text>
                      <Text style={styles.muted}>
                        {new Date(s.conducted_at).toLocaleString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.rankScore, { color: auditScoreColor(s.session_score) }]}>
                      {auditScoreLabel(s.session_score)}
                    </Text>
                  </AdminCard>
                </TouchableOpacity>
              );
            })
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Hızlı işlemler</Text>
      {LINKS.map((l) => (
        <TouchableOpacity key={String(l.href)} onPress={() => router.push(l.href)} activeOpacity={0.85}>
          <AdminCard style={styles.linkCard}>
            <Ionicons name={l.icon} size={22} color={adminTheme.colors.accent} />
            <Text style={styles.linkLabel}>{l.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
          </AdminCard>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 40 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  monthBtn: { padding: 8 },
  monthTitle: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text, minWidth: 140, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 12 },
  summaryLabel: { fontSize: 11, color: adminTheme.colors.textMuted, marginBottom: 4 },
  summaryValue: { fontSize: 22, fontWeight: '800' },
  summaryValueSmall: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  rankCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  rankLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  rankNum: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  rankName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  rankScore: { fontSize: 16, fontWeight: '800' },
  recentCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  muted: { fontSize: 14, color: adminTheme.colors.textMuted },
  linkCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  linkLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
});
