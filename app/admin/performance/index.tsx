import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { auditScoreColor, auditScoreLabel } from '@/lib/audit';
import { monthKey, monthLabelTr } from '@/lib/financeLedger';
import {
  fetchStaffPerformanceBoard,
  performanceSourceRows,
  type PerformanceBoardStaffRow,
  type StaffPerformanceBoard,
} from '@/lib/staffPerformanceBoard';
import { auditRankMedalColor } from '@/lib/auditDashboardUi';

const HERO_GRAD: [string, string, string] = ['#7c2d12', '#ea580c', '#fbbf24'];
const WINNER_GRAD: [string, string] = ['#fef3c7', '#fde68a'];

function StaffBoardCard({
  row,
  weights,
  threshold,
  onPress,
}: {
  row: PerformanceBoardStaffRow;
  weights: StaffPerformanceBoard['weights'];
  threshold: number;
  onPress: () => void;
}) {
  const medal = auditRankMedalColor(row.rank);
  const sources = performanceSourceRows(row, weights);
  const name = row.full_name?.trim() || 'Personel';
  const below = row.evaluation_combined != null && row.evaluation_combined < threshold;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.staffCard, pressed && styles.staffCardPressed]}
    >
      <View style={styles.staffCardTop}>
        <View style={[styles.rankPill, medal ? { backgroundColor: medal + '22', borderColor: medal } : null]}>
          <Text style={[styles.rankPillText, medal ? { color: medal } : null]}>{row.rank}</Text>
        </View>
        {row.profile_image ? (
          <CachedImage uri={row.profile_image} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPh}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.staffMeta}>
          <Text style={styles.staffName} numberOfLines={1}>
            {name}
          </Text>
          {row.department ? (
            <Text style={styles.staffDept} numberOfLines={1}>
              {row.department}
            </Text>
          ) : null}
        </View>
        <View style={[styles.scoreBadge, { borderColor: auditScoreColor(row.evaluation_combined) + '55' }]}>
          <Text style={[styles.scoreBadgeVal, { color: auditScoreColor(row.evaluation_combined) }]}>
            {auditScoreLabel(row.evaluation_combined)}
          </Text>
          <Text style={styles.scoreBadgeLbl}>Birleşik</Text>
        </View>
      </View>

      <Text style={styles.sourceSectionTitle}>Puan nereden geldi?</Text>
      <View style={styles.sourceGrid}>
        {sources.map((src) => (
          <View key={src.key} style={[styles.sourceChip, { borderColor: src.color + '33' }]}>
            <View style={[styles.sourceIcon, { backgroundColor: src.color + '18' }]}>
              <Ionicons
                name={
                  src.icon === 'ribbon'
                    ? 'ribbon'
                    : src.icon === 'clipboard'
                      ? 'clipboard'
                      : 'star'
                }
                size={16}
                color={src.color}
              />
            </View>
            <View style={styles.sourceText}>
              <Text style={styles.sourceLabel}>{src.label}</Text>
              <Text style={styles.sourceDetail} numberOfLines={2}>
                {src.detail}
              </Text>
              <Text style={styles.sourcePts}>
                {src.score != null ? `${src.score} puan` : '—'} · %{src.weight} ağırlık
                {src.weighted != null ? ` → ${src.weighted} katkı` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {row.achievements.length > 0 ? (
        <View style={styles.rewardBlock}>
          <Ionicons name="trophy" size={14} color="#b45309" />
          <Text style={styles.rewardTitle}>Ödül / başarı</Text>
          {row.achievements.map((a, i) => (
            <Text key={`${a}-${i}`} style={styles.rewardItem}>
              · {a}
            </Text>
          ))}
        </View>
      ) : null}

      {below ? (
        <View style={styles.warnRow}>
          <Ionicons name="alert-circle-outline" size={14} color={adminTheme.colors.warning} />
          <Text style={styles.warnText}>Eşik altı ({threshold}) — gelişim planı önerilir</Text>
        </View>
      ) : null}

      <View style={styles.cardFooter}>
        <Text style={styles.cardFooterText}>Detay ve değerlendirme</Text>
        <Ionicons name="chevron-forward" size={16} color={adminTheme.colors.accent} />
      </View>
    </Pressable>
  );
}

export default function StaffPerformanceBoardScreen() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const hydrateSelectedOrganization = useAdminOrgStore((s) => s.hydrateSelectedOrganization);
  const orgHydrated = useAdminOrgStore((s) => s.orgHydrated);
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';

  const [ym, setYm] = useState(monthKey());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [board, setBoard] = useState<StaffPerformanceBoard | null>(null);

  const orgFilter = useMemo(() => {
    if (canUseAll) return selectedOrganizationId;
    return me?.organization_id ?? null;
  }, [me, canUseAll, selectedOrganizationId]);

  const load = useCallback(async () => {
    if (!orgFilter || orgFilter === 'all') {
      setBoard(null);
      setLoading(false);
      return;
    }
    const { data, error } = await fetchStaffPerformanceBoard(orgFilter, ym);
    if (!error) setBoard(data);
    else setBoard(null);
    setLoading(false);
  }, [orgFilter, ym]);

  useFocusEffect(
    useCallback(() => {
      void hydrateSelectedOrganization({ canUseAll, ownOrganizationId: me?.organization_id });
    }, [hydrateSelectedOrganization, canUseAll, me?.organization_id])
  );

  useFocusEffect(
    useCallback(() => {
      if (canUseAll && !orgHydrated) return;
      setLoading(true);
      load();
    }, [load, canUseAll, orgHydrated])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = ym.split('-').map(Number);
    setYm(monthKey(new Date(y, m - 1 + delta, 1)));
    setLoading(true);
  };

  const winner = board?.employee_of_month ?? board?.staff?.[0] ?? null;
  const orgAvg = useMemo(() => {
    const scored = (board?.staff ?? []).filter((s) => s.evaluation_combined != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((n, s) => n + (s.evaluation_combined ?? 0), 0) / scored.length);
  }, [board?.staff]);

  if (canUseAll && !orgHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!orgFilter || orgFilter === 'all') {
    return (
      <ScrollView contentContainerStyle={styles.pad}>
        <LinearGradient colors={HERO_GRAD} style={styles.heroCompact}>
          <Ionicons name="trophy" size={36} color="#fff" />
          <Text style={styles.heroTitle}>Ayın en iyi personeli</Text>
        </LinearGradient>
        <View style={styles.padInner}>
          <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />
          <Text style={styles.hint}>Pano için bir işletme seçin.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.padBottom}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={HERO_GRAD} style={styles.hero}>
        <View style={styles.heroRow}>
          <Ionicons name="trophy" size={32} color="#fff" />
          <View style={styles.heroText}>
            <Text style={styles.heroTitle}>Ayın en iyi personeli</Text>
            <Text style={styles.heroSub}>Tüm puanlar, kaynaklar ve ödüller tek panoda</Text>
          </View>
        </View>
        <View style={styles.monthPill}>
          <Pressable onPress={() => shiftMonth(-1)} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabelTr(ym)}</Text>
          <Pressable onPress={() => shiftMonth(1)} style={styles.monthBtn} hitSlop={8}>
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={styles.body}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />

        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={{ marginVertical: 40 }} />
        ) : !board || board.staff.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={40} color={adminTheme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Henüz personel veya puan yok</Text>
            <Text style={styles.emptySub}>Denetim ve değerlendirmeler tamamlandıkça sıralama oluşur.</Text>
            <Pressable style={styles.emptyCta} onPress={() => router.push('/admin/audits/new' as Href)}>
              <Text style={styles.emptyCtaText}>Denetim başlat</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {winner ? (
              <LinearGradient colors={WINNER_GRAD} style={styles.winnerCard}>
                <View style={styles.winnerBadge}>
                  <Ionicons name="sparkles" size={18} color="#b45309" />
                  <Text style={styles.winnerBadgeText}>Ayın yıldızı</Text>
                </View>
                <Text style={styles.winnerName}>{winner.full_name ?? 'Personel'}</Text>
                <Text style={[styles.winnerScore, { color: auditScoreColor(winner.evaluation_combined) }]}>
                  {auditScoreLabel(winner.evaluation_combined)} birleşik puan
                </Text>
                <Text style={styles.winnerHint}>
                  Yönetim %{board.weights.management} · Denetim %{board.weights.audit} · Misafir %{board.weights.guest}
                </Text>
              </LinearGradient>
            ) : null}

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{board.staff.length}</Text>
                <Text style={styles.statLbl}>Personel</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statVal, { color: auditScoreColor(orgAvg) }]}>
                  {orgAvg != null ? auditScoreLabel(orgAvg) : '—'}
                </Text>
                <Text style={styles.statLbl}>Ortalama</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statVal}>{board.threshold_score}</Text>
                <Text style={styles.statLbl}>Eşik</Text>
              </View>
            </View>

            <Text style={styles.listTitle}>Sıralama — puan kaynakları</Text>
            {board.staff.map((row) => (
              <StaffBoardCard
                key={row.staff_id}
                row={row}
                weights={board.weights}
                threshold={board.threshold_score}
                onPress={() => router.push(`/admin/staff/evaluation/${row.staff_id}` as Href)}
              />
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  pad: { flexGrow: 1 },
  padBottom: { paddingBottom: 32 },
  padInner: { padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  hero: { paddingTop: Platform.OS === 'ios' ? 12 : 16, paddingBottom: 18, paddingHorizontal: 18 },
  heroCompact: { alignItems: 'center', padding: 28, gap: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 14,
    paddingVertical: 4,
  },
  monthBtn: { padding: 10 },
  monthLabel: { fontSize: 16, fontWeight: '800', color: '#fff', minWidth: 140, textAlign: 'center' },
  body: { padding: 16 },
  hint: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 12 },
  winnerCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#fcd34d',
    ...adminTheme.shadow.md,
  },
  winnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  winnerBadgeText: { fontSize: 12, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' },
  winnerName: { fontSize: 22, fontWeight: '800', color: '#78350f' },
  winnerScore: { fontSize: 18, fontWeight: '800', marginTop: 6 },
  winnerHint: { fontSize: 12, color: '#92400e', marginTop: 8 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statVal: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  statLbl: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4, fontWeight: '600' },
  listTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  staffCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...adminTheme.shadow.sm,
  },
  staffCardPressed: { backgroundColor: adminTheme.colors.surfaceTertiary },
  staffCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rankPill: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankPillText: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPh: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: adminTheme.colors.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 18 },
  staffMeta: { flex: 1, minWidth: 0 },
  staffName: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  staffDept: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  scoreBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  scoreBadgeVal: { fontSize: 15, fontWeight: '800' },
  scoreBadgeLbl: { fontSize: 9, fontWeight: '700', color: adminTheme.colors.textMuted },
  sourceSectionTitle: {
    marginTop: 14,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '800',
    color: adminTheme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sourceGrid: { gap: 8 },
  sourceChip: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  sourceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceText: { flex: 1 },
  sourceLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  sourceDetail: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  sourcePts: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.accent, marginTop: 4 },
  rewardBlock: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 4,
  },
  rewardTitle: { fontSize: 12, fontWeight: '800', color: '#b45309', marginLeft: 22, marginTop: -18 },
  rewardItem: { fontSize: 12, color: '#78350f', marginLeft: 8 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  warnText: { fontSize: 11, color: adminTheme.colors.warning, flex: 1 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: adminTheme.colors.borderLight,
  },
  cardFooterText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.accent },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  emptySub: { fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center' },
  emptyCta: {
    marginTop: 12,
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800' },
});
