import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { FastPress } from '@/components/ui/FastPress';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { hapticImpactLight, hapticSelection } from '@/lib/hapticsSafe';
import { runAfterUiReady } from '@/lib/runAfterUiReady';
import {
  STAFF_HAMBURGER_ITEM_PRESS_GUARD_MS,
  clearStaffHamburgerMenuRestore,
  peekStaffHamburgerMenuRestore,
} from '@/lib/staffHamburgerNavigation';
import { StaffAttendanceHamburgerShortcuts } from '@/components/header/StaffAttendanceHamburgerShortcuts';
import { AdminAttendanceHamburgerButton } from '@/components/header/AdminAttendanceHamburgerButton';
import { StaffHamburgerRecentFlyout } from '@/components/header/StaffHamburgerRecentFlyout';
import type {
  StaffHamburgerMenuItem,
  StaffHamburgerMenuLayout,
  StaffHamburgerMenuSection,
  StaffHamburgerMenuSectionId,
} from '@/lib/staffHamburgerMenu';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import {
  coalesceStaffHamburgerTheme,
  getDefaultResolvedStaffHamburgerTheme,
  resolveMenuItemAccent,
  resolveMenuSectionColor,
  type ResolvedStaffHamburgerTheme,
} from '@/lib/staffHamburgerTheme';

export type StaffQuickMenuItem = StaffHamburgerMenuItem;

export type StaffMenuIdentity = {
  fullName: string | null;
  profileImage: string | null;
  roleLabel: string;
  department: string | null;
  organizationName: string | null;
};

type Props = {
  visible: boolean;
  /** Menüden sayfaya geçerken tam ekran opak perde. */
  navigatingAway?: boolean;
  /** Geri dönüşte animasyonsuz aç (menü oturumu). */
  instant?: boolean;
  onClose: () => void;
  closeLabel: string;
  identity?: StaffMenuIdentity | null;
  onProfilePress?: () => void;
  layout?: StaffHamburgerMenuLayout | null;
  menuTheme?: ResolvedStaffHamburgerTheme | null;
  recentItems?: StaffHamburgerMenuItem[];
  showAttendanceShortcuts?: boolean;
  showAdminAttendancePanel?: boolean;
  onAdminAttendanceNavigate?: () => void;
  onSelect: (href: string, target?: { itemId?: string; scrollY?: number; item?: StaffHamburgerMenuItem }) => void;
  onSignOutPress?: () => void;
};

const OPEN_MS = Platform.OS === 'android' ? 0 : 120;
const CLOSE_MS = Platform.OS === 'android' ? 0 : 100;

/** Sağda ince son-kullanılan ikon şeridi — sabit; ana panel runtime genişlikten hesaplanır. */
const FLYOUT_W = 50;
const DRAWER_RADIUS = 26;
const H_PAD = 16;
const SEARCH_MIN_ITEMS = 6;
const IS_ANDROID = Platform.OS === 'android';
/** Android: çift dokunuş koruması — görsel açılışı geciktirmez. */
const ANDROID_ITEM_PRESS_GUARD_MS = 28;

const SECTION_THEME: Record<StaffHamburgerMenuSectionId, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  fnb: { color: '#ea580c', icon: 'grid-outline' },
  kitchen: { color: '#ea580c', icon: 'restaurant-outline' },
  nav: { color: '#6366f1', icon: 'compass-outline' },
  staff: { color: '#ea580c', icon: 'person-outline' },
  hotel: { color: '#0d9488', icon: 'bed-outline' },
  payments: { color: '#635bff', icon: 'card-outline' },
  ops: { color: '#2563eb', icon: 'construct-outline' },
  admin: { color: '#7c3aed', icon: 'shield-checkmark-outline' },
};

/** Android: her satırda LinearGradient yerine düz renk (admin panel ile aynı yaklaşım). */
function accentTintBg(accent: string, alpha = '28') {
  return `${accent}${alpha}`;
}

function go(
  onSelect: (href: string, target?: { itemId?: string; scrollY?: number; item?: StaffHamburgerMenuItem }) => void,
  href: string,
  canPress: boolean,
  item: StaffHamburgerMenuItem,
  scrollY: number
) {
  if (!canPress) return;
  hapticSelection();
  onSelect(href, { itemId: item.id, scrollY, item });
}

function sectionIdForMenuItem(
  sections: StaffHamburgerMenuSection[],
  itemId: string | null | undefined
): string | null {
  if (!itemId) return null;
  for (const section of sections) {
    if ((section.items ?? []).some((item) => item.id === itemId)) return section.id;
  }
  return null;
}

function filterMenuItems(items: StaffHamburgerMenuItem[], query: string): StaffHamburgerMenuItem[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLocaleLowerCase().includes(q));
}

function filterSections(sections: StaffHamburgerMenuSection[], query: string): StaffHamburgerMenuSection[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: (section.items ?? []).filter((i) => i.label.toLocaleLowerCase().includes(q)),
    }))
    .filter((s) => (s.items?.length ?? 0) > 0);
}

function HubCard({
  item,
  onPress,
  palette,
  theme,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  palette: PersonelDesignPalette;
  theme: ResolvedStaffHamburgerTheme;
}) {
  const accent = resolveMenuItemAccent(item.id, item.accent, theme);
  const body = (
    <>
      <View style={[styles.hubIcon, { backgroundColor: accentTintBg(accent) }]}>
        <Ionicons name={item.icon} size={22} color={accent} />
      </View>
      <Text style={[styles.hubLabel, { color: palette.text }]} numberOfLines={2}>
        {item.label}
      </Text>
    </>
  );

  if (IS_ANDROID) {
    return (
      <FastPress
        onPress={onPress}
        style={[styles.hubCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
        rippleColor={`${accent}22`}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        {body}
      </FastPress>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.hubCard, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {body}
    </TouchableOpacity>
  );
}

function PrimaryActionButton({
  item,
  onPress,
  theme,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  theme: ResolvedStaffHamburgerTheme;
}) {
  const isEmergency = item.id === 'emergency';
  const gradColors = (
    (theme.primaryButtonGradient?.length ?? 0) >= 2
      ? theme.primaryButtonGradient
      : isEmergency
        ? (['#dc2626', '#ef4444', '#f87171'] as const)
        : (['#f43f5e', '#fb7185', '#fda4af'] as const)
  ) as readonly [string, string, ...string[]];
  const androidBg = theme.primaryButtonColor ?? (isEmergency ? '#dc2626' : '#f43f5e');

  if (IS_ANDROID) {
    return (
      <FastPress
        onPress={onPress}
        style={styles.primaryWrap}
        rippleColor="rgba(255,255,255,0.25)"
        accessibilityRole="button"
      >
        <View style={[styles.primaryBtn, styles.primaryBtnAndroid, { backgroundColor: androidBg }]}>
          <View style={styles.primaryIconBubble}>
            <Ionicons name={item.icon} size={22} color="#fff" />
          </View>
          <Text style={styles.primaryLabel}>{item.label}</Text>
        </View>
      </FastPress>
    );
  }

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.9} style={styles.primaryWrap} accessibilityRole="button">
      <LinearGradient
        colors={gradColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryBtn}
      >
        <View style={styles.primaryIconBubble}>
          <Ionicons name={item.icon} size={22} color="#fff" />
        </View>
        <Text style={styles.primaryLabel}>{item.label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function MenuListRow({
  item,
  onPress,
  isLast,
  palette,
  theme,
  compact,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  isLast: boolean;
  palette: PersonelDesignPalette;
  theme: ResolvedStaffHamburgerTheme;
  compact?: boolean;
}) {
  const accent = resolveMenuItemAccent(item.id, item.accent, theme);
  const iconNode = (
    <View style={[styles.listIcon, compact && styles.listIconCompact, { backgroundColor: accentTintBg(accent) }]}>
      <Ionicons name={item.icon} size={compact ? 17 : 19} color={accent} />
    </View>
  );

  const rowBody = (
    <>
      {iconNode}
      <Text style={[styles.listLabel, { color: palette.text }]} numberOfLines={2}>
        {item.label}
      </Text>
      <View
        style={[
          styles.listChevron,
          IS_ANDROID && styles.listChevronAndroid,
          { backgroundColor: palette.secondaryBtn },
        ]}
      >
        <Ionicons name="chevron-forward" size={16} color={palette.indigo} />
      </View>
    </>
  );

  if (IS_ANDROID) {
    return (
      <FastPress
        onPress={onPress}
        style={[styles.listRow, compact && styles.listRowCompact, !isLast && [styles.listRowDivider, { borderBottomColor: palette.cardBorder }]]}
        rippleColor={`${accent}22`}
        accessibilityRole="button"
        accessibilityLabel={item.label}
      >
        {rowBody}
      </FastPress>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[styles.listRow, compact && styles.listRowCompact, !isLast && [styles.listRowDivider, { borderBottomColor: palette.cardBorder }]]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {rowBody}
    </TouchableOpacity>
  );
}

const MenuListRowMemo = memo(MenuListRow);

function MenuGridTile({
  item,
  onPress,
  palette,
  theme,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  palette: PersonelDesignPalette;
  theme: ResolvedStaffHamburgerTheme;
}) {
  const accent = resolveMenuItemAccent(item.id, item.accent, theme);
  const body = (
    <>
      <View style={[styles.gridIcon, { backgroundColor: accentTintBg(accent) }]}>
        <Ionicons name={item.icon} size={22} color={accent} />
      </View>
      <Text style={[styles.gridLabel, { color: palette.text }]} numberOfLines={2}>
        {item.label}
      </Text>
    </>
  );
  const tileStyle = [styles.gridTile, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }];
  if (IS_ANDROID) {
    return (
      <FastPress onPress={onPress} style={tileStyle} rippleColor={`${accent}22`} accessibilityRole="button" accessibilityLabel={item.label}>
        {body}
      </FastPress>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={tileStyle} accessibilityRole="button" accessibilityLabel={item.label}>
      {body}
    </TouchableOpacity>
  );
}

function MenuPillItem({
  item,
  onPress,
  palette,
  theme,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  palette: PersonelDesignPalette;
  theme: ResolvedStaffHamburgerTheme;
}) {
  const accent = resolveMenuItemAccent(item.id, item.accent, theme);
  const pillStyle = [styles.pillItem, { backgroundColor: accentTintBg(accent, '33'), borderColor: `${accent}44` }];
  const inner = (
    <>
      <Ionicons name={item.icon} size={16} color={accent} />
      <Text style={[styles.pillLabel, { color: palette.text }]} numberOfLines={1}>
        {item.label}
      </Text>
    </>
  );
  if (IS_ANDROID) {
    return (
      <FastPress onPress={onPress} style={pillStyle} rippleColor={`${accent}22`} accessibilityRole="button" accessibilityLabel={item.label}>
        {inner}
      </FastPress>
    );
  }
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={pillStyle} accessibilityRole="button" accessibilityLabel={item.label}>
      {inner}
    </TouchableOpacity>
  );
}

function UnifiedMenuHeader({
  identity,
  paddingTop,
  closeLabel,
  onClose,
  onProfilePress,
  theme,
  palette,
}: {
  identity: StaffMenuIdentity;
  paddingTop: number;
  closeLabel: string;
  onClose: () => void;
  onProfilePress?: () => void;
  theme: ResolvedStaffHamburgerTheme;
  palette: PersonelDesignPalette;
}) {
  const displayName = identity.fullName?.trim() || '—';
  const isMinimal = theme.headerStyle === 'minimal';
  const isSolid = theme.headerStyle === 'solid';
  const identityColors = (
    isSolid || isMinimal
      ? [theme.headerSolidColor, theme.headerSolidColor]
      : (theme.headerGradient?.length ?? 0) >= 2
        ? theme.headerGradient
        : ['#6366f1', '#8b5cf6']
  ) as readonly [string, string, ...string[]];
  const minimalText = palette.text;
  const minimalSub = palette.muted;

  const identityBody = (
    <>
      <View style={styles.avatarRing}>
        {identity.profileImage ? (
          <CachedImage uri={identity.profileImage} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.identityTextCol}>
        <Text style={[styles.identityName, isMinimal && { color: minimalText }]} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={[styles.rolePill, isMinimal && styles.rolePillMinimal]}>
          <Text style={[styles.rolePillText, isMinimal && { color: minimalSub }]} numberOfLines={1}>
            {identity.roleLabel}
          </Text>
        </View>
        {[identity.department?.trim(), identity.organizationName?.trim()].filter(Boolean).length > 0 ? (
          <Text style={[styles.identitySub, isMinimal && { color: minimalSub }]} numberOfLines={2}>
            {[identity.department?.trim(), identity.organizationName?.trim()].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (isMinimal) {
    return (
      <View
        style={[
          styles.unifiedHeader,
          styles.minimalHeader,
          { paddingTop, backgroundColor: theme.headerSolidColor || palette.pageBg, borderBottomColor: palette.cardBorder },
        ]}
      >
        <TouchableOpacity
          onPress={onClose}
          style={[styles.headerDismissBtn, styles.headerDismissBtnMinimal, { top: paddingTop + 6, backgroundColor: palette.secondaryBtn }]}
          activeOpacity={0.82}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Ionicons name="chevron-back" size={20} color={palette.text} />
        </TouchableOpacity>
        {onProfilePress ? (
          <TouchableOpacity onPress={onProfilePress} activeOpacity={0.88} style={styles.identityPressableFull} accessibilityRole="button" accessibilityLabel={displayName}>
            {identityBody}
          </TouchableOpacity>
        ) : (
          <View style={styles.identityPressableFull}>{identityBody}</View>
        )}
      </View>
    );
  }

  return (
    <LinearGradient
      colors={identityColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.unifiedHeader, { paddingTop }]}
    >
      <View style={styles.identityDecorA} pointerEvents="none" />
      <View style={styles.identityDecorB} pointerEvents="none" />
      <TouchableOpacity
        onPress={onClose}
        style={[styles.headerDismissBtn, { top: paddingTop + 6 }]}
        activeOpacity={0.82}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      >
        <Ionicons name="chevron-back" size={20} color="#fff" />
      </TouchableOpacity>
      {onProfilePress ? (
        <TouchableOpacity
          onPress={onProfilePress}
          activeOpacity={0.88}
          style={styles.identityPressableFull}
          accessibilityRole="button"
          accessibilityLabel={displayName}
        >
          {identityBody}
        </TouchableOpacity>
      ) : (
        <View style={styles.identityPressableFull}>{identityBody}</View>
      )}
    </LinearGradient>
  );
}

export const StaffQuickMenuSheet = memo(function StaffQuickMenuSheet({
  visible,
  navigatingAway = false,
  instant = false,
  onClose,
  closeLabel,
  identity,
  onProfilePress,
  layout,
  menuTheme: menuThemeProp,
  recentItems = [],
  showAttendanceShortcuts = false,
  showAdminAttendancePanel = false,
  onAdminAttendanceNavigate,
  onSelect,
  onSignOutPress,
}: Props) {
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const palette = usePersonelDesign();
  const menuTheme = useMemo((): ResolvedStaffHamburgerTheme => {
    try {
      return coalesceStaffHamburgerTheme(menuThemeProp);
    } catch {
      return getDefaultResolvedStaffHamburgerTheme();
    }
  }, [menuThemeProp]);
  const showRecentFlyout = menuTheme.showRecentFlyout !== false;
  const panelWidth = windowWidth > 0 ? windowWidth : 390;
  const drawerWidth = showRecentFlyout ? Math.max(0, panelWidth - FLYOUT_W) : panelWidth;
  const effectivePalette = useMemo(
    (): PersonelDesignPalette =>
      ({
        ...palette,
        pageBg: menuTheme.drawerBackground ?? palette.pageBg,
        cardBg: menuTheme.cardBackground ?? palette.cardBg,
        cardBorder: menuTheme.cardBorder ?? palette.cardBorder,
        text: menuTheme.textColor ?? palette.text,
        muted: menuTheme.mutedTextColor ?? palette.muted,
        indigo: menuTheme.chevronColor ?? palette.indigo,
      }) as PersonelDesignPalette,
    [palette, menuTheme]
  );
  const [searchQuery, setSearchQuery] = useState('');
  /** Açılışta hamburger konumundaki çift dokunuş menü satırına düşmesin. */
  const [itemsPressEnabled, setItemsPressEnabled] = useState(false);
  /** Kapanış animasyonu bitene kadar mount tut. */
  const [mounted, setMounted] = useState(visible);

  const primary = layout?.primary ?? null;
  const hubs = layout?.hubs ?? [];
  const sections = layout?.sections ?? [];

  const filteredHubs = useMemo(() => filterMenuItems(hubs, searchQuery), [hubs, searchQuery]);
  const filteredSections = useMemo(
    () => filterSections(sections, searchQuery),
    [sections, searchQuery]
  );
  const sectionItemCount = useMemo(
    () => hubs.length + sections.reduce((n, s) => n + (s.items?.length ?? 0), 0),
    [hubs, sections]
  );
  const showSearch =
    menuTheme.showSearch && sectionItemCount >= (menuTheme.searchMinItems ?? SEARCH_MIN_ITEMS);
  const isCompact = menuTheme.layoutMode === 'compact';
  const useGrid = menuTheme.layoutMode === 'grid' || menuTheme.itemStyle === 'grid';
  const usePill = menuTheme.itemStyle === 'pill';
  const showHubs = menuTheme.showHubCards && filteredHubs.length > 0;

  const insets = useSafeAreaInsets();
  const backdrop = useRef(new Animated.Value(0)).current;
  const drawer = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollYRef = useRef(0);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const listCardOffsetsRef = useRef<Record<string, number>>({});
  const itemOffsetsRef = useRef<Record<string, number>>({});
  const restoreTargetRef = useRef<{ itemId: string | null; scrollY: number | null } | null>(null);
  const restoreAppliedRef = useRef(false);

  const tryApplyMenuScrollRestore = useCallback(() => {
    if (restoreAppliedRef.current) return true;
    const target = restoreTargetRef.current ?? peekStaffHamburgerMenuRestore();
    if (!target.itemId && (target.scrollY == null || target.scrollY <= 0)) return false;

    let y: number | null = null;
    if (target.itemId && itemOffsetsRef.current[target.itemId] != null) {
      y = itemOffsetsRef.current[target.itemId]!;
    } else {
      const sectionId = sectionIdForMenuItem(sections, target.itemId);
      if (sectionId && sectionOffsetsRef.current[sectionId] != null) {
        y = sectionOffsetsRef.current[sectionId]!;
      }
    }
    if (y == null && target.scrollY != null && target.scrollY > 0) {
      y = target.scrollY;
    }
    if (y == null) return false;

    scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: false });
    restoreAppliedRef.current = true;
    restoreTargetRef.current = null;
    clearStaffHamburgerMenuRestore();
    return true;
  }, [sections]);

  const queueMenuScrollRestore = useCallback(() => {
    restoreAppliedRef.current = false;
    restoreTargetRef.current = peekStaffHamburgerMenuRestore();
    sectionOffsetsRef.current = {};
    listCardOffsetsRef.current = {};
    itemOffsetsRef.current = {};
    tryApplyMenuScrollRestore();
  }, [tryApplyMenuScrollRestore]);

  const runCloseAnimation = useCallback(
    (then?: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setSearchQuery('');
      setItemsPressEnabled(false);
      if (IS_ANDROID || CLOSE_MS === 0) {
        backdrop.setValue(0);
        drawer.setValue(0);
        closingRef.current = false;
        setMounted(false);
        then?.();
        return;
      }
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: CLOSE_MS, useNativeDriver: true }),
        Animated.timing(drawer, {
          toValue: 0,
          duration: CLOSE_MS,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        closingRef.current = false;
        if (finished) {
          setMounted(false);
          then?.();
        }
      });
    },
    [backdrop, drawer]
  );

  useEffect(() => {
    if (visible) return;
    restoreAppliedRef.current = false;
  }, [visible]);

  useEffect(() => {
    if (IS_ANDROID) {
      if (!visible) {
        setSearchQuery('');
        setItemsPressEnabled(false);
        return;
      }
      setItemsPressEnabled(false);
      const task = runAfterUiReady(() => setItemsPressEnabled(true), {
        androidOnly: false,
        delayMs: ANDROID_ITEM_PRESS_GUARD_MS,
      });
      return () => task.cancel();
    }

    if (!visible && mounted && !instant && !navigatingAway) {
      runCloseAnimation();
    }
  }, [visible, mounted, instant, navigatingAway, runCloseAnimation]);

  useLayoutEffect(() => {
    if (IS_ANDROID) return;
    if (visible || navigatingAway) {
      if (!mounted) setMounted(true);
      return;
    }
    if (instant && mounted) {
      closingRef.current = false;
      backdrop.setValue(0);
      drawer.setValue(0);
      setMounted(false);
    }
  }, [visible, navigatingAway, instant, mounted, backdrop, drawer]);

  useLayoutEffect(() => {
    if (!visible || !instant) return;
    if (!IS_ANDROID && !mounted) return;
    queueMenuScrollRestore();
  }, [visible, instant, mounted, queueMenuScrollRestore]);

  useEffect(() => {
    if (IS_ANDROID || !visible) return;
    closingRef.current = false;
    setItemsPressEnabled(false);
    const guardMs = instant ? 40 : STAFF_HAMBURGER_ITEM_PRESS_GUARD_MS;
    const task = runAfterUiReady(() => setItemsPressEnabled(true), {
      androidOnly: false,
      delayMs: guardMs,
    });

    if (instant || OPEN_MS === 0) {
      backdrop.setValue(1);
      drawer.setValue(1);
    } else {
      backdrop.setValue(0);
      drawer.setValue(0);
      hapticImpactLight();
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: OPEN_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drawer, {
          toValue: 1,
          duration: OPEN_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
    return () => task.cancel();
  }, [visible, instant, backdrop, drawer]);

  const panelOffscreenX = -panelWidth;
  const drawerTranslateX = drawer.interpolate({
    inputRange: [0, 1],
    outputRange: [panelOffscreenX, 0],
  });

  const handleClosePress = useCallback(() => {
    onClose();
  }, [onClose]);

  const drawerBg = effectivePalette.pageBg;
  const panelShellStyle = [
    styles.menuPanel,
    IS_ANDROID && styles.menuPanelAndroid,
    {
      width: panelWidth,
      backgroundColor: drawerBg,
      borderColor: effectivePalette.cardBorder,
      borderTopRightRadius: menuTheme.drawerBorderRadius,
      borderBottomRightRadius: menuTheme.drawerBorderRadius,
    },
  ];

  const menuScroll = (
    <ScrollView
      ref={scrollRef}
      style={styles.drawerScroll}
      contentContainerStyle={[styles.drawerScrollContent, { paddingBottom: insets.bottom + 20 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={!IS_ANDROID}
      removeClippedSubviews={IS_ANDROID}
      pointerEvents={itemsPressEnabled ? 'auto' : 'box-none'}
      scrollEventThrottle={16}
      onScroll={(e) => {
        scrollYRef.current = e.nativeEvent.contentOffset.y;
      }}
      onContentSizeChange={tryApplyMenuScrollRestore}
    >
        {showAdminAttendancePanel ? (
          <View style={styles.attendanceScrollBlock}>
            <AdminAttendanceHamburgerButton menuOpen={visible} onNavigate={onAdminAttendanceNavigate} />
          </View>
        ) : null}
        {showAttendanceShortcuts ? (
          <View style={styles.attendanceScrollBlock}>
            <StaffAttendanceHamburgerShortcuts menuOpen={visible} />
          </View>
        ) : null}

        {primary ? (
          <PrimaryActionButton
            item={primary}
            theme={menuTheme}
            onPress={() => go(onSelect, primary.href, itemsPressEnabled, primary, scrollYRef.current)}
          />
        ) : null}

        {showHubs ? (
          <View style={styles.hubRow}>
            {filteredHubs.map((item) => (
              <HubCard
                key={item.id}
                item={item}
                palette={effectivePalette}
                theme={menuTheme}
                onPress={() => go(onSelect, item.href, itemsPressEnabled, item, scrollYRef.current)}
              />
            ))}
          </View>
        ) : null}

        {showSearch ? (
          <View
            style={[
              styles.searchWrap,
              IS_ANDROID && styles.searchWrapAndroid,
              {
                backgroundColor: effectivePalette.cardBg,
                borderColor: effectivePalette.cardBorder,
              },
            ]}
          >
            <Ionicons name="search-outline" size={18} color={effectivePalette.muted} style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('staffMenuSearch')}
              placeholderTextColor={effectivePalette.muted}
              style={[styles.searchInput, { color: effectivePalette.text }]}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('clear')}
              >
                <Ionicons name="close-circle" size={18} color={effectivePalette.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {filteredSections.map((section) => {
          const sectionId = section.id as StaffHamburgerMenuSectionId;
          const fallbackTheme = SECTION_THEME[sectionId] ?? SECTION_THEME.ops;
          const sectionColor = resolveMenuSectionColor(sectionId, menuTheme);
          const sectionIcon = fallbackTheme.icon;
          return (
            <View
              key={section.id}
              style={[styles.menuSection, isCompact && styles.menuSectionCompact]}
              onLayout={(e) => {
                sectionOffsetsRef.current[section.id] = e.nativeEvent.layout.y;
                tryApplyMenuScrollRestore();
              }}
            >
              {menuTheme.showSectionLabels ? (
                <View style={styles.sectionLabelRow}>
                  {menuTheme.showSectionIcons ? (
                    <>
                      <View style={[styles.sectionLabelDot, { backgroundColor: sectionColor }]} />
                      <Ionicons name={sectionIcon} size={14} color={sectionColor} style={{ marginRight: 5 }} />
                    </>
                  ) : null}
                  <Text style={[styles.sectionLabel, { color: sectionColor }]}>{section.title}</Text>
                </View>
              ) : null}
              <View
                style={[
                  useGrid ? styles.gridCard : usePill ? styles.pillCard : styles.listCard,
                  !useGrid && !usePill && IS_ANDROID && styles.listCardAndroid,
                  isCompact && !useGrid && !usePill && styles.listCardCompact,
                  {
                    borderTopColor: `${sectionColor}20`,
                    borderTopWidth: menuTheme.showSectionLabels ? 2 : 0,
                    backgroundColor: effectivePalette.cardBg,
                    borderColor: effectivePalette.cardBorder,
                  },
                ]}
                onLayout={(e) => {
                  listCardOffsetsRef.current[section.id] = e.nativeEvent.layout.y;
                  tryApplyMenuScrollRestore();
                }}
              >
                {(section.items ?? []).length === 0 ? null : useGrid ? (
                  <View style={styles.gridWrap}>
                    {(section.items ?? []).map((item) => (
                      <View
                        key={item.id}
                        style={styles.gridCell}
                        onLayout={(e) => {
                          const sectionY = sectionOffsetsRef.current[section.id] ?? 0;
                          const cardY = listCardOffsetsRef.current[section.id] ?? 0;
                          itemOffsetsRef.current[item.id] = sectionY + cardY + e.nativeEvent.layout.y;
                          tryApplyMenuScrollRestore();
                        }}
                      >
                        <MenuGridTile
                          item={item}
                          palette={effectivePalette}
                          theme={menuTheme}
                          onPress={() => go(onSelect, item.href, itemsPressEnabled, item, scrollYRef.current)}
                        />
                      </View>
                    ))}
                  </View>
                ) : usePill ? (
                  <View style={styles.pillWrap}>
                    {(section.items ?? []).map((item) => (
                      <View
                        key={item.id}
                        onLayout={(e) => {
                          const sectionY = sectionOffsetsRef.current[section.id] ?? 0;
                          const cardY = listCardOffsetsRef.current[section.id] ?? 0;
                          itemOffsetsRef.current[item.id] = sectionY + cardY + e.nativeEvent.layout.y;
                          tryApplyMenuScrollRestore();
                        }}
                      >
                        <MenuPillItem
                          item={item}
                          palette={effectivePalette}
                          theme={menuTheme}
                          onPress={() => go(onSelect, item.href, itemsPressEnabled, item, scrollYRef.current)}
                        />
                      </View>
                    ))}
                  </View>
                ) : (
                  (section.items ?? []).map((item, idx, items) => (
                    <View
                      key={item.id}
                      onLayout={(e) => {
                        const sectionY = sectionOffsetsRef.current[section.id] ?? 0;
                        const cardY = listCardOffsetsRef.current[section.id] ?? 0;
                        itemOffsetsRef.current[item.id] = sectionY + cardY + e.nativeEvent.layout.y;
                        tryApplyMenuScrollRestore();
                      }}
                    >
                      <MenuListRowMemo
                        item={item}
                        isLast={idx === items.length - 1}
                        palette={effectivePalette}
                        theme={menuTheme}
                        compact={isCompact}
                        onPress={() => go(onSelect, item.href, itemsPressEnabled, item, scrollYRef.current)}
                      />
                    </View>
                  ))
                )}
              </View>
            </View>
          );
        })}

        {searchQuery.trim() && filteredSections.length === 0 && filteredHubs.length === 0 ? (
          <Text style={[styles.emptySearch, { color: effectivePalette.muted }]}>{t('staffMenuSearchEmpty')}</Text>
        ) : null}

        {onSignOutPress ? (
          <View style={[styles.signOutFooter, { borderTopColor: effectivePalette.cardBorder }]}>
            {IS_ANDROID ? (
              <FastPress
                onPress={onSignOutPress}
                style={[styles.signOutBtn, { backgroundColor: effectivePalette.cardBg, borderColor: effectivePalette.cardBorder }]}
                rippleColor="rgba(239,68,68,0.15)"
                accessibilityRole="button"
                accessibilityLabel={t('signOutFromAccount')}
              >
                <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                <Text style={[styles.signOutBtnText, { color: effectivePalette.text }]}>{t('signOutFromAccount')}</Text>
              </FastPress>
            ) : (
              <TouchableOpacity
                onPress={onSignOutPress}
                activeOpacity={0.82}
                style={[styles.signOutBtn, { backgroundColor: effectivePalette.cardBg, borderColor: effectivePalette.cardBorder }]}
                accessibilityRole="button"
                accessibilityLabel={t('signOutFromAccount')}
              >
                <Ionicons name="log-out-outline" size={20} color="#ef4444" />
                <Text style={[styles.signOutBtnText, { color: effectivePalette.text }]}>{t('signOutFromAccount')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}
    </ScrollView>
  );

  const modalVisible = IS_ANDROID ? visible || navigatingAway : mounted || navigatingAway;
  if (!modalVisible) return null;

  const panelInner = (
    <>
      {identity ? (
        <UnifiedMenuHeader
          identity={identity}
          paddingTop={insets.top + 14}
          closeLabel={closeLabel}
          onClose={handleClosePress}
          onProfilePress={onProfilePress}
          theme={menuTheme}
          palette={effectivePalette}
        />
      ) : (
        <View style={[styles.fallbackHeader, { paddingTop: insets.top + 12, borderBottomColor: effectivePalette.cardBorder }]}>
          <Text style={[styles.fallbackTitle, { color: effectivePalette.text }]}>{t('staffMenuDrawerTitle')}</Text>
          <TouchableOpacity
            onPress={handleClosePress}
            style={[styles.fallbackDismissBtn, { backgroundColor: effectivePalette.secondaryBtn }]}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            <Ionicons name="chevron-back" size={20} color={effectivePalette.text} />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.panelBody}>
        <View
          style={[
            styles.panelDrawerCol,
            showRecentFlyout
              ? { width: drawerWidth, flexGrow: 0, flexShrink: 0 }
              : styles.panelDrawerColFull,
          ]}
        >
          {menuScroll}
        </View>
        {showRecentFlyout ? (
          <View style={[styles.panelFlyoutCol, { width: FLYOUT_W, borderLeftColor: effectivePalette.cardBorder }]}>
            <StaffHamburgerRecentFlyout
              items={recentItems}
              bottomInset={insets.bottom}
              canPress={itemsPressEnabled}
              palette={effectivePalette}
              onSelect={(href, target) => {
                onSelect(href, { ...target, scrollY: scrollYRef.current });
              }}
            />
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent={IS_ANDROID}
      hardwareAccelerated={IS_ANDROID}
      onRequestClose={navigatingAway ? undefined : handleClosePress}
    >
      <View style={styles.host} pointerEvents={navigatingAway ? 'none' : 'box-none'}>
        {navigatingAway ? (
          <View style={[styles.navCoverFull, { backgroundColor: drawerBg }]} />
        ) : (
          <View style={styles.root}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={handleClosePress}
              accessibilityRole="button"
              accessibilityLabel={closeLabel}
            >
              {IS_ANDROID ? (
                <View style={[styles.backdrop, { backgroundColor: menuTheme.backdropColor }]} />
              ) : (
                <Animated.View
                  style={[styles.backdrop, styles.backdropIos, { opacity: backdrop, backgroundColor: menuTheme.backdropColor }]}
                />
              )}
            </Pressable>

            {IS_ANDROID ? (
              <View style={panelShellStyle}>{panelInner}</View>
            ) : (
              <Animated.View
                style={[panelShellStyle, { transform: [{ translateX: drawerTranslateX }] }]}
              >
                {panelInner}
              </Animated.View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    elevation: IS_ANDROID ? 999 : 200,
    overflow: 'hidden',
  },
  root: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(49,46,129,0.45)',
  },
  backdropIos: {
    backgroundColor: 'rgba(88,28,135,0.28)',
  },
  navCoverFull: {
    ...StyleSheet.absoluteFillObject,
  },
  drawer: {
    position: 'absolute',
    flexDirection: 'column',
    backgroundColor: '#fefcff',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 36,
    elevation: 24,
  },
  menuPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'column',
    overflow: 'hidden',
    borderTopRightRadius: DRAWER_RADIUS,
    borderBottomRightRadius: DRAWER_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 36,
    elevation: 24,
    zIndex: 3,
  },
  menuPanelAndroid: {
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  unifiedHeader: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  identityPressableFull: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
    paddingRight: 44,
  },
  headerDismissBtn: {
    position: 'absolute',
    right: 14,
    zIndex: 4,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  fallbackDismissBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 0,
  },
  panelDrawerCol: {
    minHeight: 0,
    flexDirection: 'column',
  },
  panelDrawerColFull: {
    flex: 1,
    minWidth: 0,
  },
  signOutFooter: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  signOutBtnText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  panelFlyoutCol: {
    flexGrow: 0,
    flexShrink: 0,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  drawerAndroid: {
    elevation: 24,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  drawerNight: {
    shadowOpacity: 0.12,
  },
  drawerBgAndroid: {
    backgroundColor: '#f8f4ff',
  },
  identityHeader: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    overflow: 'hidden',
  },
  identityDecorA: {
    position: 'absolute',
    top: -28,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  identityDecorB: {
    position: 'absolute',
    bottom: -36,
    left: -24,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  identityTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  identityPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  avatarRing: {
    width: 56,
    height: 56,
    borderRadius: 20,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
    shadowColor: '#4c1d95',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  avatarImg: {
    width: 50,
    height: 50,
    borderRadius: 17,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  identityTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  identityName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  rolePill: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.26)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  rolePillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  identitySub: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  drawerCloseOnGrad: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(233,213,255,0.7)',
  },
  fallbackTitle: {
    flex: 1,
    color: '#1e1b4b',
    fontSize: 20,
    fontWeight: '800',
  },
  drawerClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(237,233,254,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerScroll: {
    flex: 1,
    minHeight: 0,
  },
  attendanceScrollBlock: {
    marginBottom: 8,
  },
  drawerScrollContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 8,
  },
  primaryWrap: {
    marginBottom: 14,
  },
  hubRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  hubCard: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    maxWidth: '48%',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
    minHeight: 88,
  },
  hubIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
    letterSpacing: -0.1,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minHeight: 54,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 20,
    shadowColor: '#fb7185',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnAndroid: {
    backgroundColor: '#f43f5e',
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  primaryIconBubble: {
    width: 36,
    height: 36,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionLabelDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#a78bfa',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6d28d9',
    letterSpacing: 0.15,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    paddingHorizontal: 12,
    marginBottom: 16,
    minHeight: 46,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1e1b4b',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
  },
  menuSection: {
    marginBottom: 14,
  },
  listCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(233,213,255,0.65)',
    overflow: 'hidden',
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
    minHeight: 54,
  },
  listRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(237,233,254,0.9)',
    marginHorizontal: 10,
  },
  listIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listChevron: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(237,233,254,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listChevronAndroid: {
    backgroundColor: 'rgba(237,233,254,0.55)',
  },
  listCardAndroid: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  searchWrapAndroid: {
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  listLabel: {
    flex: 1,
    color: '#1e1b4b',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  emptySearch: {
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 20,
  },
  minimalHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerDismissBtnMinimal: {
    borderColor: 'transparent',
  },
  rolePillMinimal: {
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  menuSectionCompact: {
    marginBottom: 8,
  },
  listCardCompact: {
    borderRadius: 14,
    shadowOpacity: 0,
    elevation: 0,
  },
  listRowCompact: {
    paddingVertical: 9,
    minHeight: 46,
  },
  listIconCompact: {
    width: 34,
    height: 34,
    borderRadius: 11,
  },
  gridCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 8,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  gridCell: {
    width: '50%',
    padding: 4,
  },
  gridTile: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    minHeight: 96,
    gap: 8,
  },
  gridIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
  pillCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    padding: 10,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
});
