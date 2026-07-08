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
  lastName?: string | null;
  torchEnabled: boolean;
  onToggleTorch: () => void;
  onBack: () => void;
  onFinish: () => void;
  onCancelNfc?: () => void;
};

export function NfcBatchScanOverlay({
  hint,
  frameKind,
  showSpinner,
  successGlow,
  scanStep,
  queueCount,
  reading,
  lastName,
  torchEnabled,
  onToggleTorch,
  onBack,
  onFinish,
  onCancelNfc,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const borderColor =
    successGlow || frameKind === 'success' || frameKind === 'ready_save' || scanStep === 'nfc'
      ? '#22c55e'
      : frameKind === 'reading' || frameKind === 'signal'
        ? '#fbbf24'
        : MRZ_FRAME_BORDER[frameKind];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={reading && onCancelNfc ? onCancelNfc : onBack}
          style={styles.topIconBtn}
          hitSlop={12}
          accessibilityLabel={reading ? t('cancel') : t('back')}
        >
          <Ionicons name={reading ? 'close' : 'chevron-back'} size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {reading ? t('kbsNfcStepChip') : t('kbsNfcBatchScanTitle')}
          </Text>
          <Text style={styles.groupSub}>
            {reading
              ? t('kbsNfcHoldPhoneHint')
              : queueCount > 0
                ? t('kbsNfcBatchQueueCount', { count: queueCount })
                : t('kbsNfcNoManualEntry')}
          </Text>
        </View>

        {!reading ? (
          <TouchableOpacity
            onPress={onToggleTorch}
            style={styles.topIconBtn}
            hitSlop={12}
            accessibilityLabel={torchEnabled ? t('kbsTorchOff') : t('kbsTorchOn')}
          >
            <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={24} color="#fff" />
          </TouchableOpacity>
        ) : (
          <View style={styles.topIconBtn} />
        )}
      </View>

      <View style={styles.steps} pointerEvents="none">
        <View style={[styles.step, scanStep === 'mrz' && styles.stepOn]}>
          <View style={[styles.stepDot, scanStep === 'mrz' && styles.stepDotOn]}>
            <Ionicons name="scan-outline" size={14} color="#fff" />
          </View>
          <Text style={[styles.stepLabel, scanStep === 'mrz' && styles.stepLabelOn]}>
            {t('kbsNfcStepUnlock')}
          </Text>
        </View>
        <View style={styles.stepLine} />
        <View style={[styles.step, scanStep === 'nfc' && styles.stepOn]}>
          <View style={[styles.stepDot, scanStep === 'nfc' && styles.stepDotOn]}>
            <Ionicons name="hardware-chip-outline" size={14} color="#fff" />
          </View>
          <Text style={[styles.stepLabel, scanStep === 'nfc' && styles.stepLabelOn]}>
            {t('kbsNfcStepChip')}
          </Text>
        </View>
      </View>

      <View style={styles.center} pointerEvents="none">
        {scanStep === 'nfc' ? (
          <View style={styles.nfcPulse}>
            <View style={styles.nfcPulseInner}>
              <ActivityIndicator color="#93c5fd" size="large" />
              <Ionicons name="hardware-chip" size={36} color="#93c5fd" style={styles.nfcChipIcon} />
            </View>
            <Text style={styles.nfcTitle}>{t('kbsNfcPresentPassport')}</Text>
            <Text style={styles.nfcSub}>{t('kbsNfcHoldPhoneHint')}</Text>
            <Text style={styles.nfcWait}>{t('kbsNfcWaitingSystem')}</Text>
          </View>
        ) : (
          <>
            <View style={[styles.mrzFrame, { borderColor }]} />
            <View style={styles.hintBox}>
              {showSpinner ? (
                <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 8 }} />
              ) : null}
              <Text style={styles.hint}>{hint || t('kbsNfcBatchScanHint')}</Text>
            </View>
          </>
        )}
      </View>

      {queueCount > 0 || reading ? (
        <View style={styles.toast} pointerEvents="none">
          {reading ? (
            <Text style={styles.toastText}>{t('kbsNfcReadingChipData')}</Text>
          ) : lastName ? (
            <Text style={styles.toastText}>
              ✓ {lastName} · {t('kbsNfcBatchQueueCount', { count: queueCount })}
            </Text>
          ) : (
            <Text style={styles.toastText}>{t('kbsNfcBatchQueueCount', { count: queueCount })}</Text>
          )}
        </View>
      ) : null}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {reading && onCancelNfc ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancelNfc}>
            <Text style={styles.cancelBtnText}>{t('kbsNfcCancelRead')}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.finishBtn, queueCount === 0 && styles.finishBtnDisabled]}
            onPress={onFinish}
            disabled={queueCount === 0}
          >
            <Text style={styles.finishBtnText}>
              {queueCount > 0
                ? t('kbsNfcFinishScanningCount', { count: queueCount })
                : t('kbsNfcFinishScanning')}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
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
  title: { color: '#fff', fontSize: 16, fontWeight: '800' },
  groupSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    gap: 10,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: 0.55 },
  stepOn: { opacity: 1 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotOn: { backgroundColor: '#2563eb' },
  stepLabel: { color: 'rgba(255,255,255,0.7)', fontWeight: '700', fontSize: 12 },
  stepLabelOn: { color: '#fff' },
  stepLine: { width: 28, height: 2, backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  mrzFrame: {
    width: '86%',
    height: '20%',
    borderWidth: 3,
    borderRadius: 14,
    backgroundColor: 'transparent',
  },
  hintBox: { marginTop: 20, paddingHorizontal: 28, alignItems: 'center' },
  hint: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 21,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  nfcPulse: { alignItems: 'center', paddingHorizontal: 28 },
  nfcPulseInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(37, 99, 235, 0.35)',
    borderWidth: 2,
    borderColor: 'rgba(147, 197, 253, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  nfcChipIcon: { position: 'absolute', opacity: 0.85 },
  nfcTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  nfcSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  nfcWait: {
    color: 'rgba(147, 197, 253, 0.95)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 14,
    fontWeight: '700',
  },
  toast: {
    alignSelf: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  bottomBar: { paddingHorizontal: 16, paddingTop: 8 },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    borderRadius: 16,
    paddingVertical: 15,
  },
  finishBtnDisabled: { opacity: 0.4 },
  finishBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  cancelBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
