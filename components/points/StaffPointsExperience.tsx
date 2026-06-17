import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Pressable, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  AnimatedScore,
  StaggerFadeIn,
  pointsTheme,
} from '@/components/points';
import {
  formatPoints,
  getPointsColor,
  type StaffPointEntry,
  type StaffPointsRankRow,
} from '@/lib/staffPoints';
import {
  STAFF_POINTS_AUDIT_THRESHOLD,
  STAFF_POINTS_TRUST_THRESHOLD,
  getStaffPointsTierMeta,
  staffPointsJourneyPercent,
  staffPointsNextMilestone,
  type StaffPointsTierMeta,
} from '@/lib/staffPointsTiers';

/** Canlı nabız — puan ekranı aktif hissi */
function LiveDot({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.4)).current;
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

/** 0 → 50 → 100 yolculuk rayı */
export function StaffPointsJourneyRail({ total }: { total: number }) {
  const pct = staffPointsJourneyPercent(total);
  const fillAnim = useRef(new Animated.Value(0)).current;
  const markerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fillAnim, { toValue: pct / 100, duration: 1100, useNativeDriver: false }),
      Animated.spring(markerAnim, { toValue: pct / 100, useNativeDriver: false, speed: 14, bounciness: 5 }),
    ]).start();
  }, [pct, fillAnim, markerAnim]);

  const fillWidth = fillAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const markerLeft = markerAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  const auditPos = `${STAFF_POINTS_AUDIT_THRESHOLD}%`;
  const trustPos = `${STAFF_POINTS_TRUST_THRESHOLD}%`;

  return (
    <View style={styles.railWrap}>
      <View style={styles.railTrack}>
        <Animated.View style={{ width: fillWidth, height: '100%', borderRadius: 4, overflow: 'hidden' }}>
          <LinearGradient
            colors={
              total < STAFF_POINTS_AUDIT_THRESHOLD
                ? ['#FCA5A5', '#EF4444']
                : ['#FBBF24', '#F59E0B', '#34D399']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <View style={[styles.railMark, { left: auditPos }]} />
        <View style={[styles.railMark, styles.railMarkTrust, { left: trustPos }]} />
        <Animated.View style={[styles.railMarker, { left: markerLeft }]}>
          <View
            style={[
              styles.railMarkerDot,
              total < STAFF_POINTS_AUDIT_THRESHOLD && styles.railMarkerDanger,
            ]}
          />
        </Animated.View>
      </View>
      <View style={styles.railLabels}>
        <Text style={styles.railLbl}>0</Text>
        <Text style={[styles.railLbl, styles.railLblMid]}>50 · Denetim</Text>
        <Text style={styles.railLbl}>100 · Güven</Text>
      </View>
    </View>
  );
}

/** Üst kompakt skor bandı */
export function StaffPointsLiveHeader({
  total,
  rank,
  rankedTotal,
  positiveCount,
  negativeCount,
}: {
  total: number;
  rank: number;
  rankedTotal: number;
  positiveCount: number;
  negativeCount: number;
}) {
  const tier = getStaffPointsTierMeta(total);
  const next = staffPointsNextMilestone(total);

  return (
    <View style={[styles.header, { borderColor: tier.border }]}>
      <LinearGradient
        colors={
          tier.tier === 'critical'
            ? ['#FEF2F2', '#FFF']
            : tier.tier === 'trusted'
              ? ['#ECFDF5', '#FFF']
              : ['#FFFBEB', '#FFF']
        }
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.headerTop}>
        <View>
          <LiveDot color={tier.color} />
          <AnimatedScore value={total} style={[styles.headerScore, { color: tier.color }]} />
          <Text style={styles.headerCaption}>toplam puan</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStat}>
            <Ionicons name="podium-outline" size={13} color="#64748B" />
            <Text style={styles.headerStatVal}>
              {rank}. / {rankedTotal}
            </Text>
          </View>
          <View style={styles.headerStat}>
            <Ionicons name="arrow-up" size={13} color="#047857" />
            <Text style={styles.headerStatVal}>{positiveCount} olumlu</Text>
          </View>
          <View style={styles.headerStat}>
            <Ionicons name="arrow-down" size={13} color="#DC2626" />
            <Text style={styles.headerStatVal}>{negativeCount} olumsuz</Text>
          </View>
        </View>
      </View>
      <StaffPointsJourneyRail total={total} />
      {next ? (
        <Text style={styles.headerNext}>
          {next.label}:{' '}
          <Text style={{ fontWeight: '900', color: tier.color }}>{next.remaining} puan</Text> kaldı
        </Text>
      ) : (
        <Text style={[styles.headerNext, { color: '#047857', fontWeight: '800' }]}>
          Maksimum güven seviyesindesiniz
        </Text>
      )}
    </View>
  );
}

/** Durum mesajı — kompakt, ciddi */
export function StaffPointsTierCard({ meta }: { meta: StaffPointsTierMeta }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!meta.pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.96, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [meta.pulse, pulse]);

  return (
    <Animated.View
      style={[
        styles.tierCard,
        { backgroundColor: meta.bg, borderColor: meta.border },
        meta.pulse ? { transform: [{ scale: pulse }] } : null,
      ]}
    >
      <View style={[styles.tierIcon, { backgroundColor: meta.color + '18' }]}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.tierLabel, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.tierHead}>{meta.headline}</Text>
        <Text style={styles.tierDetail}>{meta.detail}</Text>
      </View>
    </Animated.View>
  );
}

/** Kaynak özeti — yatay kompakt chip'ler */
export function StaffPointsSourceStrip({
  rows,
}: {
  rows: { label: string; points: number; count: number; icon: keyof typeof Ionicons.glyphMap }[];
}) {
  if (rows.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sourceStrip}>
      {rows.map((row) => (
        <View key={row.label} style={styles.sourceChip}>
          <Ionicons name={row.icon} size={12} color={pointsTheme.goldDark} />
          <Text style={styles.sourceLbl} numberOfLines={1}>
            {row.label}
          </Text>
          <Text style={[styles.sourcePts, { color: getPointsColor(row.points) }]}>{formatPoints(row.points)}</Text>
          <Text style={styles.sourceCnt}>×{row.count}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/** Hareket satırı — ince zaman çizelgesi */
export function StaffPointsTimelineRow({
  entry,
  source,
  giver,
  deptLabel,
  index,
}: {
  entry: StaffPointEntry;
  source: string;
  giver: string | null;
  deptLabel: string | null;
  index: number;
}) {
  const positive = entry.points > 0;
  const when = new Date(entry.created_at).toLocaleString('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <StaggerFadeIn index={index}>
      <View style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineDot, positive ? styles.dotPos : styles.dotNeg]} />
          <View style={styles.timelineLine} />
        </View>
        <View style={styles.timelineBody}>
          <View style={styles.timelineTop}>
            <Text style={[styles.timelinePts, { color: getPointsColor(entry.points) }]}>
              {formatPoints(entry.points)}
            </Text>
            <Text style={styles.timelineWhen}>{when}</Text>
          </View>
          <Text style={styles.timelineSource}>{source}</Text>
          <Text style={styles.timelineMeta}>
            {[giver ? `Veren: ${giver}` : null, deptLabel ? `Bölüm: ${deptLabel}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {entry.reason?.trim() ? (
            <Text style={styles.timelineReason} numberOfLines={2}>
              {entry.reason.trim()}
            </Text>
          ) : null}
        </View>
      </View>
    </StaggerFadeIn>
  );
}

/** Sıralama — kompakt satır */
export function StaffPointsRankCompact({
  row,
  isMe,
  index,
}: {
  row: StaffPointsRankRow;
  isMe: boolean;
  index: number;
}) {
  const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : null;
  return (
    <StaggerFadeIn index={index}>
      <View style={[styles.rankRow, isMe && styles.rankRowMe]}>
        <Text style={styles.rankPos}>{medal ?? row.rank}</Text>
        <View style={styles.rankMid}>
          <Text style={[styles.rankName, isMe && styles.rankNameMe]} numberOfLines={1}>
            {row.full_name ?? '—'}
            {isMe ? ' · siz' : ''}
          </Text>
          <Text style={styles.rankSub} numberOfLines={1}>
            {row.positive_count}+ · {row.negative_count}−
          </Text>
        </View>
        <Text style={[styles.rankPts, { color: getPointsColor(row.total_points) }]}>
          {formatPoints(row.total_points)}
        </Text>
      </View>
    </StaggerFadeIn>
  );
}

/** Sekme şeridi — ince, kaydırmalı gösterge */
export function StaffPointsTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (k: T) => void;
}) {
  const idx = Math.max(0, tabs.findIndex((t) => t.key === active));
  const slide = useRef(new Animated.Value(idx)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.spring(slide, { toValue: idx, useNativeDriver: true, speed: 22, bounciness: 6 }).start();
  }, [idx, slide]);

  const tabCount = tabs.length;
  const tabW = barWidth > 0 ? (barWidth - 6) / tabCount : 0;

  const onBarLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);

  return (
    <View style={styles.tabBar} onLayout={onBarLayout}>
      {tabW > 0 ? (
        <Animated.View
          style={[
            styles.tabIndicator,
            {
              width: tabW,
              transform: [
                {
                  translateX: slide.interpolate({
                    inputRange: tabs.map((_, i) => i),
                    outputRange: tabs.map((_, i) => i * tabW),
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
      {tabs.map((tab) => {
        const on = active === tab.key;
        return (
          <Pressable key={tab.key} style={styles.tabPress} onPress={() => onChange(tab.key)}>
            <Text style={[styles.tabLbl, on && styles.tabLblOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  liveWrap: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.6, textTransform: 'uppercase' },

  header: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerScore: { fontSize: 36, fontWeight: '900', letterSpacing: -1, lineHeight: 40 },
  headerCaption: { fontSize: 11, color: '#94A3B8', fontWeight: '700', marginTop: -2 },
  headerStats: { gap: 5, alignItems: 'flex-end' },
  headerStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerStatVal: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  headerNext: { fontSize: 12, color: '#64748B', marginTop: 8, fontWeight: '600' },

  railWrap: { marginTop: 2 },
  railTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'visible',
    position: 'relative',
  },
  railMark: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 12,
    backgroundColor: '#94A3B8',
    marginLeft: -1,
    zIndex: 2,
  },
  railMarkTrust: { backgroundColor: '#047857' },
  railMarker: {
    position: 'absolute',
    top: -4,
    marginLeft: -7,
    zIndex: 3,
  },
  railMarkerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#F59E0B',
    borderWidth: 2,
    borderColor: '#fff',
  },
  railMarkerDanger: { backgroundColor: '#EF4444' },
  railLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  railLbl: { fontSize: 9, fontWeight: '700', color: '#94A3B8' },
  railLblMid: { color: '#DC2626' },

  tierCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  tierIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  tierHead: { fontSize: 14, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  tierDetail: { fontSize: 12, color: '#475569', marginTop: 4, lineHeight: 17 },

  sourceStrip: { gap: 8, paddingBottom: 10 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
  },
  sourceLbl: { fontSize: 11, fontWeight: '700', color: '#334155', maxWidth: 72 },
  sourcePts: { fontSize: 12, fontWeight: '900' },
  sourceCnt: { fontSize: 10, color: '#94A3B8', fontWeight: '700' },

  timelineRow: { flexDirection: 'row', gap: 10, marginBottom: 2 },
  timelineRail: { width: 14, alignItems: 'center' },
  timelineDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  dotPos: { backgroundColor: '#34D399' },
  dotNeg: { backgroundColor: '#F87171' },
  timelineLine: { flex: 1, width: 2, backgroundColor: '#E2E8F0', marginTop: 4 },
  timelineBody: {
    flex: 1,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  timelineTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timelinePts: { fontSize: 16, fontWeight: '900' },
  timelineWhen: { fontSize: 11, color: '#94A3B8', fontWeight: '600' },
  timelineSource: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  timelineMeta: { fontSize: 11, color: '#64748B', marginTop: 3 },
  timelineReason: { fontSize: 11, color: '#475569', marginTop: 4, lineHeight: 15, fontStyle: 'italic' },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  rankRowMe: { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' },
  rankPos: { width: 28, fontSize: 14, fontWeight: '900', textAlign: 'center', color: '#64748B' },
  rankMid: { flex: 1, minWidth: 0 },
  rankName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  rankNameMe: { color: '#4F46E5' },
  rankSub: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  rankPts: { fontSize: 15, fontWeight: '900' },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 3,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    left: 3,
    bottom: 3,
    backgroundColor: '#fff',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabPress: { flex: 1, zIndex: 1 },
  tabLbl: {
    textAlign: 'center',
    paddingVertical: 9,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabLblOn: { color: '#0F172A', fontWeight: '900' },
});
