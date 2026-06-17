import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from '@/components/premium/PressableScale';
import { StaggerFadeIn } from '@/components/points';
import { podiumStyle } from '@/components/points/pointsTheme';
import { auditScoreColor, auditScoreLabel, type DepartmentLeaderboardRow } from '@/lib/audit';
import { auditRankMedalColor, auditTrendMeta } from '@/lib/auditDashboardUi';
import { performanceTheme, scoreGradient } from './performanceTheme';

type IonIcon = ComponentProps<typeof Ionicons>['name'];

function LiveDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={styles.liveWrap}>
      <Animated.View style={[styles.liveDot, { backgroundColor: color, opacity: pulse }]} />
      <Text style={styles.liveText}>Canlı</Text>
    </View>
  );
}

export function PerformanceAnimatedScore({
  value,
  style,
  fallback = '—',
}: {
  value: number | null;
  style?: StyleProp<TextStyle>;
  fallback?: string;
}) {
  const [display, setDisplay] = useState(0);
  const target = value ?? 0;

  useEffect(() => {
    if (value == null) return;
    const anim = new Animated.Value(0);
    setDisplay(0);
    const id = anim.addListener(({ value: t }) => setDisplay(Math.round(target * t)));
    Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: false }).start();
    return () => anim.removeListener(id);
  }, [value, target]);

  if (value == null) return <Text style={style}>{fallback}</Text>;
  return <Text style={style}>{display}</Text>;
}

export function PerformanceHeroCard({
  eyebrow,
  name,
  score,
  scoreLabel,
  formula,
  updatedLabel,
  threshold,
  belowThreshold,
  thresholdLabel,
}: {
  eyebrow: string;
  name: string;
  score: number | null;
  scoreLabel: string;
  formula: string;
  updatedLabel?: string | null;
  threshold: number;
  belowThreshold: boolean;
  thresholdLabel: string;
}) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.6)).current;
  const color = auditScoreColor(score);
  const grad = scoreGradient(score);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(ringAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.55, duration: 1800, useNativeDriver: true }),
        ])
      ),
    ]).start();
  }, [score, ringAnim, glowAnim]);

  return (
    <LinearGradient
      colors={performanceTheme.gradientHero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, performanceTheme.cardShadow]}
    >
      <Animated.View style={[styles.heroGlow, { opacity: glowAnim }]} />
      <Animated.View style={[styles.heroGlow2, { opacity: glowAnim }]} />

      <View style={styles.heroTop}>
        <LiveDot color={belowThreshold ? '#FCA5A5' : '#A5F3FC'} />
        <Text style={styles.heroEyebrow}>{eyebrow}</Text>
      </View>

      <View style={styles.heroBody}>
        <Animated.View
          style={[
            styles.scoreRing,
            { borderColor: color, transform: [{ scale: ringAnim }] },
          ]}
        >
          <LinearGradient colors={grad} style={styles.scoreRingInner}>
            <PerformanceAnimatedScore value={score} style={styles.scoreNum} />
            <Text style={styles.scoreOf}>/ 100</Text>
          </LinearGradient>
        </Animated.View>

        <View style={styles.heroMeta}>
          <Text style={styles.heroName} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.scoreRingLbl}>{scoreLabel}</Text>
          <Text style={styles.heroFormula}>{formula}</Text>
          {updatedLabel ? <Text style={styles.heroUpdated}>{updatedLabel}</Text> : null}
          <View
            style={[
              styles.thresholdPill,
              belowThreshold ? styles.thresholdBad : styles.thresholdOk,
            ]}
          >
            <Ionicons
              name={belowThreshold ? 'warning' : 'shield-checkmark'}
              size={13}
              color={belowThreshold ? '#FECACA' : '#A7F3D0'}
            />
            <Text style={[styles.thresholdText, belowThreshold && styles.thresholdTextBad]}>
              {thresholdLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.heroFooter}>
        <View style={styles.heroStatChip}>
          <Ionicons name="flag-outline" size={12} color="rgba(255,255,255,0.85)" />
          <Text style={styles.heroStatText}>Eşik {threshold}</Text>
        </View>
        <View style={styles.heroStatChip}>
          <Ionicons name="pulse-outline" size={12} color="rgba(255,255,255,0.85)" />
          <Text style={styles.heroStatText}>Anlık güncelleme</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export function PerformanceAlertBanner({ text }: { text: string }) {
  const pulse = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.85, duration: 1100, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);

  return (
    <Animated.View style={[styles.alertCard, { opacity: pulse }]}>
      <LinearGradient
        colors={['#FEF2F2', '#FFF1F2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.alertIcon}>
        <Ionicons name="alert-circle" size={22} color="#DC2626" />
      </View>
      <Text style={styles.alertText}>{text}</Text>
    </Animated.View>
  );
}

export function PerformancePillarCard({
  title,
  score,
  weight,
  icon,
  noDataLabel,
  index,
}: {
  title: string;
  score: number | null;
  weight: number;
  icon: keyof typeof Ionicons.glyphMap;
  noDataLabel: string;
  index: number;
}) {
  const color = auditScoreColor(score);
  const pct = score != null ? Math.min(100, Math.max(0, score)) : 0;
  const fillAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct / 100,
      duration: 900,
      delay: index * 120,
      useNativeDriver: false,
    }).start();
  }, [pct, index, fillAnim]);

  const fillWidth = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const grad = scoreGradient(score);

  return (
    <StaggerFadeIn index={index}>
      <View style={[styles.pillarCard, performanceTheme.cardShadow]}>
        <LinearGradient
          colors={performanceTheme.gradientHeroSoft}
          style={styles.pillarAccent}
        />
        <View style={styles.pillarHead}>
          <View style={styles.pillarIconWrap}>
            <LinearGradient colors={performanceTheme.gradientHero.slice(0, 2)} style={StyleSheet.absoluteFill} />
            <Ionicons name={icon} size={18} color="#fff" />
          </View>
          <View style={styles.weightPill}>
            <Text style={styles.weightText}>%{weight}</Text>
          </View>
        </View>
        <Text style={styles.pillarTitle}>{title}</Text>
        <Text style={[styles.pillarScore, { color }]}>
          {score != null ? auditScoreLabel(score) : noDataLabel}
        </Text>
        <View style={styles.pillarTrack}>
          <Animated.View style={{ width: fillWidth, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
            <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>
        </View>
      </View>
    </StaggerFadeIn>
  );
}

export function PerformanceDeptLeaderboard({
  departments,
  monthLabel,
}: {
  departments: DepartmentLeaderboardRow[];
  monthLabel?: string;
}) {
  const top3 = departments.filter((d) => d.rank <= 3).sort((a, b) => a.rank - b.rank);
  const rest = departments.filter((d) => d.rank > 3);
  const scored = departments.filter((d) => d.avg_score != null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, d) => sum + (d.avg_score ?? 0), 0) / scored.length)
      : null;

  return (
    <View style={[styles.deptBoard, performanceTheme.cardShadow]}>
      <LinearGradient
        colors={performanceTheme.gradientHeroSoft}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.deptBoardAccent}
      />

      <View style={styles.deptBoardHead}>
        <View style={styles.deptBoardTitleRow}>
          <View style={styles.deptBoardIcon}>
            <Ionicons name="podium" size={16} color={performanceTheme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.deptBoardTitle}>Bölüm sıralaması</Text>
            {monthLabel ? <Text style={styles.deptBoardMonth}>{monthLabel}</Text> : null}
          </View>
        </View>
        <View style={styles.deptBoardStats}>
          <View style={styles.deptStatChip}>
            <Text style={styles.deptStatVal}>{departments.length}</Text>
            <Text style={styles.deptStatLbl}>bölüm</Text>
          </View>
          {avgScore != null ? (
            <View style={[styles.deptStatChip, styles.deptStatChipAvg]}>
              <Text style={[styles.deptStatVal, { color: auditScoreColor(avgScore) }]}>{avgScore}</Text>
              <Text style={styles.deptStatLbl}>ort.</Text>
            </View>
          ) : null}
        </View>
      </View>

      {top3.length >= 2 ? <PerformanceDeptPodium rows={top3} /> : null}

      <View style={styles.deptList}>
        {(top3.length >= 2 ? rest : departments).map((row, idx) => (
          <PerformanceDeptRow key={row.category_id} row={row} index={idx} compact={top3.length >= 2} />
        ))}
      </View>
    </View>
  );
}

function PerformanceDeptPodium({ rows }: { rows: DepartmentLeaderboardRow[] }) {
  const order = [2, 1, 3]
    .map((r) => rows.find((d) => d.rank === r))
    .filter(Boolean) as DepartmentLeaderboardRow[];

  return (
    <View style={styles.podiumWrap}>
      {order.map((row) => {
        const podium = podiumStyle(row.rank);
        const height = row.rank === 1 ? 92 : row.rank === 2 ? 72 : 58;
        const grad =
          row.rank === 1
            ? (['#FBBF24', '#F59E0B'] as [string, string])
            : row.rank === 2
              ? (['#94A3B8', '#64748B'] as [string, string])
              : (['#FB923C', '#EA580C'] as [string, string]);

        return (
          <View key={row.category_id} style={styles.podiumCol}>
            <View style={styles.podiumTop}>
              {podium ? (
                <View style={[styles.podiumMedal, { backgroundColor: podium.bg, borderColor: podium.border }]}>
                  <Ionicons name={podium.icon} size={14} color={podium.text} />
                </View>
              ) : null}
              <Text style={[styles.podiumScore, { color: auditScoreColor(row.avg_score) }]}>
                {row.avg_score != null ? Math.round(row.avg_score) : '—'}
              </Text>
              <Text style={styles.podiumName} numberOfLines={2}>
                {row.name}
              </Text>
              <View style={styles.podiumTrend}>
                <DeptTrendChip delta={row.trend_delta} />
              </View>
            </View>
            <LinearGradient
              colors={grad}
              style={[styles.podiumBar, { height }]}
            >
              <Text style={styles.podiumRank}>{row.rank}</Text>
            </LinearGradient>
          </View>
        );
      })}
    </View>
  );
}

function DeptTrendChip({ delta }: { delta: number }) {
  const trend = auditTrendMeta(delta);
  return (
    <View style={[styles.trendChip, { backgroundColor: trend.color + '18' }]}>
      <Ionicons name={trend.icon} size={11} color={trend.color} />
      <Text style={[styles.trendText, { color: trend.color }]}>{trend.label}</Text>
    </View>
  );
}

function DeptIconBadge({ icon }: { icon: string }) {
  const iconName = ((icon as IonIcon) || 'layers-outline') as IonIcon;
  return (
    <View style={styles.deptIconWrap}>
      <LinearGradient colors={performanceTheme.gradientHero.slice(0, 2)} style={StyleSheet.absoluteFill} />
      <Ionicons name={iconName} size={16} color="#fff" />
    </View>
  );
}

export function PerformanceDeptRow({
  row,
  index,
  compact = false,
}: {
  row: DepartmentLeaderboardRow;
  index: number;
  compact?: boolean;
}) {
  const { rank, name, avg_score, audit_count, trend_delta, icon } = row;
  const medal = auditRankMedalColor(rank);
  const podium = podiumStyle(rank);
  const pct = avg_score != null ? Math.min(100, Math.max(0, avg_score)) : 0;
  const fillAnim = useRef(new Animated.Value(0)).current;
  const grad = scoreGradient(avg_score);

  useEffect(() => {
    Animated.timing(fillAnim, {
      toValue: pct / 100,
      duration: 850,
      delay: index * 90,
      useNativeDriver: false,
    }).start();
  }, [pct, index, fillAnim]);

  const fillWidth = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <StaggerFadeIn index={index}>
      <View
        style={[
          styles.deptRow,
          podium && !compact ? styles.deptRowTop : null,
          compact && styles.deptRowCompact,
        ]}
      >
        {podium && !compact ? (
          <LinearGradient
            colors={[podium.bg, '#fff']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.deptRowGlow}
          />
        ) : null}

        <View
          style={[
            styles.deptRank,
            medal ? { backgroundColor: medal + '22', borderColor: medal, borderWidth: 2 } : null,
            podium && !compact ? styles.deptRankTop : null,
          ]}
        >
          {podium && !compact ? (
            <Ionicons name={podium.icon} size={14} color={podium.text} />
          ) : (
            <Text style={[styles.deptRankNum, medal ? { color: medal } : null]}>{rank}</Text>
          )}
        </View>

        <DeptIconBadge icon={icon} />

        <View style={styles.deptBody}>
          <View style={styles.deptTopLine}>
            <Text style={styles.deptName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.deptScore, { color: auditScoreColor(avg_score) }]}>
              {avg_score != null ? auditScoreLabel(avg_score) : '—'}
            </Text>
          </View>
          <View style={styles.deptTrack}>
            <Animated.View style={{ width: fillWidth, height: '100%', borderRadius: 3, overflow: 'hidden' }}>
              <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
          </View>
          <View style={styles.deptMetaRow}>
            <Text style={styles.deptMeta}>{audit_count} denetim</Text>
            <DeptTrendChip delta={trend_delta} />
          </View>
        </View>
      </View>
    </StaggerFadeIn>
  );
}

export function PerformanceNoticeCard({
  badge,
  message,
  meta,
  acknowledged,
  ackLabel,
  ackDoneLabel,
  onAck,
  ackLoading,
  index,
}: {
  badge: string;
  message: string;
  meta: string;
  acknowledged: boolean;
  ackLabel: string;
  ackDoneLabel: string;
  onAck: () => void;
  ackLoading: boolean;
  index: number;
}) {
  return (
    <StaggerFadeIn index={index}>
      <View style={[styles.noticeCard, performanceTheme.cardShadow]}>
        <LinearGradient
          colors={['#FEE2E2', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.noticeAccent}
        />
        <View style={styles.noticeBadge}>
          <Ionicons name="document-text" size={11} color="#991B1B" />
          <Text style={styles.noticeBadgeText}>{badge}</Text>
        </View>
        <Text style={styles.noticeMsg}>{message}</Text>
        <Text style={styles.noticeMeta}>{meta}</Text>
        {acknowledged ? (
          <View style={styles.ackDoneRow}>
            <Ionicons name="checkmark-circle" size={14} color="#047857" />
            <Text style={styles.ackDone}>{ackDoneLabel}</Text>
          </View>
        ) : (
          <PressableScale onPress={onAck} disabled={ackLoading} style={styles.ackBtnWrap}>
            <LinearGradient
              colors={performanceTheme.gradientHero.slice(0, 2)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ackBtn}
            >
              <Text style={styles.ackBtnText}>{ackLoading ? '…' : ackLabel}</Text>
            </LinearGradient>
          </PressableScale>
        )}
      </View>
    </StaggerFadeIn>
  );
}

export function PerformanceLinkCard({
  icon,
  title,
  subtitle,
  colors,
  onPress,
  disabled,
  index,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  colors: [string, string];
  onPress: () => void;
  disabled?: boolean;
  index: number;
}) {
  return (
    <StaggerFadeIn index={index}>
      <PressableScale onPress={onPress} disabled={disabled} style={styles.linkWrap}>
        <View style={[styles.linkCard, performanceTheme.cardShadow, disabled && styles.linkDisabled]}>
          <View style={styles.linkIconWrap}>
            <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
            <Ionicons name={icon} size={20} color="#fff" />
          </View>
          <View style={styles.linkBody}>
            <Text style={styles.linkTitle}>{title}</Text>
            <Text style={styles.linkSub}>{subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
        </View>
      </PressableScale>
    </StaggerFadeIn>
  );
}

export function PerformanceSectionTitle({
  title,
  icon,
  style,
}: {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionTitleRow, style]}>
      {icon ? (
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={14} color={performanceTheme.accent} />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  hero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -50,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroGlow2: {
    position: 'absolute',
    bottom: -40,
    left: -20,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(251,191,36,0.15)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  scoreRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 4,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  scoreRingInner: {
    flex: 1,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  scoreNum: { fontSize: 34, fontWeight: '900', color: '#0F172A', letterSpacing: -1 },
  scoreOf: { fontSize: 11, color: '#94A3B8', fontWeight: '700', marginTop: -2 },
  scoreRingLbl: { fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: '700', marginTop: 2 },
  heroMeta: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 20, fontWeight: '900', color: '#fff', marginBottom: 4 },
  heroFormula: { fontSize: 12, color: 'rgba(255,255,255,0.82)', lineHeight: 17, marginTop: 6 },
  heroUpdated: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 6 },
  thresholdPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  thresholdOk: { backgroundColor: 'rgba(16,185,129,0.22)' },
  thresholdBad: { backgroundColor: 'rgba(220,38,38,0.28)' },
  thresholdText: { fontSize: 11, fontWeight: '800', color: '#D1FAE5' },
  thresholdTextBad: { color: '#FECACA' },
  heroFooter: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroStatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroStatText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.88)' },

  alertCard: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    overflow: 'hidden',
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: { flex: 1, fontSize: 13, color: '#991B1B', lineHeight: 19, fontWeight: '600' },

  pillarCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: performanceTheme.shell.borderColor,
    overflow: 'hidden',
  },
  pillarAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  pillarHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pillarIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  weightPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
  },
  weightText: { fontSize: 12, fontWeight: '800', color: performanceTheme.accent },
  pillarTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  pillarScore: { fontSize: 22, fontWeight: '900', marginBottom: 10 },
  pillarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },

  deptBoard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: performanceTheme.shell.borderColor,
    overflow: 'hidden',
  },
  deptBoardAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  deptBoardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  deptBoardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  deptBoardIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptBoardTitle: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  deptBoardMonth: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 2 },
  deptBoardStats: { flexDirection: 'row', gap: 6 },
  deptStatChip: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
    minWidth: 48,
  },
  deptStatChipAvg: { backgroundColor: '#FFFBEB' },
  deptStatVal: { fontSize: 15, fontWeight: '900', color: '#0F172A' },
  deptStatLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' },

  podiumWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    paddingTop: 4,
  },
  podiumCol: { flex: 1, alignItems: 'center', maxWidth: 110 },
  podiumTop: { alignItems: 'center', marginBottom: 8, minHeight: 78 },
  podiumMedal: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: 4,
  },
  podiumScore: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  podiumName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  podiumTrend: { marginTop: 4 },
  podiumBar: {
    width: '100%',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 6,
  },
  podiumRank: { fontSize: 16, fontWeight: '900', color: 'rgba(255,255,255,0.95)' },

  deptList: { gap: 0 },
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
    overflow: 'hidden',
  },
  deptRowCompact: {
    backgroundColor: '#F8FAFC',
    borderColor: 'rgba(99,102,241,0.1)',
  },
  deptRowTop: {
    borderColor: 'rgba(245,158,11,0.3)',
  },
  deptRowGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 6,
  },
  deptRank: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deptRankTop: { backgroundColor: '#FEF3C7' },
  deptRankNum: { fontWeight: '900', fontSize: 13, color: '#64748B' },
  deptIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  deptBody: { flex: 1, minWidth: 0 },
  deptTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  deptName: { flex: 1, fontSize: 14, fontWeight: '800', color: '#0F172A' },
  deptScore: { fontSize: 14, fontWeight: '900' },
  deptTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    marginTop: 7,
    overflow: 'hidden',
  },
  deptMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  deptMeta: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  trendText: { fontSize: 10, fontWeight: '800' },

  noticeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.12)',
    overflow: 'hidden',
  },
  noticeAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4,
    bottom: 0,
  },
  noticeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 8,
  },
  noticeBadgeText: { fontSize: 11, fontWeight: '800', color: '#991B1B' },
  noticeMsg: { fontSize: 14, color: '#0F172A', lineHeight: 20, marginBottom: 8 },
  noticeMeta: { fontSize: 12, color: '#64748B' },
  ackBtnWrap: { marginTop: 12, borderRadius: 12, overflow: 'hidden' },
  ackBtn: { paddingVertical: 11, alignItems: 'center', borderRadius: 12 },
  ackBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  ackDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  ackDone: { fontSize: 12, color: '#047857', fontWeight: '700' },

  linkWrap: { marginBottom: 10 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: performanceTheme.shell.borderColor,
  },
  linkDisabled: { opacity: 0.65 },
  linkIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  linkBody: { flex: 1, minWidth: 0 },
  linkTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  linkSub: { fontSize: 12, color: '#64748B', marginTop: 3, lineHeight: 17 },

  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    marginTop: 4,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});
