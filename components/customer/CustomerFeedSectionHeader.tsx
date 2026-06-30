import { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { pds } from '@/constants/personelDesignSystem';

const ACCENT = '#b8860b';
const LIVE_GREEN = '#22c55e';

function LiveDot() {
  const pulse = useRef(new Animated.Value(0.35)).current;
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
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: LIVE_GREEN,
        opacity: pulse,
      }}
    />
  );
}

type Props = {
  postCount: number;
  onCreatePost: () => void;
};

export const CustomerFeedSectionHeader = memo(function CustomerFeedSectionHeader({ postCount, onCreatePost }: Props) {
  const { isNight, colors } = usePremiumTheme();
  const text = isNight ? colors.text : pds.text;
  const sub = isNight ? colors.subtext : pds.subtext;

  return (
    <View style={styles.root}>
      <View style={styles.left}>
        <LinearGradient
          colors={['#b8860b', '#d97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconBadge}
        >
          <Ionicons name="sparkles" size={16} color="#fff" />
        </LinearGradient>
        <View style={styles.titles}>
          <View style={styles.titleRow}>
            <LiveDot />
            <Text style={[styles.title, { color: text }]}>{feedSharedText('guestHomeFeed')}</Text>
          </View>
          <Text style={[styles.subtitle, { color: sub }]}>
            {postCount > 0
              ? `${postCount} paylaşım`
              : feedSharedText('guestHomeEmptyFeedPostsSub')}
          </Text>
        </View>
      </View>
      <TouchableOpacity activeOpacity={0.88} onPress={onCreatePost}>
        <LinearGradient
          colors={isNight ? ['#b8860b', '#996515'] : ['#c9971c', '#b8860b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.createBtn}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.createBtnText}>{feedSharedText('guestHomeCreatePost')}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 24,
    marginBottom: 14,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: ACCENT, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
      android: { elevation: 4 },
    }),
  },
  titles: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    ...Platform.select({
      ios: { shadowColor: ACCENT, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 4 },
    }),
  },
  createBtnText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.2 },
});
