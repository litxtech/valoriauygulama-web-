import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import {
  auditScoreColor,
  auditScoreLabel,
  fetchDepartmentLeaderboard,
  fetchRecentAuditSessions,
  type AuditSessionRow,
  type DepartmentLeaderboardRow,
} from '@/lib/audit';
import { auditDashboardTheme, auditRankMedalColor, auditTrendMeta } from '@/lib/auditDashboardUi';
import { monthKey, monthLabelTr } from '@/lib/financeLedger';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

const QUICK_LINKS: {
  href: Href;
  icon: IonIcon;
  label: string;
  sub: string;
  colors?: [string, string];
  tint?: string;
  tintBg?: string;
  primary?: boolean;
}[] = [
  {
    href: '/admin/audits/new',
    icon: 'add-circle',
    label: 'Yeni denetim',
    sub: 'Bölüm seç, puanla, gönder',
    colors: ['#4c1d95', '#7c3aed'],
    primary: true,
  },
  {
    href: '/admin/audits/categories',
    icon: 'options',
    label: 'Bölümler & kriterler',
    sub: 'Hijyen, soğuk zincir…',
    tint: '#0369a1',
    tintBg: adminTheme.colors.infoLight,
  },
  {
    href: '/admin/performance',
    icon: 'trophy',
    label: 'Ayın en iyi personeli',
    sub: 'Sıralama, puan kaynakları, ödüller',
    tint: '#b45309',
    tintBg: adminTheme.colors.warningLight,
  },
];

function ScoreRing({ score }: { score: number | null | undefined }) {
  const color = auditScoreColor(score);
  const label = auditScoreLabel(score);
  return (
    <View style={[styles.scoreRing, { borderColor: color + '44', backgroundColor: color + '14' }]}>
      <Text style={[styles.scoreRingText, { color }]}>{label}</Text>
    </View>
  );
}

export default function AuditDashboardScreen() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const hydrateSelectedOrganization = useAdminOrgStore((s) => s.hydrateSelectedOrganization);
  const orgHydrated = useAdminOrgStore((s) => s.orgHydrated);
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
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
      void hydrateSelectedOrganization({
        canUseAll,
        ownOrganizationId: me?.organization_id,
      });
    }, [hydrateSelectedOrganization, canUseAll, me?.organization_id])
  );

  useEffect(() => {
    if (canUseAll && !orgHydrated) return;
    setLoading(true);
    load();
  }, [load, orgHydrated, canUseAll]);

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

  const totalAudits = useMemo(() => departments.reduce((s, d) => s + d.audit_count, 0), [departments]);

  const best = departments.find((d) => d.rank === 1);
  const worst = departments.length ? departments[departments.length - 1] : null;

  const renderEmptyOrg = () => (
    <View style={styles.emptyOrg}>
      <LinearGradient colors={auditDashboardTheme.headerGrad} style={styles.emptyOrgHero}>
        <Ionicons name="clipboard-outline" size={40} color="rgba(255,255,255,0.9)" />
        <Text style={styles.emptyOrgTitle}>Denetim panosu</Text>
        <Text style={styles.emptyOrgSub}>Bölüm puanları ve sıralama burada görünür</Text>
      </LinearGradient>
      <View style={styles.bodyPad}>
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <View style={styles.emptyOrgCard}>
          <Ionicons name="business-outline" size={36} color={adminTheme.colors.textMuted} />
          <Text style={styles.emptyOrgMsg}>Devam etmek için üstten bir işletme seçin.</Text>
        </View>
      </View>
    </View>
  );

  if (canUseAll && !orgHydrated) {
    return (
      <View style={styles.hydrateWait}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!orgFilter || orgFilter === 'all') {
    return <ScrollView contentContainerStyle={styles.scrollRoot}>{renderEmptyOrg()}</ScrollView>;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollRoot}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={auditDashboardTheme.headerGrad} style={styles.hero}>
        <View style={styles.heroTop}>
          <View style={styles.heroIconWrap}>
            <Ionicons name="shield-checkmark" size={26} color="#fff" />
          </View>
          <View style={styles.heroTextBlock}>
            <Text style={styles.heroTitle}>Denetim panosu</Text>
            <Text style={styles.heroSub}>Bölüm puanları, sıralama ve son denetimler</Text>
          </View>
        </View>

        <View style={styles.monthPill}>
          <Pressable
            onPress={() => shiftMonth(-1)}
            style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabelTr(ym)}</Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            style={({ pressed }) => [styles.monthNav, pressed && styles.monthNavPressed]}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.bodyPad}>
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <View style={styles.quickBlock}>
          <Pressable
            onPress={() => router.push(QUICK_LINKS[0].href)}
            style={({ pressed }) => [styles.quickHero, pressed && styles.pressed]}
            android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
          >
            <LinearGradient colors={QUICK_LINKS[0].colors!} style={styles.quickHeroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <View style={styles.quickHeroIcon}>
                <Ionicons name={QUICK_LINKS[0].icon} size={28} color="#fff" />
              </View>
              <View style={styles.quickHeroText}>
                <Text style={styles.quickHeroLabel}>{QUICK_LINKS[0].label}</Text>
                <Text style={styles.quickHeroSub}>{QUICK_LINKS[0].sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
            </LinearGradient>
          </Pressable>
          <View style={styles.quickRow}>
            {QUICK_LINKS.slice(1).map((link) => (
              <Pressable
                key={String(link.href)}
                onPress={() => router.push(link.href)}
                style={({ pressed }) => [styles.quickTile, pressed && styles.quickTilePressed]}
              >
                <View style={[styles.quickTileIcon, { backgroundColor: link.tintBg }]}>
                  <Ionicons name={link.icon} size={20} color={link.tint} />
                </View>
                <Text style={styles.quickTileLabel} numberOfLines={1}>
                  {link.label}
                </Text>
                <Text style={styles.quickTileSub} numberOfLines={2}>
                  {link.sub}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={adminTheme.colors.accent} />
            <Text style={styles.loadingText}>Pano yükleniyor…</Text>
          </View>
        ) : (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Ionicons name="pie-chart-outline" size={18} color={auditScoreColor(orgAvg)} />
                <Text style={styles.statLbl}>Ortalama</Text>
                <Text style={[styles.statVal, { color: auditScoreColor(orgAvg) }]}>
                  {orgAvg != null ? auditScoreLabel(orgAvg) : '—'}
                </Text>
              </View>
              <View style={[styles.statCard, styles.statCardInfo]}>
                <Ionicons name="documents-outline" size={18} color={adminTheme.colors.info} />
                <Text style={styles.statLbl}>Denetim</Text>
                <Text style={styles.statVal}>{totalAudits}</Text>
              </View>
              <View style={[styles.statCard, styles.statCardAccent]}>
                <Ionicons name="trophy-outline" size={18} color={adminTheme.colors.accent} />
                <Text style={styles.statLbl}>Lider</Text>
                <Text style={styles.statValSm} numberOfLines={1}>
                  {best?.name ?? '—'}
                </Text>
                {best?.avg_score != null ? (
                  <Text style={[styles.statPts, { color: auditScoreColor(best.avg_score) }]}>
                    {auditScoreLabel(best.avg_score)}
                  </Text>
                ) : null}
              </View>
            </View>

            {worst && worst.rank > 1 ? (
              <View style={styles.attentionBanner}>
                <Ionicons name="alert-circle-outline" size={20} color={adminTheme.colors.warning} />
                <View style={styles.attentionText}>
                  <Text style={styles.attentionTitle}>Dikkat: {worst.name}</Text>
                  <Text style={styles.attentionSub}>
                    {worst.avg_score != null ? auditScoreLabel(worst.avg_score) : 'Puan yok'} · sıra {worst.rank}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Bölüm sıralaması</Text>
              <Text style={styles.sectionCount}>{departments.length} bölüm</Text>
            </View>

            {departments.length === 0 ? (
              <View style={styles.emptySection}>
                <Ionicons name="layers-outline" size={32} color={adminTheme.colors.textMuted} />
                <Text style={styles.emptySectionTitle}>Bu ay denetim yok</Text>
                <Text style={styles.emptySectionSub}>Yeni denetim başlatarak bölümleri puanlayın.</Text>
                <TouchableOpacity
                  style={styles.emptyCta}
                  onPress={() => router.push('/admin/audits/new')}
                  activeOpacity={0.88}
                >
                  <Text style={styles.emptyCtaText}>Denetim başlat</Text>
                </TouchableOpacity>
              </View>
            ) : (
              departments.map((d) => {
                const medal = auditRankMedalColor(d.rank);
                const trend = auditTrendMeta(d.trend_delta);
                const pct = d.avg_score != null ? Math.min(100, Math.max(0, d.avg_score)) : 0;
                const iconName = ((d.icon as IonIcon) || 'layers-outline') as IonIcon;
                return (
                  <Pressable
                    key={d.category_id}
                    onPress={() =>
                      router.push({ pathname: '/admin/audits/new', params: { categoryId: d.category_id } })
                    }
                    style={({ pressed }) => [styles.rankCard, pressed && styles.rankCardPressed]}
                  >
                    <View style={styles.rankTop}>
                      <View
                        style={[
                          styles.rankBadge,
                          medal ? { backgroundColor: medal + '22', borderColor: medal } : null,
                        ]}
                      >
                        <Text style={[styles.rankNum, medal ? { color: medal } : null]}>{d.rank}</Text>
                      </View>
                      <View style={[styles.rankIconWrap, { backgroundColor: adminTheme.colors.surfaceTertiary }]}>
                        <Ionicons name={iconName} size={20} color={adminTheme.colors.primaryMuted} />
                      </View>
                      <View style={styles.rankMeta}>
                        <Text style={styles.rankName}>{d.name}</Text>
                        <Text style={styles.rankSub}>
                          {d.audit_count} denetim
                          <Text style={{ color: trend.color }}>
                            {' '}
                            · {trend.label}
                          </Text>
                        </Text>
                      </View>
                      <ScoreRing score={d.avg_score} />
                    </View>
                    <View style={styles.scoreTrack}>
                      <View
                        style={[
                          styles.scoreFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: auditScoreColor(d.avg_score),
                          },
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })
            )}

            <View style={[styles.sectionHead, { marginTop: 20 }]}>
              <Text style={styles.sectionTitle}>Son denetimler</Text>
              <Text style={styles.sectionCount}>{recent.length} kayıt</Text>
            </View>

            {recent.length === 0 ? (
              <View style={styles.emptySectionCompact}>
                <Text style={styles.muted}>Henüz kayıt yok.</Text>
              </View>
            ) : (
              recent.map((s) => {
                const cat = s.category as { name?: string; icon?: string } | null;
                const iconName = ((cat?.icon as IonIcon) || 'clipboard-outline') as IonIcon;
                const auditor = (s.auditor as { full_name?: string } | null)?.full_name;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => router.push(`/admin/audits/${s.id}` as Href)}
                    style={({ pressed }) => [styles.recentCard, pressed && styles.rankCardPressed]}
                  >
                    <View style={styles.recentIcon}>
                      <Ionicons name={iconName} size={20} color={adminTheme.colors.accent} />
                    </View>
                    <View style={styles.recentBody}>
                      <Text style={styles.recentTitle}>{cat?.name ?? 'Denetim'}</Text>
                      <Text style={styles.recentMeta}>
                        {new Date(s.conducted_at).toLocaleString('tr-TR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {auditor ? ` · ${auditor}` : ''}
                      </Text>
                    </View>
                    <ScoreRing score={s.session_score} />
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  hydrateWait: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  scrollRoot: { paddingBottom: 40 },
  hero: {
    paddingTop: Platform.OS === 'ios' ? 8 : 12,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: auditDashboardTheme.heroAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextBlock: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 4, lineHeight: 18 },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: auditDashboardTheme.heroAccent,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  monthNav: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavPressed: { backgroundColor: 'rgba(255,255,255,0.12)' },
  monthLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    minWidth: 150,
    textAlign: 'center',
  },
  bodyPad: { paddingHorizontal: 16, paddingTop: 14 },
  quickBlock: { gap: 10, marginBottom: 18 },
  quickHero: { borderRadius: 18, overflow: 'hidden', ...adminTheme.shadow.md },
  quickHeroGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  quickHeroIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickHeroText: { flex: 1 },
  quickHeroLabel: { fontSize: 17, fontWeight: '800', color: '#fff' },
  quickHeroSub: { fontSize: 12, color: 'rgba(255,255,255,0.88)', marginTop: 3 },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickTile: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  quickTilePressed: { backgroundColor: adminTheme.colors.surfaceTertiary },
  quickTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickTileLabel: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text },
  quickTileSub: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 15 },
  pressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  loadingText: { fontSize: 14, color: adminTheme.colors.textMuted },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  statCard: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 4,
    ...adminTheme.shadow.sm,
  },
  statCardInfo: { borderColor: adminTheme.colors.info + '33' },
  statCardAccent: { borderColor: adminTheme.colors.accent + '33' },
  statLbl: { fontSize: 10, fontWeight: '700', color: adminTheme.colors.textMuted, textTransform: 'uppercase' },
  statVal: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  statValSm: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text },
  statPts: { fontSize: 12, fontWeight: '700' },
  attentionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.warningLight,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.warning + '33',
  },
  attentionText: { flex: 1 },
  attentionTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  attentionSub: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 2 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  sectionCount: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  rankCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  rankCardPressed: { backgroundColor: adminTheme.colors.surfaceTertiary },
  rankTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  rankIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankMeta: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  rankSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  scoreTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: adminTheme.colors.borderLight,
    marginTop: 12,
    overflow: 'hidden',
  },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreRing: {
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  scoreRingText: { fontSize: 13, fontWeight: '800' },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  recentIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentBody: { flex: 1, minWidth: 0 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  recentMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  emptySection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  emptySectionCompact: {
    padding: 16,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    marginBottom: 8,
  },
  emptySectionTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginTop: 10 },
  emptySectionSub: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 6 },
  emptyCta: {
    marginTop: 16,
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  muted: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center' },
  emptyOrg: { flex: 1 },
  emptyOrgHero: {
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyOrgTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  emptyOrgSub: { fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },
  emptyOrgCard: {
    alignItems: 'center',
    gap: 12,
    padding: 28,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginTop: 8,
  },
  emptyOrgMsg: { fontSize: 15, color: adminTheme.colors.textMuted, textAlign: 'center' },
});
