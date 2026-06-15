import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

const cardShell = {
  marginHorizontal: 16,
  marginBottom: 16,
  borderRadius: 20,
  backgroundColor: P.card,
  borderWidth: 1,
  borderColor: P.border,
  padding: 16,
  shadowColor: P.cardShell.shadowColor,
  shadowOffset: P.cardShell.shadowOffset,
  shadowOpacity: P.cardShell.shadowOpacity,
  shadowRadius: P.cardShell.shadowRadius,
  elevation: P.cardShell.elevation,
} as const;

export function ProfileTabCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[cardShell, style]}>{children}</View>;
}

export function ProfileSectionTitle({ title, icon }: { title: string; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon ? (
        <View style={styles.sectionIconWrap}>
          <Ionicons name={icon} size={14} color={P.accent.blue} />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export function ProfileTenureHighlight({
  title,
  daysNode,
  unitLabel,
  meta,
  onPress,
}: {
  title: string;
  daysNode: ReactNode;
  unitLabel: string;
  meta: string;
  onPress?: () => void;
}) {
  const content = (
    <LinearGradient
      colors={[P.gradient.start, P.gradient.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.tenureGrad}
    >
      <View style={styles.tenureTop}>
        <View style={styles.tenureBadge}>
          <Ionicons name="ribbon" size={14} color="#fff" />
          <Text style={styles.tenureBadgeText}>{title}</Text>
        </View>
        {onPress ? <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.9)" /> : null}
      </View>
      <View style={styles.tenureCounterRow}>
        {daysNode}
        <Text style={styles.tenureUnit}> {unitLabel}</Text>
      </View>
      <Text style={styles.tenureMeta}>{meta}</Text>
    </LinearGradient>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.tenureOuter}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.tenureOuter}>{content}</View>;
}

export function ProfileBioBlock({ label, children }: { label?: string | null; children: ReactNode }) {
  return (
    <View style={styles.bioBlock}>
      {label ? <Text style={styles.bioLabel}>{label}</Text> : null}
      <View style={styles.bioInner}>{children}</View>
    </View>
  );
}

export function ProfileInfoRow({
  icon,
  label,
  value,
  onPress,
  valueColor,
  trailing,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress?: () => void;
  valueColor?: string;
  trailing?: ReactNode;
}) {
  const inner = (
    <View style={styles.infoRow}>
      <View style={styles.infoIconWrap}>
        <Ionicons name={icon} size={18} color={P.accent.blue} />
      </View>
      <View style={styles.infoTextCol}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]} numberOfLines={3}>
          {value}
        </Text>
      </View>
      {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={P.subtext} /> : null)}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={styles.infoRowPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={styles.infoRowPress}>{inner}</View>;
}

export function ProfileInfoGroup({ children }: { children: ReactNode }) {
  return <View style={styles.infoGroup}>{children}</View>;
}

export function ProfileChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.chipSection}>
      <Text style={styles.chipSectionLabel}>{label}</Text>
      <View style={styles.chipWrap}>{children}</View>
    </View>
  );
}

export function ProfileChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function ProfileSocialButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.socialBtn} onPress={onPress} activeOpacity={0.85}>
      <Ionicons name={icon} size={18} color={P.accent.blue} />
      <Text style={styles.socialBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProfileCompletionBlock({
  title,
  percent,
  missingLabels,
}: {
  title: string;
  percent: number;
  missingLabels: string[];
}) {
  return (
    <View style={styles.completionBlock}>
      <View style={styles.completionHead}>
        <Text style={styles.completionTitle}>{title}</Text>
        <Text style={styles.completionPercent}>{percent}%</Text>
      </View>
      <View style={styles.completionTrack}>
        <LinearGradient
          colors={[P.gradient.start, P.gradient.end]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.completionFill, { width: `${Math.min(100, Math.max(0, percent))}%` }]}
        />
      </View>
      {missingLabels.map((m) => (
        <Text key={m} style={styles.completionMissing}>
          · {m}
        </Text>
      ))}
    </View>
  );
}

export function ProfileAchievementItem({
  title,
  subtitle,
  accentColor,
  emoji,
}: {
  title: string;
  subtitle?: string;
  accentColor: string;
  emoji?: string;
}) {
  return (
    <View style={[styles.achievementItem, { borderLeftColor: accentColor }]}>
      {emoji ? <Text style={styles.achievementEmoji}>{emoji}</Text> : null}
      <View style={styles.achievementTextCol}>
        {subtitle ? <Text style={styles.achievementTier}>{subtitle}</Text> : null}
        <Text style={styles.achievementTitle}>{title}</Text>
      </View>
    </View>
  );
}

export function ProfileVisitorRow({
  name,
  meta,
  avatar,
  onPress,
  canOpenProfile,
}: {
  name: string;
  meta: string;
  avatar?: ReactNode;
  onPress?: () => void;
  canOpenProfile?: boolean;
}) {
  const row = (
    <View style={styles.visitorRow}>
      {avatar ?? (
        <View style={styles.visitorAvatarPlaceholder}>
          <Ionicons name="person" size={22} color={P.subtext} />
        </View>
      )}
      <View style={styles.visitorTextCol}>
        <Text style={styles.visitorName} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.visitorMeta} numberOfLines={2}>
          {meta}
        </Text>
      </View>
      {canOpenProfile ? <Ionicons name="chevron-forward" size={18} color={P.subtext} /> : null}
    </View>
  );

  if (onPress && canOpenProfile) {
    return (
      <TouchableOpacity activeOpacity={0.78} onPress={onPress} style={styles.visitorRowWrap}>
        {row}
      </TouchableOpacity>
    );
  }
  return <View style={styles.visitorRowWrap}>{row}</View>;
}

export function ProfileEmptyState({
  icon,
  title,
  hint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons name={icon} size={32} color={P.subtext} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: P.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: P.text,
    letterSpacing: 0.3,
  },
  tenureOuter: {
    marginBottom: 14,
    borderRadius: 16,
    overflow: 'hidden',
  },
  tenureGrad: {
    padding: 16,
    borderRadius: 16,
  },
  tenureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tenureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  tenureBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  tenureCounterRow: { flexDirection: 'row', alignItems: 'baseline' },
  tenureUnit: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  tenureMeta: { marginTop: 6, fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },
  bioBlock: { marginBottom: 14 },
  bioLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: P.subtext,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bioInner: {
    backgroundColor: P.cardMuted,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: P.border,
  },
  infoGroup: { gap: 8 },
  infoRowPress: {
    backgroundColor: P.cardMuted,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextCol: { flex: 1, minWidth: 0 },
  infoLabel: { fontSize: 11, fontWeight: '700', color: P.subtext, letterSpacing: 0.3 },
  infoValue: { fontSize: 15, fontWeight: '700', color: P.text, marginTop: 3, lineHeight: 20 },
  chipSection: { marginTop: 12 },
  chipSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: P.subtext,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: P.borderStrong,
  },
  chipText: { fontSize: 13, fontWeight: '700', color: P.text },
  socialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
  },
  socialBtnText: { fontSize: 13, fontWeight: '700', color: P.text },
  completionBlock: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: P.border,
  },
  completionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  completionTitle: { fontSize: 14, fontWeight: '800', color: P.text },
  completionPercent: { fontSize: 15, fontWeight: '900', color: P.accent.blue },
  completionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: P.cardMuted,
    marginTop: 10,
    overflow: 'hidden',
  },
  completionFill: { height: '100%', borderRadius: 4 },
  completionMissing: { fontSize: 12, color: P.subtext, marginTop: 6, lineHeight: 18 },
  achievementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
    borderLeftWidth: 4,
  },
  achievementEmoji: { fontSize: 22 },
  achievementTextCol: { flex: 1 },
  achievementTier: {
    fontSize: 10,
    fontWeight: '800',
    color: P.subtext,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  achievementTitle: { fontSize: 14, fontWeight: '700', color: P.text, lineHeight: 20 },
  visitorRowWrap: {
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
    overflow: 'hidden',
  },
  visitorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
  },
  visitorAvatarRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  visitorAvatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: P.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitorTextCol: { flex: 1, minWidth: 0 },
  visitorName: { fontSize: 15, fontWeight: '800', color: P.text },
  visitorMeta: { fontSize: 12, color: P.subtext, marginTop: 3, lineHeight: 17 },
  emptyState: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 12 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: P.cardMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: P.text, textAlign: 'center' },
  emptyHint: {
    fontSize: 13,
    color: P.subtext,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 8,
  },
});
