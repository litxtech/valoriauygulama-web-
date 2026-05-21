import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { FastPress } from '@/components/ui/FastPress';
import { pds } from '@/constants/personelDesignSystem';
import { theme } from '@/constants/theme';

const IS_ANDROID = Platform.OS === 'android';
const STAGGER_MS = 55;

type ShareAction = {
  key: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  colors: [string, string, ...string[]];
  onPress: () => void;
  wide?: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  canCreateFeed: boolean;
  canKbsMrz: boolean;
  onPost: () => void;
  onStory: () => void;
  onMrz: () => void;
};

function ShareHeroTile({
  action,
  anim,
  delay,
}: {
  action: ShareAction;
  anim: Animated.Value;
  delay: number;
}) {
  const enter = anim.interpolate({
    inputRange: [0, delay, Math.min(delay + 0.22, 1)],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const tileY = enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const tileScale = enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });

  const body = (
    <>
      <View style={styles.heroIconRing}>
        <Ionicons name={action.icon} size={26} color="#fff" />
      </View>
      <Text style={styles.heroTitle} numberOfLines={1}>
        {action.title}
      </Text>
      <Text style={styles.heroSub} numberOfLines={2}>
        {action.subtitle}
      </Text>
      <View style={styles.heroArrow}>
        <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.9)" />
      </View>
    </>
  );

  const tile = IS_ANDROID ? (
    <View style={[styles.heroTileInner, { backgroundColor: action.colors[0] }]}>{body}</View>
  ) : (
    <LinearGradient colors={action.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroTileInner}>
      {body}
      <View style={styles.heroShine} pointerEvents="none" />
    </LinearGradient>
  );

  return (
    <Animated.View
      style={[
        action.wide ? styles.heroTileWide : styles.heroTile,
        { opacity: enter, transform: [{ translateY: tileY }, { scale: tileScale }] },
      ]}
    >
      <FastPress
        onPress={action.onPress}
        style={styles.heroPress}
        rippleColor="rgba(255,255,255,0.35)"
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={action.title}
      >
        {tile}
      </FastPress>
    </Animated.View>
  );
}

function ShareListRow({
  action,
  anim,
  delay,
}: {
  action: ShareAction;
  anim: Animated.Value;
  delay: number;
}) {
  const enter = anim.interpolate({
    inputRange: [0, delay, Math.min(delay + 0.2, 1)],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const rowX = enter.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });

  const iconWrap = IS_ANDROID ? (
    <View style={[styles.listIcon, { backgroundColor: action.colors[0] }]}>
      <Ionicons name={action.icon} size={22} color="#fff" />
    </View>
  ) : (
    <LinearGradient colors={action.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.listIcon}>
      <Ionicons name={action.icon} size={22} color="#fff" />
    </LinearGradient>
  );

  return (
    <Animated.View style={{ opacity: enter, transform: [{ translateX: rowX }] }}>
      <FastPress
        onPress={action.onPress}
        style={styles.listRow}
        rippleColor={`${action.colors[0]}33`}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel={action.title}
      >
        {iconWrap}
        <View style={styles.listText}>
          <Text style={styles.listTitle}>{action.title}</Text>
          <Text style={styles.listSub}>{action.subtitle}</Text>
        </View>
        <View style={styles.listChevron}>
          <Ionicons name="chevron-forward" size={16} color={action.colors[0]} />
        </View>
      </FastPress>
    </Animated.View>
  );
}

export function StaffFeedShareSheet({ visible, onClose, canCreateFeed, canKbsMrz, onPost, onStory, onMrz }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  const closeAnimated = useCallback(() => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [onClose, progress]);

  useEffect(() => {
    if (!visible) {
      progress.setValue(0);
      return;
    }
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      damping: 21,
      stiffness: 280,
      mass: 0.9,
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  const sheetY = progress.interpolate({ inputRange: [0, 1], outputRange: [-320, 0] });
  const sheetScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const backdropOpacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const title =
    canCreateFeed && canKbsMrz
      ? t('staffFabShareAndKbs')
      : canKbsMrz && !canCreateFeed
        ? t('kbsNavOperation')
        : t('share');

  const subtitle =
    canCreateFeed && canKbsMrz
      ? t('staffFabCreateAll')
      : canCreateFeed
        ? t('staffFabCreatePostOrStory')
        : t('staffFabCreateMrzOnly');

  const heroActions: ShareAction[] = [];
  if (canCreateFeed) {
    heroActions.push({
      key: 'post',
      title: t('post'),
      subtitle: t('staffFabPostSub'),
      icon: 'images',
      colors: [...pds.gradientCta, '#e879f9'],
      onPress: onPost,
    });
    heroActions.push({
      key: 'story',
      title: t('story'),
      subtitle: t('staffFabStorySub'),
      icon: 'sparkles',
      colors: [...pds.gradientPremium, '#c084fc'],
      onPress: onStory,
    });
  }

  const listActions: ShareAction[] = [];
  if (canKbsMrz) {
    listActions.push({
      key: 'mrz',
      title: t('staffPassportsTitle'),
      subtitle: t('staffFabMrzSub'),
      icon: 'scan',
      colors: ['#0f766e', '#0891b2', '#0369a1'],
      onPress: onMrz,
      wide: true,
    });
  }

  const heroStagger = (index: number) => 0.42 + index * (STAGGER_MS / 1000);
  const listStagger = (index: number) => 0.42 + (heroActions.length + index) * (STAGGER_MS / 1000);

  const paddingTop = Math.max(insets.top, 12) + 6;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={closeAnimated} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdropDim, { opacity: backdropOpacity }]} />
        {!IS_ANDROID ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacity }]} pointerEvents="none">
            <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
          </Animated.View>
        ) : null}
        <Pressable style={StyleSheet.absoluteFill} onPress={closeAnimated} accessibilityRole="button" />

        <Animated.View
          style={[
            styles.sheetWrap,
            {
              paddingTop,
              transform: [{ translateY: sheetY }, { scale: sheetScale }],
            },
          ]}
        >
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={['#ff8a00', '#ff3cac', '#8b5cf6']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheetAccent}
            />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle}>{title}</Text>
                <Text style={styles.sheetSubtitle}>{subtitle}</Text>
              </View>
              <FastPress
                onPress={closeAnimated}
                style={styles.closeBtn}
                rippleColor="rgba(99,102,241,0.2)"
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
              >
                <Ionicons name="close" size={20} color={pds.subtext} />
              </FastPress>
            </View>

            {heroActions.length > 0 ? (
              <View style={styles.heroRow}>
                {heroActions.map((action, i) => (
                  <ShareHeroTile key={action.key} action={action} anim={progress} delay={heroStagger(i)} />
                ))}
              </View>
            ) : null}

            {listActions.length > 0 ? (
              <View style={[styles.listBlock, heroActions.length === 0 && styles.listBlockOnly]}>
                {heroActions.length > 0 ? <Text style={styles.listSectionLabel}>{t('kbsNavOperation')}</Text> : null}
                {listActions.map((action, i) => (
                  <ShareListRow key={action.key} action={action} anim={progress} delay={listStagger(i)} />
                ))}
              </View>
            ) : null}

            <View style={styles.sheetHandle} />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  backdropDim: {
    backgroundColor: 'rgba(2,6,23,0.62)',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    marginHorizontal: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    shadowColor: '#ff3cac',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 14,
  },
  sheetAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingTop: 18,
    paddingBottom: 14,
  },
  sheetTitleBlock: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: pds.text,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: pds.subtext,
    lineHeight: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  heroRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  heroTile: {
    flex: 1,
    minHeight: 128,
  },
  heroTileWide: {
    width: '100%',
    minHeight: 128,
  },
  heroPress: {
    flex: 1,
    borderRadius: 18,
    overflow: 'hidden',
  },
  heroTileInner: {
    flex: 1,
    minHeight: 128,
    borderRadius: 18,
    padding: 14,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  heroShine: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  heroIconRing: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginTop: 52,
  },
  heroSub: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 15,
  },
  heroArrow: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listBlock: {
    gap: 8,
    marginBottom: 4,
  },
  listBlockOnly: {
    marginTop: 0,
  },
  listSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: pds.subtext,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
    marginLeft: 2,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  listIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listText: {
    flex: 1,
  },
  listTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: pds.text,
  },
  listSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: pds.subtext,
  },
  listChevron: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
    marginTop: 10,
  },
});
