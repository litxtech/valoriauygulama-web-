import { forwardRef, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ViewShot from 'react-native-view-shot';
import { DesignableQR, type QRCodeRef, type QRDesign } from '@/components/DesignableQR';

type Props = {
  url: string;
  qrSize?: number;
  design: QRDesign;
  accent: [string, string];
  surface?: string;
  subtitle?: string;
  /** false = yalnızca QR alanı (logosuz indirme), üst şerit + kart çerçevesi kalır */
  showFooter?: boolean;
  getQrRef?: (ref: QRCodeRef) => void;
};

/**
 * İndirilebilir poster kartı — QR ortasında logo yok.
 * ViewShot dış boşluk + gölge ile PNG’de kart formu net görünür.
 */
export const QrBrandPoster = forwardRef<ViewShot, Props>(function QrBrandPoster(
  { url, qrSize = 220, design, accent, surface = '#f8fafc', subtitle, showFooter = true, getQrRef },
  shotRef
) {
  const qrDesign = useMemo(
    (): QRDesign => ({
      ...design,
      useLogo: false,
      ecl: design.ecl ?? 'M',
      quietZone: Math.max(design.quietZone ?? 8, 8),
    }),
    [design]
  );

  const pad = Math.max(16, Math.round(qrSize * 0.07));
  const radius = Math.max(14, Math.round(qrSize * 0.065));
  const cardWidth = qrSize + pad * 2;
  const footerPadV = Math.max(10, Math.round(qrSize * 0.045));
  const titleSize = Math.max(11, Math.round(qrSize * 0.055));
  const subSize = Math.max(10, Math.round(qrSize * 0.042));
  const outerPad = Math.max(12, Math.round(qrSize * 0.05));

  return (
    <ViewShot
      ref={shotRef}
      options={{ format: 'png', quality: 1 }}
      style={[styles.shotRoot, { padding: outerPad }]}
      collapsable={false}
    >
      <View
        style={[
          styles.card,
          {
            width: cardWidth,
            borderRadius: radius,
            ...Platform.select({
              ios: {
                shadowColor: '#0f172a',
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.14,
                shadowRadius: 18,
              },
              android: { elevation: 12 },
              default: {},
            }),
          },
        ]}
      >
        <LinearGradient
          colors={accent}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.topBar, { height: Math.max(6, Math.round(qrSize * 0.028)), borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
        />

        <View style={[styles.qrBlock, { padding: pad, backgroundColor: surface }]}>
          <DesignableQR value={url} size={qrSize} design={qrDesign} getRef={getQrRef} />
        </View>

        {showFooter ? (
          <LinearGradient
            colors={accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[
              styles.footer,
              {
                paddingVertical: footerPadV,
                paddingHorizontal: pad,
                borderBottomLeftRadius: radius,
                borderBottomRightRadius: radius,
              },
            ]}
          >
            <Text style={[styles.brandTitle, { fontSize: titleSize }]}>VALORIA HOTEL</Text>
            {subtitle ? (
              <Text style={[styles.brandSub, { fontSize: subSize }]} numberOfLines={2}>
                {subtitle}
              </Text>
            ) : null}
          </LinearGradient>
        ) : (
          <View
            style={{
              height: Math.max(4, Math.round(qrSize * 0.02)),
              backgroundColor: surface,
              borderBottomLeftRadius: radius,
              borderBottomRightRadius: radius,
            }}
          />
        )}
      </View>
    </ViewShot>
  );
});

const styles = StyleSheet.create({
  shotRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8eef4',
  },
  card: {
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
  },
  topBar: {
    width: '100%',
  },
  qrBlock: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    width: '100%',
  },
  brandTitle: {
    color: '#fff',
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  brandSub: {
    color: 'rgba(255,255,255,0.95)',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 14,
  },
});
