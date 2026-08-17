import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { PttWaveform } from '@/components/staff/PttWaveform';

type Props = {
  name: string | null;
  imageUrl: string | null;
  speaking?: boolean;
  online?: boolean;
  isMe?: boolean;
  pageBg: string;
  textColor: string;
  mutedColor: string;
  cardBg: string;
  borderColor: string;
  speakingColor?: string;
  onPress?: () => void;
};

function initials(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

function firstName(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return '';
  return s.split(/\s+/)[0] || s;
}

/** Modern bas-konuş avatar tile — 3 kolon, konuşanda ses çubuğu. */
export const PttPersonAvatar = memo(function PttPersonAvatar({
  name,
  imageUrl,
  speaking = false,
  online = false,
  isMe = false,
  pageBg,
  textColor,
  mutedColor,
  cardBg,
  borderColor,
  speakingColor = '#22c55e',
  onPress,
}: Props) {
  const { t } = useTranslation();
  const pulse = useRef(new Animated.Value(1)).current;
  const outerRing = speaking ? speakingColor : online ? '#14b8a6' : borderColor;
  const opacity = online || speaking ? 1 : 0.5;
  const displayName = isMe ? t('pttYou') : firstName(name) || t('pttPeopleSection');

  useEffect(() => {
    if (!speaking) {
      pulse.stopAnimation();
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.07,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, pulse]);

  return (
    <Pressable
      style={[styles.cell, { opacity }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View
        style={[
          styles.tile,
          {
            backgroundColor: speaking ? 'rgba(34,197,94,0.1)' : cardBg,
            borderColor: speaking ? 'rgba(34,197,94,0.42)' : borderColor,
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pulse }] }}>
          <View style={[styles.outerRing, { borderColor: outerRing }]}>
            {imageUrl ? (
              <CachedImage uri={imageUrl} style={styles.img} contentFit="cover" />
            ) : (
              <View style={styles.fallback}>
                <Text style={[styles.fallbackText, { color: textColor }]}>{initials(name)}</Text>
              </View>
            )}
          </View>
        </Animated.View>

        {speaking ? (
          <View style={[styles.speakBadge, { borderColor: pageBg }]}>
            <PttWaveform active bars={3} height={11} barWidth={2} />
          </View>
        ) : online ? (
          <View style={[styles.dot, { borderColor: pageBg }]} />
        ) : null}

        {isMe ? (
          <View style={styles.meChip}>
            <Text style={styles.meChipText}>{t('pttYou')}</Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.name, { color: speaking ? speakingColor : textColor }]} numberOfLines={1}>
        {displayName}
      </Text>
      <Text style={[styles.meta, { color: speaking ? speakingColor : mutedColor }]} numberOfLines={1}>
        {speaking ? t('pttSpeakingShort') : online ? t('pttOnWalkieShort') : t('pttOfflineShort')}
      </Text>
    </Pressable>
  );
});

const AVATAR = 86;

const styles = StyleSheet.create({
  cell: {
    width: '50%',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 6,
  },
  tile: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 10,
    borderRadius: 22,
    borderWidth: 1,
  },
  outerRing: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: { width: '100%', height: '100%' },
  fallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13,148,136,0.14)',
  },
  fallbackText: { fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  speakBadge: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  dot: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#14b8a6',
    borderWidth: 2,
  },
  meChip: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(14,165,233,0.16)',
  },
  meChipText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  name: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    minHeight: 16,
  },
});
