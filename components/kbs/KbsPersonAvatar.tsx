import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

type Props = {
  uri?: string | null;
  size?: number;
  /**
   * `document` — pasaport/kimlik tarama; sol üst foto bölgesine odaklanır.
   * `portrait` — NFC chip yüzü gibi zaten kırpılmış portre.
   */
  sourceKind?: 'document' | 'portrait';
  /** Görsel yoksa gösterilecek baş harf (isim). */
  fallbackLabel?: string | null;
  style?: StyleProp<ViewStyle>;
};

/** ICAO pasaport / TC kimlik: kişi fotoğrafı genelde sol orta bölgede. */
const DOCUMENT_PHOTO_POSITION = { left: '20%', top: '36%' } as const;

/**
 * Kimlik çekimlerinde pasaport içi kişi resmini yuvarlak avatar olarak gösterir.
 */
export function KbsPersonAvatar({
  uri,
  size = 56,
  sourceKind = 'document',
  fallbackLabel,
  style,
}: Props) {
  const radius = size / 2;
  const trimmed = uri?.trim() || null;
  const initial = (fallbackLabel?.trim()?.[0] ?? '?').toUpperCase();

  if (!trimmed) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: radius },
          style,
        ]}
      >
        <Text style={[styles.fallbackText, { fontSize: Math.max(14, size * 0.36) }]}>{initial}</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.wrap,
        { width: size, height: size, borderRadius: radius },
        style,
      ]}
    >
      <Image
        source={{ uri: trimmed }}
        style={{ width: size, height: size }}
        contentFit="cover"
        contentPosition={sourceKind === 'portrait' ? 'center' : DOCUMENT_PHOTO_POSITION}
        recyclingKey={trimmed}
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    flexShrink: 0,
  },
  fallback: {
    backgroundColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  fallbackText: {
    color: '#fff',
    fontWeight: '800',
  },
});
