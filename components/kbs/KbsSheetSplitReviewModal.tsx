import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import {
  previewTilesForSheet,
  type KbsSheetDetectResult,
} from '@/lib/kbsCaptureSheetSplit';

const COUNT_OPTIONS = [1, 2, 3, 4] as const;
type SheetCount = (typeof COUNT_OPTIONS)[number];

type Props = {
  visible: boolean;
  sheetUri: string;
  detect: KbsSheetDetectResult;
  suggestedCount: number;
  progressLabel?: string;
  onConfirm: (count: number) => void;
  onSkip: () => void;
};

function clampCount(n: number): SheetCount {
  if (n >= 4) return 4;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

/**
 * A4 / çoklu sayfa: bu karede kaç kimlik var?
 * 1–4 seçilince her pasaport ayrı kırpılır → ayrı OCR / ayrı kayıt.
 */
export function KbsSheetSplitReviewModal({
  visible,
  sheetUri,
  detect,
  suggestedCount,
  progressLabel,
  onConfirm,
  onSkip,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const [count, setCount] = useState<SheetCount>(() => clampCount(suggestedCount));

  useEffect(() => {
    if (visible) setCount(clampCount(suggestedCount));
  }, [visible, sheetUri, suggestedCount]);

  const tiles = useMemo(() => previewTilesForSheet(detect, count), [detect, count]);
  const previewW = Math.min(winW - 48, 360);
  const previewH = previewW * (detect.height / Math.max(detect.width, 1));

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onSkip}>
      <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.card}>
          <Text style={styles.title}>Bu sayfada kaç pasaport?</Text>
          {progressLabel ? <Text style={styles.progress}>{progressLabel}</Text> : null}
          <Text style={styles.hint}>
            Tek karede 2 / 3 / 4 pasaport olabilir. Sayıyı seç — her biri ayrı okunur, bilgiler
            karışmaz.
          </Text>

          <View style={[styles.previewWrap, { width: previewW, height: Math.min(previewH, 320) }]}>
            <Image source={{ uri: sheetUri }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
            {tiles.map((t, i) => (
              <View
                key={`tile-${i}`}
                pointerEvents="none"
                style={[
                  styles.tileOverlay,
                  {
                    left: `${t.x * 100}%`,
                    top: `${t.y * 100}%`,
                    width: `${t.w * 100}%`,
                    height: `${t.h * 100}%`,
                  },
                ]}
              >
                <Text style={styles.tileNum}>{i + 1}</Text>
              </View>
            ))}
          </View>

          <View style={styles.countRow}>
            {COUNT_OPTIONS.map((n) => (
              <Pressable
                key={n}
                style={[styles.countBtn, count === n && styles.countBtnOn]}
                onPress={() => setCount(n)}
              >
                <Text style={[styles.countBtnText, count === n && styles.countBtnTextOn]}>
                  {n === 1 ? 'Tek' : String(n)}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.countHint}>
            {count === 1
              ? 'Tek kimlik — bölünmez'
              : count === 4
                ? '4 pasaport → 2×2 ayrı okuma'
                : `${count} pasaport → her biri ayrı kayıt + OCR`}
          </Text>

          <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm(count)} activeOpacity={0.9}>
            <Text style={styles.confirmText}>
              {count <= 1 ? 'Tek olarak ekle' : `${count} pasaportu ayır ve ekle`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={onSkip} activeOpacity={0.85}>
            <Text style={styles.skipText}>Bu fotoyu atla</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  progress: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted },
  hint: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  previewWrap: {
    alignSelf: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    overflow: 'hidden',
    marginVertical: 4,
  },
  tileOverlay: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#38bdf8',
    borderRadius: 4,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    padding: 4,
  },
  tileNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
    backgroundColor: 'rgba(14,165,233,0.9)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  countRow: { flexDirection: 'row', gap: 8 },
  countBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  countBtnOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  countBtnText: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  countBtnTextOn: { color: '#fff' },
  countHint: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, textAlign: 'center' },
  confirmBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  skipBtn: { height: 40, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
});
