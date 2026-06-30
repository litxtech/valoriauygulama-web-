import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import { QrBrandPoster } from '@/components/admin/QrBrandPoster';
import {
  QR_HUB_PRESETS,
  defaultPresetIdForHubVariant,
  getQrHubPreset,
  type QrHubPreset,
} from '@/lib/qrHubPresets';
import {
  DEFAULT_QR_EXPORT_SIZE_ID,
  QR_EXPORT_SIZE_PRESETS,
  getQrExportSizePreset,
} from '@/lib/qrExportSizes';
import { buildPublicMenuUrl, fetchPublicAppOriginFromSettings } from '@/lib/appPublicUrl';
import { fetchOrganizationSlugById } from '@/lib/publicKitchenMenu';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';

type Props = {
  visible: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName?: string | null;
};

function PresetChip({
  preset,
  selected,
  onPress,
}: {
  preset: QrHubPreset;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.presetChip, selected && styles.presetChipOn]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <LinearGradient
        colors={preset.swatch}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.presetSwatch}
      />
      <Text style={[styles.presetName, selected && styles.presetNameOn]} numberOfLines={1}>
        {preset.name}
      </Text>
    </TouchableOpacity>
  );
}

export function HotelKitchenMenuQrSheet({ visible, onClose, organizationId, organizationName }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [menuUrl, setMenuUrl] = useState('');
  const [presetId, setPresetId] = useState(() => defaultPresetIdForHubVariant('menu'));
  const [exportSizeId, setExportSizeId] = useState(DEFAULT_QR_EXPORT_SIZE_ID);
  const [downloading, setDownloading] = useState<'branded' | 'plain' | null>(null);

  const exportBrandShotRef = useRef<ViewShot>(null);
  const exportPlainShotRef = useRef<ViewShot>(null);
  const brandedExportPendingRef = useRef(false);
  const plainExportPendingRef = useRef(false);

  const preset = getQrHubPreset(presetId);
  const sizePreset = getQrExportSizePreset(exportSizeId);
  const exportQrSize = sizePreset.qrSize;
  const plainDesign = { ...preset.design, useLogo: false };
  const posterSubtitle = organizationName?.trim() || t('hotelKitchenMenuHeroTitle');

  const loadUrl = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const [slug, origin] = await Promise.all([
        fetchOrganizationSlugById(organizationId),
        fetchPublicAppOriginFromSettings(),
      ]);
      if (!slug) {
        setMenuUrl('');
        return;
      }
      setMenuUrl(buildPublicMenuUrl(slug, origin));
    } catch {
      setMenuUrl('');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (!visible) return;
    void loadUrl();
  }, [visible, loadUrl]);

  const copyUrl = async () => {
    if (!menuUrl.trim()) return;
    await Clipboard.setStringAsync(menuUrl.trim());
    Alert.alert(t('publicKitchenMenuQrCopiedTitle'), t('publicKitchenMenuQrCopiedBody'));
  };

  const shareFile = useCallback(async (fileUri: string, dialogTitle: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle });
    } else {
      Alert.alert(t('publicKitchenMenuQrCopiedTitle'), fileUri);
    }
  }, [t]);

  const exportBrandedPoster = useCallback(() => {
    if (!menuUrl.trim()) {
      Alert.alert('', t('publicKitchenMenuQrNoSlug'));
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('', t('publicKitchenMenuQrWebHint'));
      return;
    }
    brandedExportPendingRef.current = true;
    setDownloading('branded');
  }, [menuUrl, t]);

  const exportPlainQr = useCallback(() => {
    if (!menuUrl.trim()) {
      Alert.alert('', t('publicKitchenMenuQrNoSlug'));
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('', t('publicKitchenMenuQrWebHint'));
      return;
    }
    plainExportPendingRef.current = true;
    setDownloading('plain');
  }, [menuUrl, t]);

  useEffect(() => {
    if (downloading !== 'branded' || !brandedExportPendingRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const shot = exportBrandShotRef.current;
        if (!shot?.capture) throw new Error('QR hazır değil');
        const uri = await shot.capture();
        await shareFile(uri, t('publicKitchenMenuQrTitle'));
      } catch (e) {
        Alert.alert('', (e as Error)?.message ?? 'İndirilemedi');
      } finally {
        brandedExportPendingRef.current = false;
        if (!cancelled) setDownloading(null);
      }
    }, Math.min(1400, 480 + Math.round(exportQrSize / 6)));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [downloading, shareFile, exportQrSize, t]);

  useEffect(() => {
    if (downloading !== 'plain' || !plainExportPendingRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const shot = exportPlainShotRef.current;
        if (!shot?.capture) throw new Error('QR hazır değil');
        const uri = await shot.capture();
        await shareFile(uri, t('publicKitchenMenuQrTitle'));
      } catch (e) {
        Alert.alert('', (e as Error)?.message ?? 'İndirilemedi');
      } finally {
        plainExportPendingRef.current = false;
        if (!cancelled) setDownloading(null);
      }
    }, Math.min(1400, 480 + Math.round(sizePreset.plainQrSize / 6)));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [downloading, shareFile, sizePreset.plainQrSize, t]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="qr-code" size={22} color={menuUi.accent} />
              </View>
              <View style={styles.headerTexts}>
                <Text style={styles.title}>{t('publicKitchenMenuQrTitle')}</Text>
                <Text style={styles.sub}>{t('publicKitchenMenuQrSub')}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeIcon}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color={menuUi.accent} />
              </View>
            ) : !menuUrl ? (
              <View style={styles.loadingBox}>
                <Ionicons name="alert-circle-outline" size={40} color="#b45309" />
                <Text style={styles.warnText}>{t('publicKitchenMenuQrNoSlug')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.urlBox}>
                  <Text style={styles.urlLabel}>{t('publicKitchenMenuQrUrlLabel')}</Text>
                  <Text selectable style={styles.urlValue}>
                    {menuUrl}
                  </Text>
                  <Text style={styles.hint}>{t('publicKitchenMenuQrHint')}</Text>
                </View>

                <TouchableOpacity style={styles.copyBtn} onPress={() => void copyUrl()} activeOpacity={0.88}>
                  <Ionicons name="copy-outline" size={18} color={menuUi.navy} />
                  <Text style={styles.copyBtnText}>{t('publicKitchenMenuQrCopy')}</Text>
                </TouchableOpacity>

                <Text style={styles.sectionLabel}>{t('publicKitchenMenuQrDesignLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
                  {QR_HUB_PRESETS.map((p) => (
                    <PresetChip key={p.id} preset={p} selected={presetId === p.id} onPress={() => setPresetId(p.id)} />
                  ))}
                </ScrollView>

                <View style={styles.previewWrap}>
                  <QrBrandPoster
                    url={menuUrl}
                    qrSize={200}
                    design={preset.design}
                    accent={preset.swatch}
                    surface={preset.surface}
                    subtitle={posterSubtitle}
                  />
                </View>

                <Text style={styles.sectionLabel}>{t('publicKitchenMenuQrSizeLabel')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sizeScroll}>
                  {QR_EXPORT_SIZE_PRESETS.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.sizeChip, exportSizeId === s.id && styles.sizeChipOn]}
                      onPress={() => setExportSizeId(s.id)}
                    >
                      <Text style={[styles.sizeChipLabel, exportSizeId === s.id && styles.sizeChipLabelOn]}>
                        {s.label}
                      </Text>
                      <Text style={[styles.sizeChipHint, exportSizeId === s.id && styles.sizeChipHintOn]}>{s.hint}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <View style={styles.downloadRow}>
                  <TouchableOpacity
                    style={[styles.downloadBtn, styles.downloadBranded]}
                    onPress={() => void exportBrandedPoster()}
                    disabled={downloading !== null}
                  >
                    {downloading === 'branded' ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={20} color="#fff" />
                        <Text style={styles.downloadBrandedText}>
                          {t('publicKitchenMenuQrDownloadPoster', { size: sizePreset.label })}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.downloadBtn, styles.downloadPlain]}
                    onPress={() => void exportPlainQr()}
                    disabled={downloading !== null}
                  >
                    {downloading === 'plain' ? (
                      <ActivityIndicator color={menuUi.navy} size="small" />
                    ) : (
                      <>
                        <Ionicons name="qr-code-outline" size={20} color={menuUi.navy} />
                        <Text style={styles.downloadPlainText}>
                          {t('publicKitchenMenuQrDownloadPlain', { size: sizePreset.label })}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.hiddenExport} pointerEvents="none" collapsable={false}>
                  <QrBrandPoster
                    ref={exportBrandShotRef}
                    url={menuUrl}
                    qrSize={exportQrSize}
                    design={preset.design}
                    accent={preset.swatch}
                    surface={preset.surface}
                    subtitle={posterSubtitle}
                    showFooter
                  />
                  <QrBrandPoster
                    ref={exportPlainShotRef}
                    url={menuUrl}
                    qrSize={sizePreset.plainQrSize}
                    design={plainDesign}
                    accent={preset.swatch}
                    surface={preset.surface}
                    showFooter={false}
                  />
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginTop: 10,
    marginBottom: 4,
  },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTexts: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '800', color: menuUi.navy },
  sub: { fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 18 },
  closeIcon: { padding: 4 },
  loadingBox: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  warnText: { fontSize: 14, color: '#b45309', textAlign: 'center', maxWidth: 280 },
  urlBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 12,
  },
  urlLabel: { fontSize: 11, fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: 0.4 },
  urlValue: { fontSize: 13, color: '#065f46', marginTop: 6, lineHeight: 18, fontWeight: '600' },
  hint: { fontSize: 12, color: '#16a34a', marginTop: 8, lineHeight: 17 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: menuUi.border,
    backgroundColor: '#f8fafc',
    marginBottom: 8,
  },
  copyBtnText: { fontSize: 14, fontWeight: '700', color: menuUi.navy },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    marginTop: 14,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  presetScroll: { gap: 10, paddingBottom: 4, paddingRight: 8 },
  presetChip: {
    width: 88,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  presetChipOn: { borderColor: menuUi.accent, backgroundColor: menuUi.accentSoft },
  presetSwatch: { height: 32, borderRadius: 8, marginBottom: 6 },
  presetName: { fontSize: 11, fontWeight: '700', color: '#334155' },
  presetNameOn: { color: menuUi.navy },
  previewWrap: { alignItems: 'center', marginVertical: 12 },
  sizeScroll: { gap: 8, paddingBottom: 4, paddingRight: 8 },
  sizeChip: {
    minWidth: 80,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  sizeChipOn: { borderColor: menuUi.accent, backgroundColor: menuUi.accentSoft },
  sizeChipLabel: { fontSize: 12, fontWeight: '800', color: '#334155' },
  sizeChipLabelOn: { color: menuUi.navy },
  sizeChipHint: { fontSize: 9, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  sizeChipHintOn: { color: menuUi.accentDeep },
  downloadRow: { gap: 10, marginTop: 8 },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  downloadBranded: { backgroundColor: menuUi.navy },
  downloadBrandedText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  downloadPlain: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  downloadPlainText: { color: menuUi.navy, fontWeight: '800', fontSize: 14 },
  hiddenExport: {
    position: 'absolute',
    left: -16000,
    top: 0,
    opacity: 0,
    zIndex: -1,
    gap: 48,
  },
});
