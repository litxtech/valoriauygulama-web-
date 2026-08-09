import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

const AVATAR = 42;

type Props = {
  avatarUrl?: string | null;
  displayName?: string | null;
  placeholder: string;
  onPress: () => void;
  /** Opsiyonel: kamera / galeri aynı compose’a gider */
  onCameraPress?: () => void;
  onGalleryPress?: () => void;
};

/**
 * Premium compose satırı — mevcut ikonlar (avatar, galeri, kamera, paylaş).
 * Nabız yok; ince Valoria accent + soft kart.
 */
export const FeedComposePromptRow = memo(function FeedComposePromptRow({
  avatarUrl,
  displayName,
  placeholder,
  onPress,
  onCameraPress,
  onGalleryPress,
}: Props) {
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();
  const uri = (avatarUrl ?? '').trim() || null;
  const letter = ((displayName ?? '').trim().charAt(0) || '?').toUpperCase();
  const gallery = onGalleryPress ?? onPress;
  const camera = onCameraPress ?? onPress;

  return (
    <View style={styles.outer}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: palette.cardBg,
            borderBottomColor: palette.divider,
            opacity: pressed ? 0.96 : 1,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={placeholder}
      >
        <View style={[styles.avatarRing, { borderColor: palette.accent }]}>
          <View style={[styles.avatarWrap, { backgroundColor: isNight ? palette.borderLight : '#FFFFFF' }]}>
            {uri ? (
              <CachedImage
                uri={uri}
                style={styles.avatarImg}
                contentFit="cover"
                transition={0}
                recyclingKey={uri}
              />
            ) : (
              <LinearGradient colors={[palette.accent, '#14B8A6']} style={styles.avatarPh}>
                <Text style={styles.avatarLetter}>{letter}</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        <View style={styles.mid}>
          <Text style={[styles.hello, { color: palette.text }]} numberOfLines={1}>
            {displayName?.trim() ? displayName.trim().split(/\s+/)[0] : 'Merhaba'}
          </Text>
          <View
            style={[
              styles.promptPill,
              {
                backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.borderLight,
              },
            ]}
          >
            <Text style={[styles.placeholder, { color: palette.muted }]} numberOfLines={1}>
              {placeholder}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={gallery}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
            accessibilityRole="button"
            accessibilityLabel="Galeri"
          >
            <Ionicons name="images-outline" size={20} color={palette.accent} />
          </Pressable>
          <Pressable
            onPress={camera}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.iconPressed]}
            accessibilityRole="button"
            accessibilityLabel="Kamera"
          >
            <Ionicons name="camera-outline" size={20} color={palette.gold} />
          </Pressable>
          <Pressable
            onPress={onPress}
            hitSlop={6}
            style={({ pressed }) => [styles.shareBtnWrap, pressed && { opacity: 0.9 }]}
            accessibilityRole="button"
            accessibilityLabel="Paylaş"
          >
            <LinearGradient
              colors={palette.gradientCta}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.shareBtn}
            >
              <Ionicons name="send" size={14} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
});

FeedComposePromptRow.displayName = 'FeedComposePromptRow';

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    zIndex: 2,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatarRing: {
    width: AVATAR + 4,
    height: AVATAR + 4,
    borderRadius: (AVATAR + 4) / 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 1.5,
  },
  avatarWrap: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarPh: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 15, fontWeight: '800', color: '#fff' },
  mid: { flex: 1, minWidth: 0, gap: 5 },
  hello: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  promptPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 7,
  },
  placeholder: { fontSize: 13, fontWeight: '600' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPressed: { opacity: 0.7 },
  shareBtnWrap: { marginLeft: 2 },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
