import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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
import { StaffHamburgerRecentFlyout } from '@/components/header/StaffHamburgerRecentFlyout';
import type {
  StaffHamburgerMenuItem,
  StaffHamburgerMenuLayout,
  StaffHamburgerMenuSection,
  StaffHamburgerMenuSectionId,
} from '@/lib/staffHamburgerMenu';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';

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
  recentItems?: StaffHamburgerMenuItem[];
  onSelect: (href: string, target?: { itemId?: string; scrollY?: number; item?: StaffHamburgerMenuItem }) => void;
};

const OPEN_MS = Platform.OS === 'android' ? 0 : 120;
const CLOSE_MS = Platform.OS === 'android' ? 0 : 100;

/** Sol drawer + sağda ince son-kullanılan ikon şeridi */
const SCREEN_W = Dimensions.get('window').width;
const FLYOUT_W = 50;
const DRAWER_W = SCREEN_W - FLYOUT_W;
const DRAWER_RADIUS = 26;
const H_PAD = 16;
const SEARCH_MIN_ITEMS = 9;
const IS_ANDROID = Platform.OS === 'android';
/** Android: çift dokunuş koruması — görsel açılışı geciktirmez. */
const ANDROID_ITEM_PRESS_GUARD_MS = 28;

const SECTION_THEME: Record<StaffHamburgerMenuSectionId, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  fnb: { color: '#ea580c', icon: 'grid-outline' },
  kitchen: { color: '#ea580c', icon: 'restaurant-outline' },
  nav: { color: '#6366f1', icon: 'compass-outline' },
  staff: { color: '#ea580c', icon: 'person-outline' },
  hotel: { color: '#0d9488', icon: 'bed-outline' },
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
    if (section.items.some((item) => item.id === itemId)) return section.id;
  }
  return null;
}

function filterSections(sections: StaffHamburgerMenuSection[], query: string): StaffHamburgerMenuSection[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((i) => i.label.toLocaleLowerCase().includes(q)),
    }))
    .filter((s) => s.items.length > 0);
}

function PrimaryActionButton({
  item,
  onPress,
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
}) {
  const isEmergency = item.id === 'emergency';
  const androidBg = isEmergency ? '#dc2626' : '#f43f5e';
  const gradColors = isEmergency
    ? (['#dc2626', '#ef4444', '#f87171'] as const)
    : (['#f43f5e', '#fb7185', '#fda4af'] as const);

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
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  isLast: boolean;
  palette: PersonelDesignPalette;
}) {
  const iconNode = (
    <View style={[styles.listIcon, { backgroundColor: accentTintBg(item.accent) }]}>
      <Ionicons name={item.icon} size={19} color={item.accent} />
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
        style={[styles.listRow, !isLast && [styles.listRowDivider, { borderBottomColor: palette.cardBorder }]]}
        rippleColor={`${item.accent}22`}
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
      style={[styles.listRow, !isLast && [styles.listRowDivider, { borderBottomColor: palette.cardBorder }]]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {rowBody}
    </TouchableOpacity>
  );
}

const MenuListRowMemo = memo(MenuListRow);

function UnifiedMenuHeader({
  identity,
  paddingTop,
  closeLabel,
  onClose,
  onProfilePress,
}: {
  identity: StaffMenuIdentity;
  paddingTop: number;
  closeLabel: string;
  onClose: () => void;
  onProfilePress?: () => void;
}) {
  const displayName = identity.fullName?.trim() || '—';
  const identityColors = IS_ANDROID
    ? (['#6366f1', '#8b5cf6'] as const)
    : (['#6366f1', '#8b5cf6', '#d946ef', '#fb7185'] as const);

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
        <Text style={styles.identityName} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText} numberOfLines={1}>
            {identity.roleLabel}
          </Text>
        </View>
        {[identity.department?.trim(), identity.organizationName?.trim()].filter(Boolean).length > 0 ? (
          <Text style={styles.identitySub} numberOfLines={2}>
            {[identity.department?.trim(), identity.organizationName?.trim()].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </>
  );

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
  recentItems = [],
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const palette = usePersonelDesign();
  const [searchQuery, setSearchQuery] = useState('');
  /** Açılışta hamburger konumundaki çift dokunuş menü satırına düşmesin. */
  const [itemsPressEnabled, setItemsPressEnabled] = useState(false);
  /** Kapanış animasyonu bitene kadar mount tut. */
  const [mounted, setMounted] = useState(visible);

  const primary = layout?.primary ?? null;
  const sections = layout?.sections ?? [];

  const sectionItemCount = useMemo(
    () => sections.reduce((n, s) => n + s.items.length, 0),
    [sections]
  );
  const showSearch = sectionItemCount >= SEARCH_MIN_ITEMS;
  const filteredSections = useMemo(
    () => filterSections(sections, searchQuery),
    [sections, searchQuery]
  );

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

  const panelOffscreenX = -SCREEN_W;
  const drawerTranslateX = drawer.interpolate({
    inputRange: [0, 1],
    outputRange: [panelOffscreenX, 0],
  });

  const handleClosePress = useCallback(() => {
    onClose();
  }, [onClose]);

  const drawerBg = palette.pageBg;
  const panelShellStyle = [
    styles.menuPanel,
    IS_ANDROID && styles.menuPanelAndroid,
    {
      width: SCREEN_W,
      backgroundColor: drawerBg,
      borderColor: palette.cardBorder,
    },
  ] as const;

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
        {primary ? (
          <PrimaryActionButton
            item={primary}
            onPress={() => go(onSelect, primary.href, itemsPressEnabled, primary, scrollYRef.current)}
          />
        ) : null}

        {showSearch ? (
          <View
            style={[
              styles.searchWrap,
              IS_ANDROID && styles.searchWrapAndroid,
              {
                backgroundColor: palette.cardBg,
                borderColor: palette.cardBorder,
              },
            ]}
          >
            <Ionicons name="search-outline" size={18} color={palette.muted} style={styles.searchIcon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('staffMenuSearch')}
              placeholderTextColor={palette.muted}
              style={[styles.searchInput, { color: palette.text }]}
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
                <Ionicons name="close-circle" size={18} color={palette.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {filteredSections.map((section) => {
          const theme = SECTION_THEME[section.id as StaffHamburgerMenuSectionId] ?? SECTION_THEME.ops;
          return (
            <View
              key={section.id}
              style={styles.menuSection}
              onLayout={(e) => {
                sectionOffsetsRef.current[section.id] = e.nativeEvent.layout.y;
                tryApplyMenuScrollRestore();
              }}
            >
              <View style={styles.sectionLabelRow}>
                <View style={[styles.sectionLabelDot, { backgroundColor: theme.color }]} />
                <Ionicons name={theme.icon} size={14} color={theme.color} style={{ marginRight: 5 }} />
                <Text style={[styles.sectionLabel, { color: theme.color }]}>{section.title}</Text>
              </View>
              <View
                style={[
                  styles.listCard,
                  IS_ANDROID && styles.listCardAndroid,
                  {
                    borderTopColor: `${theme.color}20`,
                    borderTopWidth: 2,
                    backgroundColor: palette.cardBg,
                    borderColor: palette.cardBorder,
                  },
                ]}
                onLayout={(e) => {
                  listCardOffsetsRef.current[section.id] = e.nativeEvent.layout.y;
                  tryApplyMenuScrollRestore();
                }}
              >
                {section.items.map((item, idx) => (
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
                      isLast={idx === section.items.length - 1}
                      palette={palette}
                      onPress={() => go(onSelect, item.href, itemsPressEnabled, item, scrollYRef.current)}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        {searchQuery.trim() && filteredSections.length === 0 ? (
          <Text style={[styles.emptySearch, { color: palette.muted }]}>{t('staffMenuSearchEmpty')}</Text>
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
        />
      ) : (
        <View style={[styles.fallbackHeader, { paddingTop: insets.top + 12, borderBottomColor: palette.cardBorder }]}>
          <Text style={[styles.fallbackTitle, { color: palette.text }]}>{t('staffMenuDrawerTitle')}</Text>
          <TouchableOpacity
            onPress={handleClosePress}
            style={[styles.fallbackDismissBtn, { backgroundColor: palette.secondaryBtn }]}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            <Ionicons name="chevron-back" size={20} color={palette.text} />
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.panelBody}>
        <View style={[styles.panelDrawerCol, { width: DRAWER_W }]}>{menuScroll}</View>
        <View style={[styles.panelFlyoutCol, { width: FLYOUT_W, borderLeftColor: palette.cardBorder }]}>
          <StaffHamburgerRecentFlyout
            items={recentItems}
            bottomInset={insets.bottom}
            canPress={itemsPressEnabled}
            palette={palette}
            onSelect={(href, target) => {
              onSelect(href, { ...target, scrollY: scrollYRef.current });
            }}
          />
        </View>
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
                <View style={styles.backdrop} />
              ) : (
                <Animated.View style={[styles.backdrop, styles.backdropIos, { opacity: backdrop }]} />
              )}
            </Pressable>

            {IS_ANDROID ? (
              <View style={panelShellStyle}>{panelInner}</View>
            ) : (
              <Animated.View
                style={[...panelShellStyle, { transform: [{ translateX: drawerTranslateX }] }]}
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
  },
  panelDrawerCol: {
    flexGrow: 0,
    flexShrink: 0,
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
  },
  drawerScrollContent: {
    paddingHorizontal: H_PAD,
    paddingTop: 14,
  },
  primaryWrap: {
    marginBottom: 14,
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
});
