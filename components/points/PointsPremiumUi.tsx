import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { getPointsColor, formatPoints } from '@/lib/staffPoints';
import { pointsTheme, podiumStyle } from './pointsTheme';

/** Sayıya doğru yumuşak sayaç animasyonu */
export function AnimatedScore({
  value,
  style,
  prefix = '',
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  prefix?: string;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const anim = new Animated.Value(0);
    setDisplay(0);
    const id = anim.addListener(({ value: t }) => setDisplay(Math.round(value * t)));
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [value]);

  return (
    <Text style={style}>
      {prefix}
      {formatPoints(display)}
    </Text>
  );
}

/** Liste öğeleri için kademeli fade-in */
export function StaggerFadeIn({
  index,
  children,
  style,
}: {
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 380,
        delay: Math.min(index * 55, 400),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay: Math.min(index * 55, 400),
        useNativeDriver: true,
        speed: 18,
        bounciness: 4,
      }),
    ]).start();
  }, [index, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

type TabItem<T extends string> = { key: T; label: string; icon: keyof typeof Ionicons.glyphMap };

export function PointsSegmentTabs<T extends string>({
  tabs,
  active,
  onChange,
  variant = 'staff',
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
  variant?: 'staff' | 'admin';
}) {
  const isAdmin = variant === 'admin';
  return (
    <View style={[styles.tabsWrap, isAdmin && styles.tabsWrapAdmin]}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        const inner = (
          <>
            <Ionicons
              name={tab.icon}
              size={16}
              color={selected ? '#fff' : isAdmin ? '#64748b' : '#6B7280'}
            />
            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
          </>
        );
        if (selected) {
          return (
            <PressableScale key={tab.key} style={styles.tabSlot} onPress={() => onChange(tab.key)}>
              <LinearGradient
                colors={isAdmin ? ['#0f172a', '#1e293b'] : pointsTheme.gradientRank}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tabGradient}
              >
                {inner}
              </LinearGradient>
            </PressableScale>
          );
        }
        return (
          <PressableScale key={tab.key} style={[styles.tabSlot, styles.tabIdle]} onPress={() => onChange(tab.key)}>
            {inner}
          </PressableScale>
        );
      })}
    </View>
  );
}

export function PointsHeroBanner({
  total,
  rankLabel,
  deptLabel,
  hint,
}: {
  total: number;
  rankLabel: string;
  deptLabel?: string | null;
  hint?: string | null;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1400, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <LinearGradient
      colors={pointsTheme.gradientHero}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, pointsTheme.cardShadow]}
    >
      <View style={styles.heroGlow} />
      <Animated.View style={[styles.heroIconRing, { transform: [{ scale: pulse }] }]}>
        <Ionicons name="trophy" size={30} color={pointsTheme.goldDark} />
      </Animated.View>
      <AnimatedScore value={total} style={styles.heroScore} />
      <Text style={styles.heroCaption}>Toplam puanınız</Text>
      <View style={styles.heroRankPill}>
        <Ionicons name="podium" size={14} color="#fff" />
        <Text style={styles.heroRankText}>{rankLabel}</Text>
      </View>
      {deptLabel ? <Text style={styles.heroDept}>Bölümünüz: {deptLabel}</Text> : null}
      {hint ? <Text style={styles.heroHint}>{hint}</Text> : null}
    </LinearGradient>
  );
}

export function PointsLeaderboardRow({
  rank,
  name,
  subtitle,
  points,
  highlight,
}: {
  rank: number;
  name: string;
  subtitle?: string;
  points: number;
  highlight?: boolean;
}) {
  const podium = podiumStyle(rank);
  return (
    <View style={[styles.leaderRow, highlight && styles.leaderRowMe, podium && { borderColor: podium.border }]}>
      <View
        style={[
          styles.leaderBadge,
          podium ? { backgroundColor: podium.bg, borderColor: podium.border, borderWidth: 2 } : null,
        ]}
      >
        {podium ? (
          <Ionicons name={podium.icon} size={14} color={podium.text} />
        ) : (
          <Text style={styles.leaderRankNum}>{rank}</Text>
        )}
      </View>
      <View style={styles.leaderBody}>
        <Text style={[styles.leaderName, highlight && styles.leaderNameMe]} numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? <Text style={styles.leaderSub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      <View style={styles.leaderPtsWrap}>
        <Text style={[styles.leaderPts, { color: getPointsColor(points) }]}>{formatPoints(points)}</Text>
      </View>
    </View>
  );
}

export function PointsBreakdownStrip({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; points: number; count: number; icon?: keyof typeof Ionicons.glyphMap }[];
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.points)), 1);
  return (
    <View style={[styles.breakPanel, pointsTheme.cardShadow]}>
      <Text style={styles.breakTitle}>{title}</Text>
      {rows.map((row) => {
        const pct = Math.round((Math.abs(row.points) / max) * 100);
        return (
          <View key={row.label} style={styles.breakRow}>
            <View style={styles.breakIconWrap}>
              <Ionicons name={row.icon ?? 'ellipse'} size={14} color={pointsTheme.goldDark} />
            </View>
            <View style={styles.breakMeta}>
              <View style={styles.breakHead}>
                <Text style={styles.breakLabel} numberOfLines={1}>{row.label}</Text>
                <Text style={[styles.breakPts, { color: getPointsColor(row.points) }]}>
                  {formatPoints(row.points)}
                </Text>
              </View>
              <View style={styles.breakTrack}>
                <LinearGradient
                  colors={row.points >= 0 ? ['#34D399', '#059669'] : ['#FCA5A5', '#DC2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.breakFill, { width: `${pct}%` }]}
                />
              </View>
              <Text style={styles.breakCount}>{row.count} kayıt</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PointsHistoryCard({
  points,
  dateLabel,
  title,
  meta,
  reason,
  giver,
  categoryIcon,
}: {
  points: number;
  dateLabel: string;
  title: string;
  meta?: string | null;
  reason?: string | null;
  giver?: string | null;
  categoryIcon?: keyof typeof Ionicons.glyphMap;
}) {
  const positive = points > 0;
  return (
    <View style={[styles.historyCard, pointsTheme.cardShadow]}>
      <LinearGradient
        colors={positive ? ['rgba(52,211,153,0.12)', 'transparent'] : ['rgba(252,165,165,0.14)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.historyAccent}
      />
      <View style={styles.historyTop}>
        <View style={[styles.historyIcon, positive ? styles.historyIconPos : styles.historyIconNeg]}>
          <Ionicons name={categoryIcon ?? (positive ? 'arrow-up' : 'arrow-down')} size={16} color={getPointsColor(points)} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.historyTitle}>{title}</Text>
          <Text style={styles.historyDate}>{dateLabel}</Text>
        </View>
        <Text style={[styles.historyPts, { color: getPointsColor(points) }]}>{formatPoints(points)}</Text>
      </View>
      {meta ? <Text style={styles.historyMeta}>{meta}</Text> : null}
      {reason?.trim() ? <Text style={styles.historyReason}>{reason.trim()}</Text> : null}
      {giver ? <Text style={styles.historyGiver}>Veren: {giver}</Text> : null}
    </View>
  );
}

export function KitchenScoreHero({
  score,
  label,
  labelColor,
  meta,
}: {
  score: number;
  label: string;
  labelColor: string;
  meta: string;
}) {
  const ringAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(ringAnim, { toValue: 1, useNativeDriver: true, speed: 12, bounciness: 6 }).start();
  }, [score, ringAnim]);

  return (
    <LinearGradient
      colors={['#FFF7ED', '#FFEDD5', '#FEF3C7']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.kitchenHero, pointsTheme.cardShadow]}
    >
      <Animated.View
        style={[
          styles.kitchenRing,
          { borderColor: labelColor, transform: [{ scale: ringAnim }] },
        ]}
      >
        <Text style={[styles.kitchenScore, { color: labelColor }]}>{score}</Text>
        <Text style={styles.kitchenOf}>/ 100</Text>
      </Animated.View>
      <View style={styles.kitchenInfo}>
        <View style={styles.kitchenTitleRow}>
          <Ionicons name="cafe" size={20} color={pointsTheme.goldDark} />
          <Text style={styles.kitchenTitle}>Mutfak Genel Puanı</Text>
        </View>
        <Text style={[styles.kitchenLabel, { color: labelColor }]}>{label}</Text>
        <Text style={styles.kitchenMeta}>{meta}</Text>
      </View>
    </LinearGradient>
  );
}

export function AdminAwardCta({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.awardCtaWrap}>
      <LinearGradient
        colors={pointsTheme.gradientCta}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.awardCta}
      >
        <View style={styles.awardCtaIcon}>
          <Ionicons name="sparkles" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.awardCtaTitle}>Puan Ver / Çıkar</Text>
          <Text style={styles.awardCtaSub}>Personel değerlendirmesi yapın</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.85)" />
      </LinearGradient>
    </PressableScale>
  );
}

export function AdminStatsStrip({
  staffCount,
  movementCount,
  topName,
  topPoints,
}: {
  staffCount: number;
  movementCount: number;
  topName: string | null;
  topPoints: number | null;
}) {
  const items = [
    { icon: 'people' as const, val: String(staffCount), label: 'Puanlı personel' },
    { icon: 'pulse' as const, val: String(movementCount), label: 'Son hareket' },
    {
      icon: 'trophy' as const,
      val: topPoints != null ? formatPoints(topPoints) : '—',
      label: topName ? topName.split(' ')[0] ?? 'Lider' : 'Lider',
    },
  ];
  return (
    <View style={styles.statsStrip}>
      {items.map((item) => (
        <View key={item.label} style={styles.statChip}>
          <Ionicons name={item.icon} size={14} color={pointsTheme.goldDark} />
          <Text style={styles.statVal}>{item.val}</Text>
          <Text style={styles.statLbl} numberOfLines={1}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabsWrap: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: 14,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: pointsTheme.shell.borderColor,
  },
  tabsWrapAdmin: { backgroundColor: '#fff' },
  tabSlot: { flex: 1, borderRadius: 11, overflow: 'hidden' },
  tabIdle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: 'transparent',
  },
  tabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 11,
  },
  tabLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  tabLabelActive: { color: '#fff' },

  hero: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  heroIconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  heroScore: { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroCaption: { fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  heroRankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroRankText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  heroDept: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 10 },
  heroHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 17,
    paddingHorizontal: 8,
  },

  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    ...pointsTheme.cardShadow,
  },
  leaderRowMe: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  leaderBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaderRankNum: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  leaderBody: { flex: 1, minWidth: 0 },
  leaderName: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  leaderNameMe: { color: '#4F46E5' },
  leaderSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  leaderPtsWrap: { minWidth: 48, alignItems: 'flex-end' },
  leaderPts: { fontSize: 18, fontWeight: '900' },

  breakPanel: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: pointsTheme.shell.borderColor,
  },
  breakTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 12 },
  breakRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  breakIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakMeta: { flex: 1 },
  breakHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  breakPts: { fontSize: 15, fontWeight: '800' },
  breakTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F1F5F9',
    marginTop: 6,
    overflow: 'hidden',
  },
  breakFill: { height: '100%', borderRadius: 3 },
  breakCount: { fontSize: 11, color: '#94A3B8', marginTop: 4 },

  historyCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    overflow: 'hidden',
  },
  historyAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 48,
  },
  historyTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  historyIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconPos: { backgroundColor: '#ECFDF5' },
  historyIconNeg: { backgroundColor: '#FEF2F2' },
  historyTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  historyDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  historyPts: { fontSize: 20, fontWeight: '900' },
  historyMeta: { fontSize: 12, color: '#64748B', marginTop: 8 },
  historyReason: { fontSize: 13, color: '#334155', marginTop: 4, lineHeight: 18 },
  historyGiver: { fontSize: 11, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' },

  kitchenHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  kitchenRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  kitchenScore: { fontSize: 28, fontWeight: '900' },
  kitchenOf: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  kitchenInfo: { flex: 1 },
  kitchenTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kitchenTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  kitchenLabel: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  kitchenMeta: { fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 17 },

  awardCtaWrap: { marginBottom: 16, borderRadius: 18, overflow: 'hidden' },
  awardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
  },
  awardCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  awardCtaTitle: { fontSize: 16, fontWeight: '900', color: '#fff' },
  awardCtaSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  statsStrip: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: pointsTheme.shell.borderColor,
    ...pointsTheme.cardShadow,
  },
  statVal: { fontSize: 18, fontWeight: '900', color: '#0F172A', marginTop: 6 },
  statLbl: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2, textAlign: 'center' },
});
