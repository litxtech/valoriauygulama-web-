import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import {
  buildTenureTimeline,
  formatTenureDate,
  tenureBreakdown,
} from '@/lib/modernProfileTenure';

export type ProfileTenureModalProps = {
  visible: boolean;
  onClose: () => void;
  daysWithUs: number;
  joinDateIso: string | null;
  anchorMs?: number;
  /** Admin / profil notu; yoksa varsayılan alt metin */
  subtitle?: string | null;
};

export function ProfileTenureModal({
  visible,
  onClose,
  daysWithUs,
  joinDateIso,
  anchorMs = Date.now(),
  subtitle,
}: ProfileTenureModalProps) {
  const { t, i18n } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const lang = i18n.language || 'tr';

  const breakdown = tenureBreakdown(daysWithUs);
  const timeline = useMemo(
    () => (joinDateIso ? buildTenureTimeline(joinDateIso, anchorMs) : []),
    [joinDateIso, anchorMs]
  );

  const cardMaxHeight = Math.min(windowHeight * 0.88 - insets.top - insets.bottom, 640);
  /** Sabit alt buton (~64) çıkarıldıktan sonra kaydırılabilir alan */
  const scrollBodyMaxHeight = Math.max(220, cardMaxHeight - 72);

  const startLabel = t('tenureStartLabel');
  const todayLabel = t('tenureTodayLabel');
  const monthLabel = t('tenureMonthLabel');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.card, { maxHeight: cardMaxHeight }]} accessibilityViewIsModal>
          <ScrollView
            style={{ maxHeight: scrollBodyMaxHeight }}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
            persistentScrollbar
            bounces
            alwaysBounceVertical
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            directionalLockEnabled
          >
            <LinearGradient
              colors={[P.gradient.start, P.gradient.end]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroTop}>
                <View style={styles.badge}>
                  <Ionicons name="ribbon" size={12} color="#fff" />
                  <Text style={styles.badgeText}>{t('tenureBadge')}</Text>
                </View>
                <TouchableOpacity
                  style={styles.heroClose}
                  onPress={onClose}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.95)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.heroTitle}>{t('tenureTitle')}</Text>
              <Text style={styles.heroHeadline}>{t('tenureHeadline', { days: daysWithUs })}</Text>
              <Text style={styles.heroSubtitle}>{subtitle?.trim() || t('tenureSubtitle')}</Text>
              <View style={styles.statRow}>
                <StatChip value={String(breakdown.years)} label={lang.startsWith('tr') ? 'Yıl' : 'Years'} />
                <StatChip value={String(breakdown.months)} label={lang.startsWith('tr') ? 'Ay' : 'Months'} />
                <StatChip value={String(breakdown.days)} label={lang.startsWith('tr') ? 'Gün' : 'Days'} />
              </View>
            </LinearGradient>

            <View style={styles.timelineSection}>
              <View style={styles.timelineHeader}>
                <Ionicons name="git-branch-outline" size={18} color={P.accent.blue} />
                <Text style={styles.timelineTitle}>{t('tenureTimelineTitle')}</Text>
              </View>
              {timeline.map((d, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === timeline.length - 1;
                const label = isFirst
                  ? startLabel
                  : isLast
                    ? todayLabel
                    : `${idx}. ${monthLabel}`;
                return (
                  <View key={`${d.toISOString()}-${idx}`} style={styles.timelineItem}>
                    <View style={styles.railCol}>
                      <View
                        style={[
                          styles.railDot,
                          isFirst && styles.railDotStart,
                          isLast && styles.railDotEnd,
                        ]}
                      />
                      {!isLast ? <View style={styles.railLine} /> : null}
                    </View>
                    <View style={[styles.timelineCard, isLast && styles.timelineCardLast]}>
                      <Text style={styles.timelineLabel}>{label}</Text>
                      <Text style={styles.timelineDate}>{formatTenureDate(d, lang)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.88}>
            <Text style={styles.closeBtnText}>{t('tenureClose')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function StatChip({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statChip}>
      <Text style={styles.statChipValue}>{value}</Text>
      <Text style={styles.statChipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: P.card,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: P.border,
    shadowColor: P.cardShell.shadowColor,
    shadowOffset: P.cardShell.shadowOffset,
    shadowOpacity: P.cardShell.shadowOpacity,
    shadowRadius: P.cardShell.shadowRadius,
    elevation: P.cardShell.elevation,
    zIndex: 2,
  },
  scrollContent: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  heroClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.3,
  },
  heroHeadline: {
    marginTop: 4,
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.9)',
    fontWeight: '500',
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  statChipValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#fff',
  },
  statChipLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelineSection: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: P.text,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  railCol: {
    width: 28,
    alignItems: 'center',
    paddingTop: 14,
  },
  railDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: P.accent.blue,
    borderWidth: 2,
    borderColor: P.card,
    zIndex: 2,
  },
  railDotStart: {
    backgroundColor: P.accent.green,
  },
  railDotEnd: {
    backgroundColor: P.accent.purple,
  },
  railLine: {
    position: 'absolute',
    top: 22,
    bottom: -8,
    width: 2,
    backgroundColor: P.borderStrong,
    borderRadius: 1,
  },
  timelineCard: {
    flex: 1,
    marginLeft: 4,
    marginBottom: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: P.cardMuted,
    borderWidth: 1,
    borderColor: P.border,
  },
  timelineCardLast: {
    borderColor: 'rgba(124, 58, 237, 0.2)',
    backgroundColor: 'rgba(124, 58, 237, 0.06)',
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: P.accent.blue,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  timelineDate: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '700',
    color: P.text,
  },
  closeBtn: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 14,
    backgroundColor: P.gradient.start,
    paddingVertical: 14,
    alignItems: 'center',
    flexShrink: 0,
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
