import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  tokens: RestaurantTokens;
  orgName: string;
  rating?: number;
  isOpen?: boolean;
  prepMinutes?: number;
  description?: string;
  cartCount: number;
  onCartPress: () => void;
  onOrdersPress: () => void;
  langToggle?: React.ReactNode;
  guestMenu?: React.ReactNode;
  onThemeToggle?: () => void;
  safeTop: number;
};

export function RestaurantDashboardHeader({
  tokens,
  orgName,
  rating = 4.8,
  isOpen = true,
  prepMinutes = 25,
  description,
  cartCount,
  onCartPress,
  onOrdersPress,
  langToggle,
  guestMenu,
  onThemeToggle,
  safeTop,
}: Props) {
  const { t } = useTranslation();
  return (
    <LinearGradient colors={[...tokens.gradientHero]} style={[styles.hero, { paddingTop: safeTop + 12 }]}>
      <View style={styles.topRow}>
        <View style={[styles.logo, { backgroundColor: tokens.accentSoft, borderColor: tokens.border }]}>
          <Ionicons name="restaurant" size={22} color={tokens.accent} />
        </View>
        <View style={styles.actions} {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}>
          {guestMenu}
          {langToggle}
          {onThemeToggle ? (
            <TouchableOpacity style={[styles.iconBtn, { borderColor: tokens.border }]} onPress={onThemeToggle}>
              <Ionicons name={tokens.scheme === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={tokens.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.iconBtn, { borderColor: tokens.border }]} onPress={onOrdersPress}>
            <Ionicons name="receipt-outline" size={18} color={tokens.text} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: tokens.border }]} onPress={onCartPress}>
            <Ionicons name="bag-handle-outline" size={18} color={tokens.text} />
            {cartCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: tokens.accent }]}>
                <Text style={styles.badgeText}>{cartCount > 9 ? '9+' : cartCount}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </View>
      </View>

      <Text style={[styles.name, { color: tokens.text }]}>{orgName}</Text>
      <View style={styles.metaRow}>
        <View style={[styles.pill, { backgroundColor: tokens.bgGlass, borderColor: tokens.border }]}>
          <Ionicons name="star" size={12} color={tokens.accent} />
          <Text style={[styles.pillText, { color: tokens.text }]}>{rating.toFixed(1)}</Text>
        </View>
        <View style={[styles.pill, { backgroundColor: isOpen ? `${tokens.success}22` : `${tokens.danger}22`, borderColor: tokens.border }]}>
          <View style={[styles.dot, { backgroundColor: isOpen ? tokens.success : tokens.danger }]} />
          <Text style={[styles.pillText, { color: tokens.text }]}>
            {isOpen
              ? t('restaurantStatusOpen', { defaultValue: 'Açık' })
              : t('restaurantStatusClosed', { defaultValue: 'Kapalı' })}
          </Text>
        </View>
        <View style={[styles.pill, { backgroundColor: tokens.bgGlass, borderColor: tokens.border }]}>
          <Ionicons name="time-outline" size={12} color={tokens.textMuted} />
          <Text style={[styles.pillText, { color: tokens.textSecondary }]}>
            {t('restaurantPrepMinutes', { minutes: prepMinutes, defaultValue: `~${prepMinutes} dk` })}
          </Text>
        </View>
      </View>
      {description ? (
        <Text style={[styles.desc, { color: tokens.textMuted }]} numberOfLines={2}>
          {description}
        </Text>
      ) : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 18, paddingBottom: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.06)' : 'transparent',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  name: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  desc: { marginTop: 10, fontSize: 14, lineHeight: 20, fontWeight: '500' },
});
