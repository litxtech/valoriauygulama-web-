import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import { MRZ_FRAME_BORDER } from '@/lib/scanner/mrzFrameTheme';

type Props = {
  hint: string;
  frameKind: MrzCameraFrameKind;
  showSpinner: boolean;
  successGlow: boolean;
  documentFrame: 'passport' | 'id_card';
  groupCount?: number;
  torchEnabled: boolean;
  onToggleTorch: () => void;
  onBack: () => void;
  onGallery: () => void;
  galleryBusy?: boolean;
};

export function GuestScannerOverlay({
  hint,
  frameKind,
  showSpinner,
  successGlow,
  documentFrame,
  groupCount,
  torchEnabled,
  onToggleTorch,
  onBack,
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

  const frameStyle = documentFrame === 'passport' ? styles.mrzFrame : styles.idFrame;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Üst kamera barı — stack başlığı yok, kontroller burada */}
      <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.topIconBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('back')}
        >
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.topCenter}>
          <Text style={styles.title} numberOfLines={1}>
            {t('kbsGuestScanAlignTitle')}
          </Text>
          {groupCount != null && groupCount > 0 ? (
            <Text style={styles.groupSub}>{t('kbsGuestGroupCount', { count: groupCount })}</Text>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={onToggleTorch}
          style={styles.topIconBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={torchEnabled ? t('kbsTorchOff') : t('kbsTorchOn')}
        >
          <Ionicons name={torchEnabled ? 'flash' : 'flash-off'} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.center} pointerEvents="none">
        <View style={[frameStyle, { borderColor }]} />
      </View>

      {/* Alt: durum metni + sol altta galeri (yalnızca ikon, Apple tarzı) */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.hintRow}>
          {showSpinner ? <ActivityIndicator color="#fff" size="small" style={styles.hintSpinner} /> : null}
          <Text style={styles.hint} numberOfLines={2}>
            {hint || t('kbsGuestScanHintDefault')}
          </Text>
        </View>

        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.galleryIconBtn}
            onPress={onGallery}
            disabled={galleryBusy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('kbsGuestGalleryPick')}
          >
            {galleryBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="images" size={26} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 4,
    zIndex: 10,
  },
  topIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  groupSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mrzFrame: {
    width: '88%',
    height: 88,
    borderWidth: 2,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: '32%',
  },
  idFrame: {
    width: '78%',
    aspectRatio: 1.58,
    borderWidth: 2,
    borderRadius: 12,
    maxHeight: 220,
  },
  bottomBar: {
    paddingHorizontal: 16,
    zIndex: 10,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  hintSpinner: { marginRight: 8 },
  hint: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 52,
  },
  /** iOS Kamera: sol alt köşede fotoğraf albümü — metin yok */
  galleryIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
