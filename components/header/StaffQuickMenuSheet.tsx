import { useEffect, useMemo, useRef, useState } from 'react';
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
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { FastPress } from '@/components/ui/FastPress';
import { pds } from '@/constants/personelDesignSystem';
import { hapticImpactLight, hapticSelection } from '@/lib/hapticsSafe';
import type {
  StaffHamburgerMenuItem,
  StaffHamburgerMenuLayout,
  StaffHamburgerMenuSection,
} from '@/lib/staffHamburgerMenu';

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
  onClose: () => void;
  closeLabel: string;
  identity?: StaffMenuIdentity | null;
  onProfilePress?: () => void;
  layout?: StaffHamburgerMenuLayout | null;
  onSelect: (href: string) => void;
};

/** Sol kenara yapışık tam yükseklik panel; sağda yuvarlatılmış köşe */
const DRAWER_W = Math.min(392, Math.round(Dimensions.get('window').width * 0.92));
const DRAWER_RADIUS = 26;
const H_PAD = 16;
const SEARCH_MIN_ITEMS = 9;
const IS_ANDROID = Platform.OS === 'android';

/** Android: her satırda LinearGradient yerine düz renk (admin panel ile aynı yaklaşım). */
function accentTintBg(accent: string, alpha = '28') {
  return `${accent}${alpha}`;
}

function go(onSelect: (href: string) => void, href: string) {
  onSelect(href);
  hapticSelection();
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
  if (IS_ANDROID) {
    return (
      <FastPress
        onPress={onPress}
        style={styles.primaryWrap}
        rippleColor="rgba(255,255,255,0.25)"
        accessibilityRole="button"
      >
        <View style={[styles.primaryBtn, styles.primaryBtnAndroid]}>
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
        colors={['#f43f5e', '#fb7185', '#fda4af']}
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
}: {
  item: StaffHamburgerMenuItem;
  onPress: () => void;
  isLast: boolean;
}) {
  const iconNode = IS_ANDROID ? (
    <View style={[styles.listIcon, { backgroundColor: accentTintBg(item.accent) }]}>
      <Ionicons name={item.icon} size={19} color={item.accent} />
    </View>
  ) : (
    <LinearGradient
      colors={[`${item.accent}28`, `${item.accent}0c`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.listIcon}
    >
      <Ionicons name={item.icon} size={19} color={item.accent} />
    </LinearGradient>
  );

  const rowBody = (
    <>
      {iconNode}
      <Text style={styles.listLabel} numberOfLines={2}>
        {item.label}
      </Text>
      <View style={[styles.listChevron, IS_ANDROID && styles.listChevronAndroid]}>
        <Ionicons name="chevron-forward" size={16} color="#a78bfa" />
      </View>
    </>
  );

  if (IS_ANDROID) {
    return (
      <FastPress
        onPress={onPress}
        style={[styles.listRow, !isLast && styles.listRowDivider]}
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
      style={[styles.listRow, !isLast && styles.listRowDivider]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      {rowBody}
    </TouchableOpacity>
  );
}

function DrawerIdentityHeader({
  identity,
  closeLabel,
  paddingTop,
  onClose,
  onProfilePress,
}: {
  identity: StaffMenuIdentity;
  closeLabel: string;
  paddingTop: number;
  onClose: () => void;
  onProfilePress?: () => void;
}) {
  const displayName = identity.fullName?.trim() || '—';
  const body = (
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

  const identityColors = IS_ANDROID
    ? (['#6366f1', '#8b5cf6'] as const)
    : (['#6366f1', '#8b5cf6', '#d946ef', '#fb7185'] as const);

  return (
    <LinearGradient
      colors={identityColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.identityHeader, { paddingTop }]}
    >
      <View style={styles.identityDecorA} pointerEvents="none" />
      <View style={styles.identityDecorB} pointerEvents="none" />
      <View style={styles.identityTopRow}>
        {onProfilePress ? (
          <TouchableOpacity
            onPress={onProfilePress}
            activeOpacity={0.88}
            style={styles.identityPressable}
            accessibilityRole="button"
            accessibilityLabel={displayName}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View style={styles.identityPressable}>{body}</View>
        )}
        <TouchableOpacity
          onPress={onClose}
          style={styles.drawerCloseOnGrad}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

export function StaffQuickMenuSheet({
  visible,
  onClose,
  closeLabel,
  identity,
  onProfilePress,
  layout,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

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

  useEffect(() => {
    if (!visible) setSearchQuery('');
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (!IS_ANDROID) hapticImpactLight();
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(drawer, {
          toValue: 1,
          useNativeDriver: true,
          speed: 18,
          bounciness: 2,
        }),
      ]).start();
      return;
    }
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(drawer, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, backdrop, drawer]);

  const drawerOffscreenX = -DRAWER_W;
  const drawerTranslateX = drawer.interpolate({
    inputRange: [0, 1],
    outputRange: [drawerOffscreenX, 0],
  });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
        >
          {Platform.OS === 'ios' ? (
            <BlurView intensity={36} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
          <Animated.View
            style={[styles.backdrop, Platform.OS === 'ios' ? styles.backdropIos : null, { opacity: backdrop }]}
          />
        </Pressable>

        <Animated.View
          style={[
            styles.drawer,
            IS_ANDROID && styles.drawerAndroid,
            {
              width: DRAWER_W,
              left: 0,
              top: 0,
              bottom: 0,
              borderTopRightRadius: DRAWER_RADIUS,
              borderBottomRightRadius: DRAWER_RADIUS,
              transform: [{ translateX: drawerTranslateX }],
            },
          ]}
        >
          {IS_ANDROID ? (
            <View style={[StyleSheet.absoluteFill, styles.drawerBgAndroid]} pointerEvents="none" />
          ) : (
            <LinearGradient
              colors={['#fefcff', '#f8f4ff', '#fdf2f8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.3, y: 1 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
          )}
          {identity ? (
            <DrawerIdentityHeader
              identity={identity}
              closeLabel={closeLabel}
              paddingTop={insets.top + 14}
              onClose={onClose}
              onProfilePress={onProfilePress}
            />
          ) : (
            <View style={[styles.fallbackHeader, { paddingTop: insets.top + 12 }]}>
              <Text style={styles.fallbackTitle}>{t('staffMenuDrawerTitle')}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={styles.drawerClose}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={closeLabel}
              >
                <Ionicons name="close" size={22} color={pds.text} />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            style={styles.drawerScroll}
            contentContainerStyle={[styles.drawerScrollContent, { paddingBottom: insets.bottom + 20 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces
            removeClippedSubviews={IS_ANDROID}
          >
            {primary ? (
              <PrimaryActionButton item={primary} onPress={() => go(onSelect, primary.href)} />
            ) : null}

            {showSearch ? (
              <View style={[styles.searchWrap, IS_ANDROID && styles.searchWrapAndroid]}>
                <Ionicons name="search-outline" size={18} color="#94a3b8" style={styles.searchIcon} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t('staffMenuSearch')}
                  placeholderTextColor="#94a3b8"
                  style={styles.searchInput}
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
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {filteredSections.map((section) => (
              <View key={section.id} style={styles.menuSection}>
                <View style={styles.sectionLabelRow}>
                  <View style={styles.sectionLabelDot} />
                  <Text style={styles.sectionLabel}>{section.title}</Text>
                </View>
                <View style={[styles.listCard, IS_ANDROID && styles.listCardAndroid]}>
                  {section.items.map((item, idx) => (
                    <MenuListRow
                      key={item.id}
                      item={item}
                      isLast={idx === section.items.length - 1}
                      onPress={() => go(onSelect, item.href)}
                    />
                  ))}
                </View>
              </View>
            ))}

            {searchQuery.trim() && filteredSections.length === 0 ? (
              <Text style={styles.emptySearch}>{t('staffMenuSearchEmpty')}</Text>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  drawerAndroid: {
    elevation: 10,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  drawerBgAndroid: {
    backgroundColor: '#f8f4ff',
  },
  identityHeader: {
    paddingHorizontal: H_PAD + 2,
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
    color: pds.text,
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
    color: pds.text,
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
