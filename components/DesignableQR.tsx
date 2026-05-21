import React from 'react';
import { View, StyleSheet, ImageSourcePropType, ViewStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export type QRShape = 'square' | 'rounded' | 'dots' | 'circle';

export type QRDesign = {
  useLogo: boolean;
  backgroundColor: string;
  foregroundColor: string;
  shape: QRShape;
  logoSizeRatio?: number;
  /** Modül rengi gradient (react-native-qrcode-svg) */
  gradient?: { from: string; to: string; direction?: number[] };
  quietZone?: number;
  ecl?: 'L' | 'M' | 'Q' | 'H';
  logoBorderRadius?: number;
};

/** Çerçeve stilleri: minimal (yok), bordered, modern (gölge), elegant (çift çizgi) */
export type QRFrameStyle = 'minimal' | 'bordered' | 'modern' | 'elegant';

/** Ref: toDataURL(callback) ile QR'ı PNG base64 veya data URL olarak alırsınız. */
export type QRCodeRef = { toDataURL: (callback: (data: string) => void) => void } | null;

type DesignableQRProps = {
  value: string;
  size?: number;
  design: QRDesign;
  logo?: ImageSourcePropType;
  /** Ref almak için (QR indirme vb.). ref.toDataURL(cb) ile resim alınır. */
  getRef?: (ref: QRCodeRef) => void;
};

const defaultLogo = require('../assets/icon.png');

/** Sade QR: beyaz/siyah veya seçilen iki renk, isteğe bağlı logo. Karışık görünüm yok. */
export function DesignableQR({ value, size = 180, design, logo = defaultLogo, getRef }: DesignableQRProps) {
  const {
    useLogo,
    backgroundColor,
    foregroundColor,
    shape,
    logoSizeRatio = 0.22,
    gradient,
    quietZone = 0,
    ecl = 'M',
    logoBorderRadius = 8,
  } = design;

  const logoSize = Math.round(size * (logoSizeRatio || 0.22));
  const isCircle = shape === 'circle';
  const isRounded = shape === 'rounded' || shape === 'dots';
  const borderRadius = isCircle ? size / 2 : isRounded ? Math.min(size * 0.14, 20) : 4;
  const useGradient = Boolean(gradient?.from && gradient?.to);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
          overflow: isCircle || isRounded ? 'hidden' : 'visible',
        },
      ]}
    >
      <QRCode
        value={value}
        size={size}
        color={useGradient ? gradient!.from : foregroundColor}
        backgroundColor={backgroundColor}
        enableLinearGradient={useGradient}
        linearGradient={useGradient ? [gradient!.from, gradient!.to] : undefined}
        gradientDirection={gradient?.direction ?? [0, size, size, 0]}
        quietZone={quietZone}
        ecl={ecl}
        logo={useLogo ? logo : undefined}
        logoSize={useLogo ? logoSize : undefined}
        logoBackgroundColor={backgroundColor}
        logoMargin={3}
        logoBorderRadius={logoBorderRadius}
        getRef={getRef}
      />
    </View>
  );
}

const frameStyles: Record<QRFrameStyle, ViewStyle> = {
  minimal: {},
  bordered: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#1a365d',
    backgroundColor: '#fff',
  },
  modern: {
    padding: 22,
    borderRadius: 28,
    backgroundColor: '#fff',
    shadowColor: '#1a365d',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 10,
  },
  elegant: {
    padding: 22,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#fafafa',
  },
};

export const QR_FRAME_LABELS: Record<QRFrameStyle, string> = {
  minimal: 'Minimal',
  bordered: 'Çerçeveli',
  modern: 'Modern',
  elegant: 'Lüks',
};

type FramedQRProps = DesignableQRProps & { frame?: QRFrameStyle };

/** Çerçeve ile sarmalanmış QR; indirme ref'i iç QR'a bağlı. */
export function FramedQR({ value, size = 180, design, logo, getRef, frame = 'minimal' }: FramedQRProps) {
  const frameStyle = frameStyles[frame];
  if (frame === 'minimal') {
    return <DesignableQR value={value} size={size} design={design} logo={logo} getRef={getRef} />;
  }
  return (
    <View style={[styles.frameWrap, frameStyle]}>
      <DesignableQR value={value} size={size} design={design} logo={logo} getRef={getRef} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
