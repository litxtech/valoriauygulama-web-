import { memo, useEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { AnimatedCountText } from '@/components/customer/AnimatedCountText';
import { GuestHotelRestaurantSection } from '@/components/customer/GuestHotelRestaurantSection';
import { GuestBreakfastGallerySection } from '@/components/customer/GuestBreakfastGallerySection';
import { CachedImage } from '@/components/CachedImage';
import { useGuestHotelPulse } from '@/hooks/useGuestHotelPulse';
import { useGuestHotelRestaurant } from '@/hooks/useGuestHotelRestaurant';
import { useGuestBreakfastGallery } from '@/hooks/useGuestBreakfastGallery';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { guestServiceText } from '@/lib/guestServiceRequestsI18n';
import { useRouter } from 'expo-router';
import { formatFeedRelativeTime } from '@/lib/feedRelativeTime';
import { openStaffProfileWithVisit } from '@/lib/staffProfileVisits';
import type { GuestPulseActivity, GuestPulseActivityKind, GuestPulseStaffContact } from '@/lib/guestHotelPulseLoad';
import { filterGuestPulseActivitiesForGuest } from '@/lib/guestHotelPulseLoad';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { pds } from '@/constants/personelDesignSystem';

type IoniconName = ComponentProps<typeof Ionicons>['name'];
type Props = { refreshKey?: number };
type PulseTab = 'restaurant' | 'services';

const ACCENT = '#b8860b';
const LIVE_GREEN = '#22c55e';

const ACTIVITY_ICON: Record<GuestPulseActivityKind, IoniconName> = {
  check_in: 'log-in-outline',
  check_out: 'log-out-outline',
  contract: 'document-text-outline',
  cleaning: 'sparkles-outline',
  breakfast: 'cafe-outline',
  info: 'information-circle-outline',
  reservation: 'calendar-outline',
};

const ACTIVITY_COLOR: Record<GuestPulseActivityKind, string> = {
  check_in: '#22c55e',
  check_out: '#f59e0b',
  contract: '#6366f1',
  cleaning: '#0ea5e9',
  breakfast: '#d97706',
  info: '#8b5cf6',
  reservation: ACCENT,
};

function LiveDot({ size = 10, active = true }: { size?: number; active?: boolean }) {
  const pulse = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(0.3);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, active]);
  return (
    <View style={{ width: size * 1.6, height: size * 1.6, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: size * 0.8,
          backgroundColor: LIVE_GREEN + '55',
          opacity: pulse,
          transform: [{ scale: pulse.interpolate({ inputRange: [0.3, 1], outputRange: [1, 1.35] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: LIVE_GREEN }} />
    </View>
  );
}

function LiveBadge({ active = true }: { active?: boolean }) {
  const glow = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!active) {
      glow.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.6, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [glow, active]);
  return (
    <Animated.View style={[styles.liveBadge, { opacity: glow }]}>
      <LiveDot size={6} active={active} />
      <Text style={styles.liveBadgeText}>{feedSharedText('guestPulseLiveBadge')}</Text>
    </Animated.View>
  );
}

/** Nabız çizgisi — canlı his */
function PulseWaveStrip({ isNight, active = true }: { isNight: boolean; active?: boolean }) {
  const bars = useRef([0, 1, 2, 3, 4, 5, 6, 7].map(() => new Animated.Value(0.3))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach((bar) => bar.setValue(0.3));
      return;
    }
    const anims = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 80),
          Animated.timing(bar, { toValue: 1, duration: 400 + i * 30, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(bar, { toValue: 0.25, duration: 400 + i * 30, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [bars, active]);
  return (
    <View style={styles.waveRow}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            styles.waveBar,
            {
              backgroundColor: isNight ? ACCENT + 'cc' : ACCENT,
              opacity: bar,
              transform: [{ scaleY: bar.interpolate({ inputRange: [0.25, 1], outputRange: [0.35, 1] }) }],
            },
          ]}
        />
      ))}
    </View>
  );
}

function LiveStatCard({
  icon,
  value,
  label,
  color,
  textColor,
  subColor,
  isNight,
  delta,
}: {
  icon: IoniconName;
  value: number;
  label: string;
  color: string;
  textColor: string;
  subColor: string;
  isNight: boolean;
  delta?: string;
}) {
  return (
    <View style={[styles.liveStatCard, { backgroundColor: isNight ? color + '14' : color + '0d', borderColor: color + '35' }]}>
      <View style={[styles.liveStatIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <AnimatedCountText value={value} style={[styles.liveStatValue, { color: textColor }]} />
      <Text style={[styles.liveStatLabel, { color: subColor }]} numberOfLines={2}>
        {label}
      </Text>
      {delta ? (
        <View style={[styles.deltaChip, { backgroundColor: LIVE_GREEN + '22' }]}>
          <Text style={styles.deltaChipText}>{delta}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ActivityTickerCard({
  act,
  isNew,
  textColor,
  subColor,
}: {
  act: GuestPulseActivity;
  isNew: boolean;
  textColor: string;
  subColor: string;
}) {
  const c = ACTIVITY_COLOR[act.kind];
  const fade = useRef(new Animated.Value(isNew ? 0 : 1)).current;
  useEffect(() => {
    if (!isNew) return;
    Animated.timing(fade, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [isNew, fade]);

  return (
    <Animated.View style={[styles.tickerCard, { borderColor: c + '40', backgroundColor: c + '10', opacity: fade }]}>
      {isNew ? (
        <View style={[styles.tickerNew, { backgroundColor: LIVE_GREEN }]}>
          <Text style={styles.tickerNewText}>●</Text>
        </View>
      ) : null}
      <View style={[styles.tickerIcon, { backgroundColor: c + '20' }]}>
        <Ionicons name={ACTIVITY_ICON[act.kind]} size={14} color={c} />
      </View>
      <Text style={[styles.tickerLabel, { color: textColor }]} numberOfLines={2}>
        {act.label}
      </Text>
      <Text style={[styles.tickerTime, { color: subColor }]}>
        {formatFeedRelativeTime(act.created_at) || feedSharedText('timeJustNow')}
      </Text>
    </Animated.View>
  );
}

function StaffLiveCard({
  contact,
  roleLabel,
  variant,
  textColor,
  subColor,
  isNight,
  onPress,
}: {
  contact: GuestPulseStaffContact;
  roleLabel: string;
  variant: 'manager' | 'reception';
  textColor: string;
  subColor: string;
  isNight: boolean;
  onPress?: () => void;
}) {
  const accent = variant === 'manager' ? ACCENT : '#0ea5e9';
  const hasName = Boolean(contact.staffName && contact.staffName !== '—');
  const displayName = hasName
    ? contact.staffName
    : variant === 'reception'
      ? feedSharedText('guestPulseReceptionOffline')
      : feedSharedText('guestPulseManagerTitle');
  const initial = (displayName.trim()[0] ?? '?').toUpperCase();
  const tappable = Boolean(onPress && contact.staffId);

  const inner = (
    <>
      <View style={[styles.staffAvatar, { borderColor: accent + '50', backgroundColor: accent + '18' }]}>
        {contact.profileImage ? (
          <CachedImage uri={contact.profileImage} style={styles.staffAvatarImg} contentFit="cover" />
        ) : (
          <Text style={[styles.staffInitial, { color: accent }]}>{initial}</Text>
        )}
        {contact.isOnline ? <View style={styles.staffOnlineDot} /> : null}
      </View>
      <View style={styles.staffInfo}>
        <Text style={[styles.staffRole, { color: accent }]}>{roleLabel}</Text>
        <Text style={[styles.staffName, { color: textColor }]} numberOfLines={1}>
          {displayName}
        </Text>
      </View>
      {contact.isOnline ? <LiveDot size={5} /> : null}
      {tappable ? <Ionicons name="chevron-forward" size={14} color={subColor} /> : null}
    </>
  );

  const box = [styles.staffCard, { borderColor: isNight ? accent + '30' : accent + '25', backgroundColor: isNight ? accent + '0c' : accent + '08' }];
  if (tappable) {
    return (
      <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={box}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={box}>{inner}</View>;
}

export const CustomerFeedLiveDashboard = memo(function CustomerFeedLiveDashboard({ refreshKey = 0 }: Props) {
  const router = useRouter();
  const tabFocused = useIsFocused();
  const pulse = useGuestHotelPulse(refreshKey, tabFocused);
  const hotelRestaurant = useGuestHotelRestaurant(pulse.enabled, refreshKey);
  const breakfastGallery = useGuestBreakfastGallery(pulse.enabled, refreshKey);
  const { isNight, colors } = usePremiumTheme();
  const [tab, setTab] = useState<PulseTab>('restaurant');
  const [syncFlash, setSyncFlash] = useState(false);
  const prevRefresh = useRef(refreshKey);

  useEffect(() => {
    if (prevRefresh.current !== refreshKey) {
      prevRefresh.current = refreshKey;
      setSyncFlash(true);
      const t = setTimeout(() => setSyncFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [refreshKey]);

  useEffect(() => {
    if (pulse.justRefreshed) {
      setSyncFlash(true);
      const t = setTimeout(() => setSyncFlash(false), 1200);
      return () => clearTimeout(t);
    }
  }, [pulse.justRefreshed]);

  const copyWifiPassword = async () => {
    await Clipboard.setStringAsync(pulse.facilities.wifiPassword);
    Alert.alert(feedSharedText('guestPulseWifiCopiedTitle'), feedSharedText('guestPulseWifiCopied'));
  };

  const hotelName = pulse.brandName?.trim() || feedSharedText('guestPulseHotelBrand');
  const text = isNight ? colors.text : pds.text;
  const sub = isNight ? colors.subtext : pds.subtext;
  const occPct = Math.min(100, Math.max(0, pulse.ops.occupancyPercent ?? 0));
  const totalOnSite = pulse.stats.totalOnSite;
  const guestsStaying = pulse.stats.guestsInHouse;
  const staffActive = pulse.stats.staffActive;
  const heroGrad = isNight ? (['#1a1508', '#2a2210', '#1a1508'] as const) : (['#fff9eb', '#fff4d6', '#fff9eb'] as const);

  if (!pulse.enabled) return null;
  if (pulse.loading && pulse.stats.totalRooms === 0 && pulse.lifetime.totalGuestsHosted === 0) {
    return <SkeletonCard />;
  }

  const liveIds = new Set(pulse.liveActivities.map((a) => a.id));
  const activities = filterGuestPulseActivitiesForGuest(
    [...pulse.liveActivities, ...pulse.activities].filter((a, i, arr) => arr.findIndex((x) => x.id === a.id) === a.id)
  ).slice(0, 8);

  const facilityItems: { key: string; icon: IoniconName; text: string; color: string; onPress?: () => void }[] = [
    { key: 'boiler', icon: 'flame-outline', text: pulse.facilities.boilerLabel, color: pulse.facilities.boilerActive ? '#22c55e' : '#ef4444' },
    { key: 'breakfast-hours', icon: 'time-outline', text: pulse.facilities.breakfastHours, color: '#d97706' },
    { key: 'spa', icon: 'water-outline', text: pulse.facilities.spaLabel, color: '#6366f1' },
    { key: 'restaurant', icon: 'restaurant-outline', text: pulse.facilities.restaurantLabel, color: '#b45309' },
    { key: 'parking', icon: 'car-outline', text: pulse.facilities.parkingLabel, color: '#64748b' },
    { key: 'elevator', icon: 'git-compare-outline', text: pulse.facilities.elevatorLabel, color: '#475569' },
    { key: 'wifi-status', icon: 'wifi-outline', text: pulse.facilities.wifiStatus, color: '#0ea5e9' },
    { key: 'wifi-network', icon: 'radio-outline', text: feedSharedText('guestPulseWifiNetwork', { network: pulse.facilities.wifiNetwork }), color: '#0284c7' },
    { key: 'wifi-password', icon: 'key-outline', text: feedSharedText('guestPulseWifiPassword', { password: pulse.facilities.wifiPassword }), color: '#0369a1', onPress: () => void copyWifiPassword() },
    { key: 'hotel-info', icon: 'information-circle-outline', text: guestServiceText('hotelInfoTitle'), color: ACCENT, onPress: () => router.push('/customer/hotel-info') },
    { key: 'weather', icon: 'partly-sunny-outline', text: pulse.facilities.weatherLabel, color: '#f59e0b' },
    { key: 'announcement', icon: 'megaphone-outline', text: pulse.facilities.announcementLabel, color: '#8b5cf6' },
  ].filter((f) => f.text.trim());

  const showManager = Boolean((pulse.manager.staffName && pulse.manager.staffName !== '—') || pulse.manager.staffId);
  const openStaff = (id: string | null) => {
    if (id) openStaffProfileWithVisit(router, id, 'customer');
  };

  const syncLabel = pulse.justRefreshed
    ? feedSharedText('guestPulseJustSynced')
    : pulse.configUpdatedAt
      ? formatFeedRelativeTime(pulse.configUpdatedAt) || feedSharedText('guestPulseUpdatedNow')
      : feedSharedText('timeJustNow');

  const criticalAlerts: string[] = [];
  if (!pulse.facilities.boilerActive) {
    criticalAlerts.push(pulse.facilities.boilerLabel?.trim() || feedSharedText('guestPulseCriticalBoiler'));
  }
  const elevLow = pulse.facilities.elevatorLabel?.toLowerCase() ?? '';
  if (elevLow.includes('arız') || elevLow.includes('kapalı') || elevLow.includes('bakım')) {
    criticalAlerts.push(pulse.facilities.elevatorLabel.trim() || feedSharedText('guestPulseCriticalElevator'));
  }

  return (
    <View style={styles.root}>
      <View style={styles.glowWrap}>
        <LinearGradient
          colors={isNight ? ['#b8860b40', '#22c55e18', 'transparent'] : ['#b8860b30', '#22c55e12', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.glowBg}
        />
        <GlassSurface
          style={[styles.panel, pulse.justRefreshed && { borderWidth: 2, borderColor: LIVE_GREEN + '88' }]}
          borderRadius={22}
          intensity={54}
          blur={false}
          strong
        >
          {criticalAlerts.length > 0 ? (
            <View style={[styles.criticalBanner, { backgroundColor: isNight ? '#ef444422' : '#fef2f2', borderColor: '#ef444455' }]}>
              <Ionicons name="warning-outline" size={18} color="#ef4444" />
              <Text style={[styles.criticalText, { color: isNight ? '#fecaca' : '#991b1b' }]} numberOfLines={3}>
                {criticalAlerts.join(' · ')}
              </Text>
            </View>
          ) : null}

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <LiveDot active={tabFocused} />
              <View style={styles.headerTitles}>
                <Text style={[styles.headerTitle, { color: text }]}>{feedSharedText('guestHomeLivePulse')}</Text>
                <Text style={[styles.headerBrand, { color: sub }]} numberOfLines={1}>
                  {hotelName}
                </Text>
              </View>
            </View>
            <LiveBadge active={tabFocused} />
          </View>

          <View style={styles.syncRow}>
            <PulseWaveStrip isNight={isNight} active={tabFocused} />
            <Text style={[styles.syncText, (syncFlash || pulse.justRefreshed) && { color: LIVE_GREEN, fontWeight: '800' }]}>
              {syncLabel} · {feedSharedText('guestPulsePopulationTitle')}
            </Text>
          </View>

          {/* Ana nabız kartı */}
          <LinearGradient colors={heroGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.heroLive, { borderColor: ACCENT + (isNight ? '45' : '35') }]}>
            <View style={styles.heroRow}>
              <View style={styles.heroLeft}>
                <AnimatedCountText value={totalOnSite} style={[styles.heroNum, { color: text }]} />
                <Text style={[styles.heroCap, { color: sub }]}>{feedSharedText('guestPulseTotalOnSite')}</Text>
                <Text style={[styles.heroBreakdown, { color: sub }]}>
                  {feedSharedText('guestPulsePopulationBreakdown', { guests: guestsStaying, staff: staffActive })}
                </Text>
                {pulse.deltaHints.totalOnSite ? (
                  <Text style={styles.heroDelta}>{pulse.deltaHints.totalOnSite}</Text>
                ) : null}
              </View>
              <View style={styles.heroOccBox}>
                <Text style={[styles.heroOccNum, { color: ACCENT }]}>%{occPct}</Text>
                <Text style={[styles.heroOccLbl, { color: sub }]}>{feedSharedText('guestPulseOccupancy')}</Text>
              </View>
            </View>
            <View style={[styles.occTrack, { backgroundColor: isNight ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)' }]}>
              <LinearGradient colors={['#22c55e', '#b8860b', '#d97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.occFill, { width: `${occPct}%` }]} />
            </View>
            <Text style={[styles.heroMeta, { color: sub }]}>
              {feedSharedText('guestPulseRoomMeta', { occupied: pulse.stats.occupiedRooms, vacant: pulse.stats.vacantRooms })}
            </Text>
            {pulse.stats.totalRooms > 0 ? (
              <Text style={[styles.heroMove, { color: sub }]}>
                {feedSharedText('guestPulseRoomCapacity', {
                  occupied: pulse.stats.occupiedRooms,
                  total: pulse.stats.totalRooms,
                })}
              </Text>
            ) : null}
          </LinearGradient>

          {/* Nüfus / doluluk metrikleri */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statStrip}>
            <LiveStatCard
              icon="business-outline"
              value={totalOnSite}
              label={feedSharedText('guestPulseStatTotalOnSite')}
              color={ACCENT}
              textColor={text}
              subColor={sub}
              isNight={isNight}
              delta={pulse.deltaHints.totalOnSite}
            />
            <LiveStatCard
              icon="people-outline"
              value={guestsStaying}
              label={feedSharedText('guestPulseStatGuests')}
              color="#22c55e"
              textColor={text}
              subColor={sub}
              isNight={isNight}
              delta={pulse.deltaHints.guestsInHouse}
            />
            <LiveStatCard
              icon="id-card-outline"
              value={staffActive}
              label={feedSharedText('guestPulseStatStaffActive')}
              color="#6366f1"
              textColor={text}
              subColor={sub}
              isNight={isNight}
              delta={pulse.deltaHints.staffActive}
            />
            <LiveStatCard
              icon="radio-outline"
              value={pulse.ops.staffOnline}
              label={feedSharedText('guestPulseStatStaffOnline')}
              color="#0ea5e9"
              textColor={text}
              subColor={sub}
              isNight={isNight}
            />
            <LiveStatCard
              icon="stats-chart-outline"
              value={occPct}
              label={feedSharedText('guestPulseOccupancy')}
              color="#d97706"
              textColor={text}
              subColor={sub}
              isNight={isNight}
            />
          </ScrollView>

          {/* Canlı aktivite akışı */}
          <View style={styles.sectionHead}>
            <Ionicons name="pulse" size={16} color={ACCENT} />
            <Text style={[styles.sectionTitle, { color: text }]}>
              {activities.length > 0
                ? `${feedSharedText('guestPulseLiveBadge')} · ${feedSharedText('guestPulseLiveServicesTitle')}`
                : feedSharedText('guestPulseNoActivityYet')}
            </Text>
          </View>
          {activities.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickerRow}>
              {activities.map((act) => (
                <ActivityTickerCard key={act.id} act={act} isNew={liveIds.has(act.id)} textColor={text} subColor={sub} />
              ))}
            </ScrollView>
          ) : (
            <View style={[styles.emptyLive, { borderColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <PulseWaveStrip isNight={isNight} active={tabFocused} />
              <Text style={[styles.emptyLiveText, { color: sub }]}>{feedSharedText('guestPulsePopulationQuiet')}</Text>
            </View>
          )}

          {/* Personel */}
          <View style={styles.staffRow}>
            {showManager ? (
              <StaffLiveCard
                contact={pulse.manager}
                roleLabel={pulse.manager.roleLabel?.trim() || feedSharedText('guestPulseManagerTitle')}
                variant="manager"
                textColor={text}
                subColor={sub}
                isNight={isNight}
                onPress={() => openStaff(pulse.manager.staffId)}
              />
            ) : null}
            <StaffLiveCard
              contact={pulse.reception}
              roleLabel={feedSharedText('guestPulseLiveReception')}
              variant="reception"
              textColor={text}
              subColor={sub}
              isNight={isNight}
              onPress={() => openStaff(pulse.reception.staffId)}
            />
          </View>

          {/* Kurumsal özet */}
          <View style={[styles.lifetimeRow, { backgroundColor: isNight ? ACCENT + '10' : ACCENT + '08', borderColor: ACCENT + '28' }]}>
            <View style={styles.lifetimeItem}>
              <AnimatedCountText value={pulse.lifetime.totalGuestsHosted} style={[styles.lifetimeNum, { color: text }]} />
              <Text style={[styles.lifetimeLbl, { color: sub }]} numberOfLines={2}>
                {feedSharedText('guestPulseLifetimeGuests')}
              </Text>
            </View>
            <View style={[styles.lifetimeSep, { backgroundColor: ACCENT + '30' }]} />
            <View style={styles.lifetimeItem}>
              <AnimatedCountText value={pulse.lifetime.completedStays} style={[styles.lifetimeNum, { color: text }]} />
              <Text style={[styles.lifetimeLbl, { color: sub }]} numberOfLines={2}>
                {feedSharedText('guestPulseLifetimeStays')}
              </Text>
            </View>
          </View>

          {/* Alt sekmeler: sadece restoran / tesis */}
          <View style={[styles.tabRow, { backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'restaurant' && styles.tabBtnOn, tab === 'restaurant' && { backgroundColor: isNight ? 'rgba(255,255,255,0.12)' : '#fff' }]}
              onPress={() => setTab('restaurant')}
              activeOpacity={0.85}
            >
              <Ionicons name="restaurant-outline" size={16} color={tab === 'restaurant' ? ACCENT : sub} />
              <Text style={[styles.tabLbl, { color: tab === 'restaurant' ? text : sub }]}>{feedSharedText('guestPulseTabRestaurant')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, tab === 'services' && styles.tabBtnOn, tab === 'services' && { backgroundColor: isNight ? 'rgba(255,255,255,0.12)' : '#fff' }]}
              onPress={() => setTab('services')}
              activeOpacity={0.85}
            >
              <Ionicons name="business-outline" size={16} color={tab === 'services' ? ACCENT : sub} />
              <Text style={[styles.tabLbl, { color: tab === 'services' ? text : sub }]}>{feedSharedText('guestPulseTabServices')}</Text>
            </TouchableOpacity>
          </View>

          {tab === 'restaurant' ? (
            <View style={styles.tabBody}>
              <Text style={[styles.blockTitle, { color: text }]}>{feedSharedText('guestPulseBreakfastGalleryTitle')}</Text>
              <GuestBreakfastGallerySection items={breakfastGallery.items} loading={breakfastGallery.loading} textColor={text} subColor={sub} isNight={isNight} compact />
              <GuestHotelRestaurantSection venues={hotelRestaurant.venues} menuItems={hotelRestaurant.menuItems} loading={hotelRestaurant.loading} textColor={text} subColor={sub} isNight={isNight} />
            </View>
          ) : null}

          {tab === 'services' ? (
            <View style={styles.tabBody}>
              <View style={styles.serviceQuick}>
                {(
                  [
                    { icon: 'sparkles-outline' as IoniconName, color: '#0ea5e9', label: guestServiceText('type_room_cleaning'), href: '/customer/service-requests/new?type=room_cleaning' },
                    { icon: 'search-outline' as IoniconName, color: '#ef4444', label: guestServiceText('homeLostItem'), href: '/customer/service-requests/new?type=lost_item' },
                    { icon: 'list-outline' as IoniconName, color: ACCENT, label: guestServiceText('screenTitle'), href: '/customer/service-requests' },
                  ] as const
                ).map((item) => (
                  <TouchableOpacity key={item.href} style={[styles.serviceBtn, { borderColor: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]} onPress={() => router.push(item.href)} activeOpacity={0.85}>
                    <Ionicons name={item.icon} size={20} color={item.color} />
                    <Text style={[styles.serviceBtnText, { color: text }]} numberOfLines={2}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={[styles.blockTitle, { color: text, marginTop: 12 }]}>{feedSharedText('guestPulseFacilitiesTitle')}</Text>
              {facilityItems.length > 0 ? (
                facilityItems.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.facilityRow, { borderBottomColor: isNight ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }]}
                    onPress={f.onPress}
                    disabled={!f.onPress}
                    activeOpacity={f.onPress ? 0.82 : 1}
                  >
                    <View style={[styles.facilityIcon, { backgroundColor: f.color + '16' }]}>
                      <Ionicons name={f.icon} size={16} color={f.color} />
                    </View>
                    <Text style={[styles.facilityText, { color: text }]} numberOfLines={2}>
                      {f.text}
                    </Text>
                    {f.onPress ? <Ionicons name="copy-outline" size={16} color={sub} /> : null}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={[styles.emptyHint, { color: sub }]}>{feedSharedText('guestPulseNoFacilitiesYet')}</Text>
              )}
            </View>
          ) : null}
        </GlassSurface>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { marginBottom: 8, width: '100%' },
  glowWrap: { position: 'relative' },
  glowBg: { position: 'absolute', top: -6, left: -6, right: -6, bottom: -6, borderRadius: 26, opacity: 0.85 },
  panel: { padding: 16, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#b8860b', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } }, android: { elevation: 5 } }) },
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  criticalText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  headerTitles: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.4 },
  headerBrand: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: LIVE_GREEN + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LIVE_GREEN + '40',
  },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: LIVE_GREEN, letterSpacing: 1.2 },

  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  syncText: { fontSize: 11, fontWeight: '600', color: '#94a3b8', flex: 1 },
  waveRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18, width: 48 },
  waveBar: { width: 3, height: 16, borderRadius: 2 },

  heroLive: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 10 },
  heroLeft: { flex: 1 },
  heroNum: { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 54 },
  heroCap: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  heroBreakdown: { fontSize: 12, fontWeight: '600', marginTop: 6, lineHeight: 16 },
  heroDelta: { fontSize: 12, fontWeight: '800', color: LIVE_GREEN, marginTop: 4 },
  heroOccBox: { alignItems: 'flex-end' },
  heroOccNum: { fontSize: 28, fontWeight: '900' },
  heroOccLbl: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  occTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 8 },
  occFill: { height: '100%', borderRadius: 999 },
  heroMeta: { fontSize: 12, fontWeight: '600' },
  heroMove: { fontSize: 12, fontWeight: '600', marginTop: 4 },

  statStrip: { gap: 10, paddingBottom: 14 },
  liveStatCard: { width: 108, padding: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  liveStatIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  liveStatValue: { fontSize: 22, fontWeight: '900' },
  liveStatLabel: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13 },
  deltaChip: { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  deltaChipText: { fontSize: 9, fontWeight: '800', color: LIVE_GREEN },

  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800' },
  tickerRow: { gap: 10, paddingBottom: 14 },
  tickerCard: { width: 140, padding: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  tickerNew: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  tickerNewText: { fontSize: 6, color: '#fff' },
  tickerIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tickerLabel: { fontSize: 12, fontWeight: '700', lineHeight: 15 },
  tickerTime: { fontSize: 10, fontWeight: '600' },

  emptyLive: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  emptyLiveText: { fontSize: 12, fontWeight: '600', flex: 1 },

  flowZone: { marginBottom: 14 },
  flowZoneTitle: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  flowBlock: { marginBottom: 8 },
  flowLbl: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  chipRow: { flexDirection: 'row', gap: 6 },
  roomChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  roomChipText: { fontSize: 12, fontWeight: '800' },

  staffRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  staffCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, minWidth: 0 },
  staffAvatar: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  staffAvatarImg: { width: '100%', height: '100%' },
  staffInitial: { fontSize: 16, fontWeight: '900' },
  staffOnlineDot: { position: 'absolute', bottom: 2, right: 2, width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE_GREEN, borderWidth: 1.5, borderColor: '#fff' },
  staffInfo: { flex: 1, minWidth: 0 },
  staffRole: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  staffName: { fontSize: 13, fontWeight: '800' },

  lifetimeRow: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 14, alignItems: 'center' },
  lifetimeItem: { flex: 1, alignItems: 'center', gap: 2 },
  lifetimeSep: { width: 1, height: 36 },
  lifetimeNum: { fontSize: 18, fontWeight: '900' },
  lifetimeLbl: { fontSize: 9, fontWeight: '600', textAlign: 'center', lineHeight: 12 },

  tabRow: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 6, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  tabBtnOn: Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 } }),
  tabLbl: { fontSize: 12, fontWeight: '800' },
  tabBody: { minHeight: 40 },
  blockTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },

  serviceQuick: { flexDirection: 'row', gap: 8 },
  serviceBtn: { flex: 1, alignItems: 'center', gap: 6, padding: 12, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(184,134,11,0.05)' },
  serviceBtnText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  facilityRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  facilityIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  facilityText: { flex: 1, fontSize: 13, fontWeight: '600' },
  emptyHint: { fontSize: 13, paddingVertical: 8 },
});
