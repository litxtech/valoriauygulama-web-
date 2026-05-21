import React, { useCallback, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { MrzVisionScanner, type MrzVisionUiState, type MrzLockedPayload } from '@/components/mrz/MrzVisionScanner';
import { MrzNativeBuildRequired } from '@/components/mrz/MrzNativeBuildRequired';
import { isMrzVisionScannerAvailable } from '@/lib/scanner/mrzVisionAvailability';
import { GuestScannerOverlay } from '@/components/kbs/GuestScannerOverlay';
import { scanDocumentFromGallery } from '@/lib/guestScan/galleryScan';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import { triggerMrzSuccessHaptic } from '@/lib/mrzScanHaptics';
import type { GuestScanLockPayload } from '@/lib/guestScan/types';

const LOCK_DEBOUNCE_MS = 2000;

type Props = {
  enabled: boolean;
  soundEnabled: boolean;
  groupCount?: number;
  onLocked: (payload: GuestScanLockPayload) => void;
  onBack: () => void;
  onGalleryError?: (message: string) => void;
};

export function GuestIdentityScanner({ enabled, soundEnabled, groupCount, onLocked, onBack, onGalleryError }: Props) {
  const { t } = useTranslation();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [ui, setUi] = useState<MrzVisionUiState>({
    frameKind: 'idle',
    hint: '',
    showSpinner: false,
    successGlow: false,
  });
  const lockUntilRef = useRef(0);
  const visionOk = isMrzVisionScannerAvailable();

  const handleVisionLocked = useCallback(
    async (p: MrzLockedPayload) => {
      if (Date.now() < lockUntilRef.current) return;
      lockUntilRef.current = Date.now() + LOCK_DEBOUNCE_MS;
      await playKbsScanSound('read', soundEnabled);
      void triggerMrzSuccessHaptic();
      onLocked({
        parsed: p.parsed,
        mrz: p.mrz,
        sourceType: 'camera',
      });
    },
    [onLocked, soundEnabled]
  );

  const handleGallery = useCallback(async () => {
    if (galleryBusy) return;
    setGalleryBusy(true);
    try {
      const res = await scanDocumentFromGallery();
      if (!res.ok) {
        if (res.code !== 'cancelled' && res.message) onGalleryError?.(res.message);
        return;
      }
      lockUntilRef.current = Date.now() + LOCK_DEBOUNCE_MS;
      await playKbsScanSound('read', soundEnabled);
      void triggerMrzSuccessHaptic();
      onLocked(res.payload);
    } finally {
      setGalleryBusy(false);
    }
  }, [galleryBusy, onGalleryError, onLocked, soundEnabled]);

  if (!visionOk) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <MrzNativeBuildRequired />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <MrzVisionScanner
        enabled={enabled}
        torchEnabled={torchEnabled}
        onUiStateChange={setUi}
        onLocked={handleVisionLocked}
      />
      <GuestScannerOverlay
        hint={ui.hint || t('kbsGuestScanMrzSearching')}
        frameKind={ui.frameKind}
        showSpinner={ui.showSpinner}
        successGlow={ui.successGlow}
        documentFrame="passport"
        groupCount={groupCount}
        torchEnabled={torchEnabled}
        onToggleTorch={() => setTorchEnabled((v) => !v)}
        onBack={onBack}
        onGallery={handleGallery}
        galleryBusy={galleryBusy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
});
