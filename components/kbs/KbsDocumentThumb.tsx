import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  uri?: string | null;
  width?: number;
  /** Pasaport/kimlik — dikey (portrait) çerçeve. */
  aspectRatio?: number;
  fallbackLabel?: string | null;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  /** TC kimlik kartı — parmak izi ikonu */
  tcOnly?: boolean;
  tcLabel?: string | null;
};

/**
 * Liste kartlarında pasaport/kimlik görseli — yatay değil dikey çerçeve.
 */
export function KbsDocumentThumb({
  uri,
  width = 72,
  aspectRatio = 1.42,
  fallbackLabel,
  onPress,
  accessibilityLabel,
  style,
  tcOnly = false,
  tcLabel,
}: Props) {
  const height = Math.round(width * aspectRatio);
  const trimmed = uri?.trim() || null;
  const initial = (fallbackLabel?.trim()?.[0] ?? '?').toUpperCase();

  const frame = (
    <View style={[styles.frame, { width, height }, style]}>
      {tcOnly ? (
        <View style={styles.tcInner}>
          <Ionicons name="finger-print" size={24} color="#60a5fa" />
          {tcLabel ? (
            <Text style={styles.tcText} numberOfLines={2}>
              {tcLabel}
            </Text>
          ) : null}
        </View>
      ) : trimmed ? (
        <Image
          source={{ uri: trimmed }}
          style={styles.image}
          contentFit="contain"
          recyclingKey={trimmed}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.fallback}>
          <Text style={[styles.fallbackText, { fontSize: Math.max(16, width * 0.28) }]}>{initial}</Text>
        </View>
      )}
      {trimmed && !tcOnly ? (
        <View style={styles.zoomHint} pointerEvents="none">
          <Ionicons name="expand-outline" size={11} color="rgba(255,255,255,0.85)" />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? 'Belge görselini büyüt'}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        {frame}
      </Pressable>
    );
  }

  return frame;
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexShrink: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  fallbackText: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '800',
  },
  tcInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 6,
    backgroundColor: '#172554',
  },
  tcText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#93c5fd',
    textAlign: 'center',
  },
  zoomHint: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.88 },
});
