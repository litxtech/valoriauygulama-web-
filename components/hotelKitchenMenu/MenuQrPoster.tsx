import { forwardRef, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
import { DesignableQR, type QRCodeRef, type QRDesign } from '@/components/DesignableQR';
import type { QrMenuPosterLayout } from '@/lib/qrMenuPosterPresets';

export type MenuQrPosterProps = {
  url: string;
  qrSize?: number;
  layout: QrMenuPosterLayout;
  design: QRDesign;
  accent: [string, string];
  surface?: string;
  ink?: string;
  subtitle?: string;
  showFooter?: boolean;
  getQrRef?: (ref: QRCodeRef) => void;
};

function qrDesignForPoster(design: QRDesign): QRDesign {
  return {
    ...design,
    useLogo: false,
    ecl: design.ecl ?? 'H',
    quietZone: Math.max(design.quietZone ?? 8, 8),
  };
}

export const MenuQrPoster = forwardRef<ViewShot, MenuQrPosterProps>(function MenuQrPoster(
  { url, qrSize = 220, layout, design, accent, surface = '#f8fafc', ink = '#0f172a', subtitle, showFooter = true, getQrRef },
  shotRef
) {
  const qrDesign = useMemo(() => qrDesignForPoster(design), [design]);
  const pad = Math.max(16, Math.round(qrSize * 0.07));
  const radius = Math.max(14, Math.round(qrSize * 0.065));
  const outerPad = Math.max(12, Math.round(qrSize * 0.05));
  const titleSize = Math.max(11, Math.round(qrSize * 0.055));
  const subSize = Math.max(10, Math.round(qrSize * 0.042));
  const labelSize = Math.max(9, Math.round(qrSize * 0.038));

  const cardShadow = Platform.select({
    ios: {
      shadowColor: '#0f172a',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.18,
      shadowRadius: 22,
    },
    android: { elevation: 14 },
    default: {},
  });

  const qrNode = <DesignableQR value={url} size={qrSize} design={qrDesign} getRef={getQrRef} />;

  const renderBody = () => {
    switch (layout) {
      case 'obsidian-gold':
        return (
          <View style={[styles.obsidianCard, { borderRadius: radius + 4, width: qrSize + pad * 2 + 24 }, cardShadow]}>
            <LinearGradient colors={['#d4af37', '#f5e6b8', '#d4af37']} style={[styles.goldFrame, { borderRadius: radius + 4 }]}>
              <View style={[styles.obsidianInner, { borderRadius: radius, padding: pad, backgroundColor: surface }]}>
                <Text style={[styles.obsidianKicker, { fontSize: labelSize }]}>DIGITAL MENU</Text>
                {qrNode}
                {showFooter ? (
                  <Text style={[styles.obsidianHotel, { fontSize: titleSize, color: ink }]} numberOfLines={2}>
                    {subtitle ?? 'VALORIA HOTEL'}
                  </Text>
                ) : null}
              </View>
            </LinearGradient>
          </View>
        );

      case 'floating-luxe':
        return (
          <View style={[styles.floatingCard, { borderRadius: radius + 6, width: qrSize + pad * 2 + 8, padding: pad }, cardShadow]}>
            <Text style={[styles.floatingBrand, { fontSize: titleSize, color: ink }]} numberOfLines={2}>
              {subtitle ?? 'VALORIA HOTEL'}
            </Text>
            <Text style={[styles.floatingScan, { fontSize: labelSize, color: accent[0] }]}>SCAN · MENÜ</Text>
            <View style={[styles.floatingQr, { backgroundColor: surface, borderRadius: radius - 2, padding: pad - 4 }]}>
              {qrNode}
            </View>
            {showFooter ? (
              <Text style={[styles.floatingFoot, { fontSize: subSize }]}>Telefonunuzla okutun</Text>
            ) : null}
          </View>
        );

      case 'arcadia':
        return (
          <LinearGradient
            colors={accent}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.arcadiaCard, { borderRadius: radius + 8, width: qrSize + pad * 2 + 20, padding: pad + 4 }, cardShadow]}
          >
            <View style={styles.arcadiaTop}>
              <Ionicons name="sparkles" size={Math.max(14, qrSize * 0.07)} color="rgba(255,255,255,0.9)" />
              <Text style={[styles.arcadiaTitle, { fontSize: titleSize }]} numberOfLines={2}>
                {subtitle ?? 'VALORIA HOTEL'}
              </Text>
            </View>
            <View style={[styles.arcadiaQrInset, { borderRadius: radius, padding: pad - 2, backgroundColor: surface }]}>
              {qrNode}
            </View>
            {showFooter ? <Text style={[styles.arcadiaFoot, { fontSize: subSize }]}>Web menü · Anında sipariş</Text> : null}
          </LinearGradient>
        );

      case 'table-stand':
        return (
          <View style={[styles.tentCard, { width: qrSize + pad * 2 + 16 }, cardShadow]}>
            <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tentPeak}>
              <Text style={[styles.tentPeakText, { fontSize: titleSize + 2 }]}>MENÜ</Text>
            </LinearGradient>
            <View style={[styles.tentBody, { backgroundColor: surface, padding: pad, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }]}>
              <Text style={[styles.tentHotel, { fontSize: subSize, color: ink }]} numberOfLines={2}>
                {subtitle ?? 'VALORIA HOTEL'}
              </Text>
              <View style={styles.tentQrWrap}>{qrNode}</View>
              {showFooter ? (
                <Text style={[styles.tentScan, { fontSize: labelSize, color: accent[0] }]}>Okut · Sipariş ver</Text>
              ) : null}
            </View>
          </View>
        );

      case 'boutique':
        return (
          <View style={[styles.boutiqueCard, { borderRadius: radius, width: qrSize + pad * 2 + 28, padding: pad + 6, backgroundColor: surface }, cardShadow]}>
            <View style={[styles.boutiqueCorner, styles.boutiqueCornerTL, { borderColor: accent[0] }]} />
            <View style={[styles.boutiqueCorner, styles.boutiqueCornerTR, { borderColor: accent[0] }]} />
            <View style={[styles.boutiqueCorner, styles.boutiqueCornerBL, { borderColor: accent[0] }]} />
            <View style={[styles.boutiqueCorner, styles.boutiqueCornerBR, { borderColor: accent[0] }]} />
            <Text style={[styles.boutiqueKicker, { fontSize: labelSize, color: accent[0] }]}>— RESTORAN —</Text>
            <Text style={[styles.boutiqueTitle, { fontSize: titleSize, color: ink }]} numberOfLines={2}>
              {subtitle ?? 'VALORIA HOTEL'}
            </Text>
            <View style={styles.boutiqueQr}>{qrNode}</View>
            {showFooter ? <Text style={[styles.boutiqueFoot, { fontSize: subSize, color: accent[0] }]}>Dijital menü</Text> : null}
          </View>
        );

      case 'nordic':
        return (
          <View style={[styles.nordicCard, { borderRadius: radius - 4, width: qrSize + pad * 2 + 32, padding: pad + 8 }]}>
            <Text style={[styles.nordicLabel, { fontSize: labelSize }]}>MENU</Text>
            <Text style={[styles.nordicTitle, { fontSize: titleSize, color: ink }]} numberOfLines={2}>
              {subtitle ?? 'Valoria Hotel'}
            </Text>
            <View style={styles.nordicRule} />
            {qrNode}
            {showFooter ? <Text style={[styles.nordicFoot, { fontSize: subSize }]}>Scan with camera</Text> : null}
          </View>
        );

      case 'midnight-glow':
        return (
          <View style={[styles.midnightOuter, { borderRadius: radius + 10, width: qrSize + pad * 2 + 28 }, cardShadow]}>
            <LinearGradient colors={accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.midnightRing, { borderRadius: radius + 10, padding: 3 }]}>
              <View style={[styles.midnightInner, { borderRadius: radius + 7, padding: pad, backgroundColor: surface }]}>
                <View style={styles.midnightHeader}>
                  <View style={[styles.midnightDot, { backgroundColor: accent[1] }]} />
                  <Text style={[styles.midnightKicker, { fontSize: labelSize, color: ink }]}>LIVE MENU</Text>
                </View>
                {qrNode}
                {showFooter ? (
                  <Text style={[styles.midnightHotel, { fontSize: subSize, color: ink }]} numberOfLines={2}>
                    {subtitle ?? 'VALORIA HOTEL'}
                  </Text>
                ) : null}
              </View>
            </LinearGradient>
          </View>
        );

      case 'signature':
      default:
        return (
          <View style={[styles.signatureCard, { width: qrSize + pad * 2, borderRadius: radius }, cardShadow]}>
            <LinearGradient
              colors={accent}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.signatureTop, { height: Math.max(6, Math.round(qrSize * 0.028)), borderTopLeftRadius: radius, borderTopRightRadius: radius }]}
            />
            <View style={[styles.signatureQr, { padding: pad, backgroundColor: surface }]}>{qrNode}</View>
            {showFooter ? (
              <LinearGradient
                colors={accent}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.signatureFoot, { paddingVertical: Math.max(10, Math.round(qrSize * 0.045)), paddingHorizontal: pad, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }]}
              >
                <Text style={[styles.signatureBrand, { fontSize: titleSize }]}>VALORIA HOTEL</Text>
                {subtitle ? (
                  <Text style={[styles.signatureSub, { fontSize: subSize }]} numberOfLines={2}>
                    {subtitle}
                  </Text>
                ) : null}
              </LinearGradient>
            ) : (
              <View style={{ height: 4, backgroundColor: surface, borderBottomLeftRadius: radius, borderBottomRightRadius: radius }} />
            )}
          </View>
        );
    }
  };

  return (
    <ViewShot ref={shotRef} options={{ format: 'png', quality: 1 }} style={[styles.shotRoot, { padding: outerPad }]} collapsable={false}>
      {renderBody()}
    </ViewShot>
  );
});

const styles = StyleSheet.create({
  shotRoot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8eef4',
  },
  signatureCard: { overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: 'rgba(15,23,42,0.1)' },
  signatureTop: { width: '100%' },
  signatureQr: { alignItems: 'center', justifyContent: 'center' },
  signatureFoot: { alignItems: 'center', gap: 4 },
  signatureBrand: { color: '#fff', fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  signatureSub: { color: 'rgba(255,255,255,0.95)', fontWeight: '600', textAlign: 'center' },
  obsidianCard: { overflow: 'hidden' },
  goldFrame: { padding: 3 },
  obsidianInner: { alignItems: 'center', gap: 10 },
  obsidianKicker: { color: '#d4af37', fontWeight: '800', letterSpacing: 3, marginBottom: 2 },
  obsidianHotel: { fontWeight: '700', textAlign: 'center', marginTop: 4 },
  floatingCard: { backgroundColor: '#fff', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(15,23,42,0.06)' },
  floatingBrand: { fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  floatingScan: { fontWeight: '800', letterSpacing: 2.2, fontSize: 10 },
  floatingQr: { alignItems: 'center', justifyContent: 'center' },
  floatingFoot: { color: '#64748b', fontWeight: '600' },
  arcadiaCard: { alignItems: 'center', gap: 12 },
  arcadiaTop: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  arcadiaTitle: { color: '#fff', fontWeight: '800', textAlign: 'center', letterSpacing: 0.3 },
  arcadiaQrInset: { alignItems: 'center', justifyContent: 'center' },
  arcadiaFoot: { color: 'rgba(255,255,255,0.92)', fontWeight: '700', textAlign: 'center' },
  tentCard: { overflow: 'hidden', borderRadius: 16 },
  tentPeak: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  tentPeakText: { color: '#fff', fontWeight: '900', letterSpacing: 4 },
  tentBody: { alignItems: 'center', gap: 10, borderWidth: 1, borderTopWidth: 0, borderColor: 'rgba(15,23,42,0.08)' },
  tentHotel: { fontWeight: '700', textAlign: 'center' },
  tentQrWrap: { alignItems: 'center' },
  tentScan: { fontWeight: '800', letterSpacing: 0.8, marginTop: 2 },
  boutiqueCard: { alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(120,53,15,0.12)', position: 'relative' },
  boutiqueCorner: { position: 'absolute', width: 18, height: 18, borderWidth: 2 },
  boutiqueCornerTL: { top: 10, left: 10, borderRightWidth: 0, borderBottomWidth: 0 },
  boutiqueCornerTR: { top: 10, right: 10, borderLeftWidth: 0, borderBottomWidth: 0 },
  boutiqueCornerBL: { bottom: 10, left: 10, borderRightWidth: 0, borderTopWidth: 0 },
  boutiqueCornerBR: { bottom: 10, right: 10, borderLeftWidth: 0, borderTopWidth: 0 },
  boutiqueKicker: { fontWeight: '800', letterSpacing: 3, marginTop: 8 },
  boutiqueTitle: { fontWeight: '800', textAlign: 'center' },
  boutiqueQr: { marginVertical: 4 },
  boutiqueFoot: { fontWeight: '700', letterSpacing: 1 },
  nordicCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', gap: 10 },
  nordicLabel: { color: '#94a3b8', fontWeight: '800', letterSpacing: 4 },
  nordicTitle: { fontWeight: '700', textAlign: 'center' },
  nordicRule: { width: 32, height: 1, backgroundColor: '#cbd5e1' },
  nordicFoot: { color: '#64748b', fontWeight: '600' },
  midnightOuter: { overflow: 'hidden' },
  midnightRing: { width: '100%' },
  midnightInner: { alignItems: 'center', gap: 10 },
  midnightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  midnightDot: { width: 8, height: 8, borderRadius: 4 },
  midnightKicker: { fontWeight: '800', letterSpacing: 2 },
  midnightHotel: { fontWeight: '700', textAlign: 'center' },
});
