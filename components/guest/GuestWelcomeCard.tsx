import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  Animated,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import type { GuestWelcomeCardLangContent } from '@/lib/guestWelcomeCardContent';

type Props = {
  visible: boolean;
  content: GuestWelcomeCardLangContent;
  onClose: () => void;
  onNotNow: () => void;
  onEditProfile: () => void;
};

const FEATURES = [
  { icon: 'chatbubble-ellipses-outline' as const, field: 'featureRequests' as const },
  { icon: 'flag-outline' as const, field: 'featureComplaints' as const },
  { icon: 'heart-outline' as const, field: 'featureThanks' as const },
] as const;

export function GuestWelcomeCard({ visible, content, onClose, onNotNow, onEditProfile }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 40, 380);

  const backdrop = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.92)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(cardScale, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      backdrop.setValue(0);
      cardScale.setValue(0.92);
      cardOpacity.setValue(0);
    }
  }, [visible, backdrop, cardScale, cardOpacity]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
          ) : null}
        </Animated.View>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />

        <Animated.View
          style={[
            styles.cardWrap,
            {
              width: cardWidth,
              paddingBottom: insets.bottom + 16,
              opacity: cardOpacity,
              transform: [{ scale: cardScale }],
            },
          ]}
        >
          <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
            <LinearGradient
              colors={['#1a365d', '#2c5282', '#b8860b']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.85}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={t('close')}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.logoMark}>
                <Text style={styles.logoText}>V</Text>
              </View>
              <Text style={styles.heroTitle}>{content.title}</Text>
              <Text style={styles.heroSubtitle}>{content.subtitle}</Text>
            </LinearGradient>

            <View style={styles.body}>
              <Text style={styles.profileHint}>{content.profileHint}</Text>

              <View style={styles.purposeBox}>
                <Text style={styles.purposeTitle}>{content.purposeTitle}</Text>
                <Text style={styles.purposeBody}>{content.purposeBody}</Text>
              </View>

              <View style={styles.featureList}>
                {FEATURES.map((f) => (
                  <View key={f.field} style={styles.featureRow}>
                    <View style={styles.featureIconWrap}>
                      <Ionicons name={f.icon} size={18} color={theme.colors.primaryDark} />
                    </View>
                    <Text style={styles.featureText}>{content[f.field]}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.slaRow}>
                <Ionicons name="time-outline" size={18} color={theme.colors.success} />
                <Text style={styles.slaText}>{content.sla}</Text>
              </View>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.notNowBtn} onPress={onNotNow} activeOpacity={0.85}>
                  <Text style={styles.notNowText}>{t('guestWelcomeNotNow')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.editBtn} onPress={onEditProfile} activeOpacity={0.88}>
                  <LinearGradient
                    colors={[theme.colors.primary, theme.colors.primaryDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.editBtnGradient}
                  >
                    <Ionicons name="create-outline" size={18} color="#fff" />
                    <Text style={styles.editBtnText}>{t('guestWelcomeEditProfile')}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
  },
  cardWrap: {
    maxWidth: '100%',
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.22,
        shadowRadius: 28,
      },
      android: { elevation: 12 },
    }),
  },
  hero: {
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    maxWidth: 300,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    gap: 14,
  },
  profileHint: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  purposeBox: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  purposeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 4,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  purposeBody: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#fdf6e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    lineHeight: 19,
  },
  slaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ecfdf3',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  slaText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#166534',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  notNowBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  editBtn: {
    flex: 1.2,
    borderRadius: 14,
    overflow: 'hidden',
  },
  editBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
