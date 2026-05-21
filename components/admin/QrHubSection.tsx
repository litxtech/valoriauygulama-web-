import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import ViewShot from 'react-native-view-shot';
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

export { QR_EXPORT_SIZE_PRESETS, DEFAULT_QR_EXPORT_SIZE_ID };

type HubVariant = 'menu' | 'contract' | 'maliye' | 'general';

type Props = {
  title: string;
  description?: string;
  url: string;
  urlLabel?: string;
  urlEditable?: boolean;
  onUrlChange?: (v: string) => void;
  onSaveUrl?: () => void | Promise<void>;
  savingUrl?: boolean;
  children?: React.ReactNode;
  /** Varsayılan şablon önerisi */
  variant?: HubVariant;
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
      <Text style={styles.presetTag}>{preset.tag}</Text>
    </TouchableOpacity>
  );
}

export function QrHubSection({
  title,
  description,
  url,
  urlLabel = 'Adres (URL)',
  urlEditable = false,
  onUrlChange,
  onSaveUrl,
  savingUrl,
  children,
  variant = 'general',
}: Props) {
  const [exportSizeId, setExportSizeId] = useState(DEFAULT_QR_EXPORT_SIZE_ID);
  const [downloading, setDownloading] = useState<'branded' | 'plain' | null>(null);
  const [presetId, setPresetId] = useState(() => defaultPresetIdForHubVariant(variant));
  const brandShotRef = useRef<ViewShot>(null);
  const exportBrandShotRef = useRef<ViewShot>(null);
  const exportPlainShotRef = useRef<ViewShot>(null);
  const brandedExportPendingRef = useRef(false);
  const plainExportPendingRef = useRef(false);

  const preset = getQrHubPreset(presetId);
  const sizePreset = getQrExportSizePreset(exportSizeId);
  const exportQrSize = sizePreset.qrSize;
  const plainDesign = { ...preset.design, useLogo: false };

  const selectPreset = (id: string) => {
    setPresetId(id);
  };

  const copyUrl = async () => {
    if (!url.trim()) return;
    await Clipboard.setStringAsync(url.trim());
    Alert.alert('Kopyalandı', 'Link panoya alındı.');
  };

  const shareFile = useCallback(async (fileUri: string, dialogTitle: string) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'image/png', dialogTitle });
    } else {
      Alert.alert('Kaydedildi', fileUri);
    }
  }, []);

  const exportPlainQr = useCallback(() => {
    if (!url.trim()) {
      Alert.alert('Uyarı', 'Önce geçerli bir URL oluşturun.');
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Bilgi', 'QR indirmek için mobil uygulamayı kullanın.');
      return;
    }
    plainExportPendingRef.current = true;
    setDownloading('plain');
  }, [url]);

  const exportBrandedPoster = useCallback(() => {
    if (!url.trim()) {
      Alert.alert('Uyarı', 'Önce geçerli bir URL oluşturun.');
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Bilgi', 'Logolu poster için mobil uygulamayı kullanın.');
      return;
    }
    brandedExportPendingRef.current = true;
    setDownloading('branded');
  }, [url]);

  useEffect(() => {
    if (downloading !== 'branded' || !brandedExportPendingRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const shot = exportBrandShotRef.current;
        if (!shot?.capture) throw new Error('Kart hazır değil — tekrar deneyin');
        const uri = await shot.capture();
        await shareFile(uri, `${title} — logolu poster`);
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Logolu QR indirilemedi.');
      } finally {
        brandedExportPendingRef.current = false;
        if (!cancelled) setDownloading(null);
      }
    }, Math.min(1400, 480 + Math.round(exportQrSize / 6)));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [downloading, title, shareFile, exportQrSize]);

  useEffect(() => {
    if (downloading !== 'plain' || !plainExportPendingRef.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const shot = exportPlainShotRef.current;
        if (!shot?.capture) throw new Error('QR hazır değil, tekrar deneyin');
        const uri = await shot.capture();
        await shareFile(uri, `${title} — logosuz QR`);
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message ?? 'Logosuz QR indirilemedi.');
      } finally {
        plainExportPendingRef.current = false;
        if (!cancelled) setDownloading(null);
      }
    }, Math.min(1400, 480 + Math.round(sizePreset.plainQrSize / 6)));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [downloading, title, shareFile, sizePreset.plainQrSize]);

  return (
    <View style={styles.card}>
      <LinearGradient colors={['#1a365d', '#0d9488']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cardAccent} />
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.desc}>{description}</Text> : null}

      {children}

      <Text style={styles.label}>{urlLabel}</Text>
      {urlEditable && onUrlChange ? (
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={onUrlChange}
          placeholder="https://..."
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : (
        <Text selectable style={styles.urlReadonly}>
          {url || '—'}
        </Text>
      )}

      <View style={styles.btnRow}>
        {onSaveUrl ? (
          <TouchableOpacity style={styles.btnPrimary} onPress={() => void onSaveUrl()} disabled={savingUrl}>
            {savingUrl ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.btnPrimaryText}>URL kaydet</Text>}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.btnSecondary} onPress={copyUrl} disabled={!url.trim()}>
          <Ionicons name="copy-outline" size={18} color="#1a365d" />
          <Text style={styles.btnSecondaryText}>Kopyala</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Tasarım şablonu</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetScroll}>
        {QR_HUB_PRESETS.map((p) => (
          <PresetChip key={p.id} preset={p} selected={presetId === p.id} onPress={() => selectPreset(p.id)} />
        ))}
      </ScrollView>

      <View style={styles.qrStage}>
        <LinearGradient
          colors={[preset.swatch[0], preset.swatch[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.qrStageBorder}
        >
          <View style={styles.qrStageInner}>
            {url.trim() ? (
              <>
                <QrBrandPoster
                  ref={brandShotRef}
                  url={url.trim()}
                  qrSize={220}
                  design={preset.design}
                  accent={preset.swatch}
                  surface={preset.surface}
                  subtitle={title}
                />
                <Text style={styles.qrCaption}>{preset.name}</Text>
                <Text style={styles.qrCaptionSub}>
                  Kart indir = tam poster · QR kartı = yuvarlak köşeli sade QR
                </Text>
                <View style={styles.hiddenExport} pointerEvents="none" collapsable={false}>
                  <QrBrandPoster
                    ref={exportBrandShotRef}
                    url={url.trim()}
                    qrSize={exportQrSize}
                    design={preset.design}
                    accent={preset.swatch}
                    surface={preset.surface}
                    subtitle={title}
                    showFooter
                  />
                  <QrBrandPoster
                    ref={exportPlainShotRef}
                    url={url.trim()}
                    qrSize={sizePreset.plainQrSize}
                    design={plainDesign}
                    accent={preset.swatch}
                    surface={preset.surface}
                    showFooter={false}
                  />
                </View>
              </>
            ) : (
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code-outline" size={48} color="#94a3b8" />
                <Text style={styles.noUrl}>URL girilince modern QR önizlemesi burada görünür.</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.sectionLabel}>İndirme boyutu</Text>
      <Text style={styles.sizeHint}>Küçükten A4’e — seçilen ölçüde PNG indirilir</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sizeScroll}>
        {QR_EXPORT_SIZE_PRESETS.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.sizeChip, exportSizeId === s.id && styles.sizeChipOn]}
            onPress={() => setExportSizeId(s.id)}
          >
            <Text style={[styles.sizeChipLabel, exportSizeId === s.id && styles.sizeChipLabelOn]}>{s.label}</Text>
            <Text style={[styles.sizeChipHint, exportSizeId === s.id && styles.sizeChipHintOn]}>{s.hint}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.downloadRow}>
        <TouchableOpacity
          style={[styles.btnDownload, styles.btnDownloadBranded]}
          onPress={() => void exportBrandedPoster()}
          disabled={!url.trim() || downloading !== null}
        >
          {downloading === 'branded' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="image-outline" size={20} color="#fff" />
              <Text style={styles.btnDownloadText}>Kart indir ({sizePreset.label})</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnDownload, styles.btnDownloadPlain]}
          onPress={exportPlainQr}
          disabled={!url.trim() || downloading !== null}
        >
          {downloading === 'plain' ? (
            <ActivityIndicator color="#1a365d" size="small" />
          ) : (
            <>
              <Ionicons name="qr-code-outline" size={20} color="#1a365d" />
              <Text style={styles.btnDownloadTextPlain}>
                QR kartı ({sizePreset.label})
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 4 },
  title: { fontSize: 19, fontWeight: '800', color: '#0f172a', marginBottom: 6, marginTop: 4 },
  desc: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 12 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#475569', marginTop: 14, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 },
  label: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 8, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  urlReadonly: { fontSize: 13, color: '#0f766e', lineHeight: 18, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  btnPrimary: {
    flex: 1,
    minWidth: 120,
    backgroundColor: '#1a365d',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  btnSecondaryText: { color: '#1a365d', fontWeight: '600' },
  presetScroll: { gap: 10, paddingBottom: 4, paddingRight: 8 },
  sizeHint: { fontSize: 11, color: '#94a3b8', marginBottom: 8, marginTop: -4 },
  sizeScroll: { gap: 8, paddingBottom: 4, paddingRight: 8 },
  sizeChip: {
    minWidth: 88,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  sizeChipOn: { borderColor: '#0d9488', backgroundColor: '#ecfdf5' },
  sizeChipLabel: { fontSize: 13, fontWeight: '800', color: '#334155' },
  sizeChipLabelOn: { color: '#0f766e' },
  sizeChipHint: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  sizeChipHintOn: { color: '#14b8a6' },
  presetChip: {
    width: 100,
    padding: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  presetChipOn: { borderColor: '#0d9488', backgroundColor: '#ecfdf5' },
  presetSwatch: { height: 36, borderRadius: 10, marginBottom: 8 },
  presetName: { fontSize: 12, fontWeight: '800', color: '#334155' },
  presetNameOn: { color: '#0f766e' },
  presetTag: { fontSize: 10, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  qrStage: { marginTop: 8, marginBottom: 12 },
  qrStageBorder: { borderRadius: 24, padding: 3 },
  qrStageInner: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 21,
    backgroundColor: '#f8fafc',
  },
  qrCaption: { marginTop: 14, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  qrCaptionSub: { marginTop: 4, fontSize: 11, color: '#64748b', textAlign: 'center' },
  qrPlaceholder: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  noUrl: { color: '#94a3b8', fontSize: 13, textAlign: 'center', maxWidth: 260 },
  /** Ekran dışı tam boy — 1×1 kırpma kartı bozuyordu */
  hiddenExport: {
    position: 'absolute',
    left: -16000,
    top: 0,
    opacity: 0,
    zIndex: -1,
    gap: 48,
  },
  downloadRow: { gap: 10, marginTop: 4 },
  btnDownload: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  btnDownloadBranded: { backgroundColor: '#0f766e' },
  btnDownloadPlain: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  btnDownloadText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnDownloadTextPlain: { color: '#1a365d', fontWeight: '800', fontSize: 14 },
});
