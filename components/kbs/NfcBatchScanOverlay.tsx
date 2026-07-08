import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import { MRZ_FRAME_BORDER } from '@/lib/scanner/mrzFrameTheme';

type ScanStep = 'mrz' | 'nfc';

type Props = {
  hint: string;
  frameKind: MrzCameraFrameKind;
  showSpinner: boolean;
  successGlow: boolean;
  scanStep: ScanStep;
  queueCount: number;
  reading: boolean;
  torchEnabled: boolean;
  onToggleTorch: () => void;
  onBack: () => void;
  onFinish: () => void;
  onGallery?: () => void;
  galleryBusy?: boolean;
};

export function NfcBatchScanOverlay({
  hint,
  frameKind,
  showSpinner,
  successGlow,
  scanStep,
  queueCount,
  reading,
  torchEnabled,
  onToggleTorch,
  onBack,
  onFinish,
  onGallery,
  galleryBusy,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const borderColor =
    successGlow || frameKind === 'locked'
      ? '#22c55e'
      : frameKind === 'reading' || frameKind === 'signal'
        ? '#fbbf24'
        : MRZ_FRAME_BORDER;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity onPress={onBack} style={styles.topIconBtn} hitSlop={12} accessibilityLabel={t('back')}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {t('kbsNfcBatchScanTitle')}
          </Text>
          {queueCount > 0 ? (
            <Text style={styles.groupSub}>{t('kbsNfcBatchQueueCount', { count: queueCount })}</Text>
          ) : (
            <Text style={styles.groupSub}>{t('kbsNfcBatchScanSub')}</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={onToggleTorch}
          style={styles.topIconBtn}
          hitSlop={12}
          accessibilityLabel={torchEnabled ? t('kbsTorchOff') : t('kbsTorchOn')}
        >
          <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.stepRow} pointerEvents="none">
        <View style={[styles.stepPill, scanStep === 'mrz' && styles.stepPillActive]}>
          <Text style={[styles.stepText, scanStep === 'mrz' && styles.stepTextActive]}>1 · MRZ</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color="rgba(255,255,255,0.7)" />
        <View style={[styles.stepPill, scanStep === 'nfc' && styles.stepPillActive]}>
          <Text style={[styles.stepText, scanStep === 'nfc' && styles.stepTextActive]}>2 · NFC</Text>
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        <View style={[styles.mrzFrame, { borderColor }]} />
        <View style={styles.hintBox}>
          {showSpinner || reading ? <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 6 }} /> : null}
          <Text style={styles.hint}>
            {reading ? t('kbsNfcPresentPassport') : hint || t('kbsNfcBatchScanHint')}
          </Text>
        </View>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {onGallery ? (
          <TouchableOpacity
            style={styles.galleryBtn}
            onPress={onGallery}
            disabled={galleryBusy || reading}
            accessibilityLabel={t('kbsGuestGalleryPick')}
          >
            {galleryBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="images-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[styles.finishBtn, queueCount === 0 && styles.finishBtnDisabled]}
          onPress={onFinish}
          disabled={queueCount === 0 || reading}
        >
          <Text style={styles.finishBtnText}>{t('kbsNfcFinishScanning')}</Text>
          <Ionicons name="checkmark-done" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: { flex: 1, alignItems: 'center', minWidth: 0 },
  title: { color: '#fff', fontSize: 15, fontWeight: '800' },
  groupSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2, fontWeight: '600' },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  stepPillActive: { backgroundColor: 'rgba(37, 99, 235, 0.85)' },
  stepText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700' },
  stepTextActive: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mrzFrame: {
    width: '88%',
    height: '22%',
    borderWidth: 3,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  hintBox: {
    marginTop: 18,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  galleryBtn: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    paddingVertical: 14,
  },
  finishBtnDisabled: { opacity: 0.45 },
  finishBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
