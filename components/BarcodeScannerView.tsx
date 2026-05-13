import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, AppState, ActivityIndicator } from 'react-native';
import { CameraView, Camera } from 'expo-camera';

/** Sadece sık kullanılan barkod tipleri — hepsini taramak kasılmaya yol açar */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

export type BarcodeScanResult = { type: string; data: string };

type BarcodeScannerViewProps = {
  onScan: (result: BarcodeScanResult) => void;
  onClose?: () => void;
  continuous?: boolean;
  showCloseButton?: boolean;
  title?: string;
  hint?: string;
};

const SCAN_THROTTLE_MS = 2200;

type PermStatus = 'granted' | 'denied' | 'undetermined';

export function BarcodeScannerView({
  onScan,
  onClose,
  continuous = false,
  showCloseButton = true,
  title = 'Barkod Okut',
  hint = 'Barkodu çerçeve içine getirin',
}: BarcodeScannerViewProps) {
  const [permStatus, setPermStatus] = useState<PermStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [lastData, setLastData] = useState<string | null>(null);
  const lastScanTime = useRef(0);

  const refreshPermission = useCallback(async () => {
    try {
      const p = await Camera.getCameraPermissionsAsync();
      setPermStatus(p.status as PermStatus);
      setCanAskAgain(p.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
      setCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      setPermStatus(result.status as PermStatus);
      setCanAskAgain(result.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
    } finally {
      setRequesting(false);
    }
  }, []);

  const handleBarCodeScanned = useCallback(
    ({ type, data }: BarcodeScanResult) => {
      const now = Date.now();
      if (now - lastScanTime.current < SCAN_THROTTLE_MS) return;
      if (!continuous && scanned) return;
      if (continuous && lastData === data) return;
      lastScanTime.current = now;
      setLastData(data);
      if (!continuous) setScanned(true);
      onScan({ type, data });
    },
    [continuous, scanned, lastData, onScan]
  );

  const resetScan = () => {
    setScanned(false);
    setLastData(null);
  };

  if (permStatus === null) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="small" color="#b8860b" />
      </View>
    );
  }

  if (permStatus !== 'granted') {
    return (
      <View style={styles.centered}>
        <View style={styles.permCard}>
          <View style={styles.permCardHeader}>
            <View style={styles.permCardIconWrap}>
              <Text style={styles.permCardIcon}>📷</Text>
            </View>
            <View style={styles.permCardTitleWrap}>
              <Text style={styles.permCardTitle}>{title}</Text>
              <Text style={styles.permCardSubtitle}>
                Barkod okutmak için kamera izni gerekiyor. QR kod, EAN, UPC vb. taranabilir.
              </Text>
            </View>
            <View style={[styles.permCardBadge, permStatus === 'denied' && styles.permCardBadgeDenied]}>
              <Text style={[styles.permCardBadgeText, permStatus === 'denied' && styles.permCardBadgeTextDenied]}>
                {permStatus === 'denied' ? 'Kapalı' : 'İstenmedi'}
              </Text>
            </View>
          </View>
          <View style={styles.permCardNotes}>
            <Text style={styles.permCardNote}>• "Devam" derseniz sistem izin penceresi açılır.</Text>
            <Text style={styles.permCardNote}>• Daha önce reddedildiyse ayarlardan kamera iznini açmanız gerekir.</Text>
          </View>
          <TouchableOpacity
            style={[styles.permCardPrimaryBtn, requesting && { opacity: 0.75 }]}
            onPress={canAskAgain ? handleRequestPermission : () => Linking.openSettings()}
            disabled={requesting}
            activeOpacity={0.85}
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Text style={styles.permCardPrimaryIcon}>{canAskAgain ? '✓' : '⚙'}</Text>
                <Text style={styles.permCardPrimaryText}>
                  {canAskAgain ? 'Devam' : 'Ayarları aç'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: [...BARCODE_TYPES],
        }}
        onBarcodeScanned={scanned && !continuous ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>{title}</Text>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
        </View>
        <Text style={styles.hint}>{hint}</Text>
        {scanned && !continuous && (
          <TouchableOpacity style={styles.retryBtn} onPress={resetScan}>
            <Text style={styles.retryBtnText}>Tekrar Okut</Text>
          </TouchableOpacity>
        )}
        {showCloseButton && onClose && (
          <TouchableOpacity style={styles.closeBtnOverlay} onPress={onClose}>
            <Text style={styles.closeBtnText}>Kapat</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  boot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a365d',
    padding: 24,
  },
  permCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    padding: 16,
    width: '100%',
    maxWidth: 360,
  },
  permCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  permCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(184,134,11,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permCardIcon: { fontSize: 22 },
  permCardTitleWrap: { flex: 1, minWidth: 0 },
  permCardTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
  },
  permCardSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
  },
  permCardBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  permCardBadgeDenied: { backgroundColor: 'rgba(239,68,68,0.3)' },
  permCardBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  permCardBadgeTextDenied: { color: '#fca5a5' },
  permCardNotes: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  permCardNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  permCardPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#b8860b',
    borderRadius: 14,
    paddingVertical: 14,
  },
  permCardPrimaryIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  permCardPrimaryText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  closeBtn: { marginTop: 20 },
  closeBtnText: { color: 'rgba(255,255,255,0.9)', fontSize: 16 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayTitle: {
    position: 'absolute',
    top: 50,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  frame: {
    width: 260,
    height: 140,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#b8860b',
    borderWidth: 4,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  hint: {
    marginTop: 24,
    fontSize: 14,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: 'rgba(184,134,11,0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtnOverlay: {
    position: 'absolute',
    bottom: 40,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
