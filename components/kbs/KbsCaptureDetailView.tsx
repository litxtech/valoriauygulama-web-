import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import type { KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { displayCapturedName, capturedAtTs } from '@/lib/kbsCaptureHistory';
import { buildKbsCopyFields, enrichKbsParsedFromSources, isKbsOcrInProgress, kbsCaptureCardStatus } from '@/lib/kbsCaptureParsedFields';
import { buildKbsCaptureSingleReportHtml } from '@/lib/kbsCaptureReportHtml';
import type { ParsedDocument } from '@/lib/scanner/types';
import { hapticImpactLight } from '@/lib/hapticsSafe';

type Props = {
  row: KbsCapturedDocumentRow;
  canSeeImage: boolean;
  isNew?: boolean;
  onImagePress?: () => void;
  onCorrect?: () => void;
  correctBusy?: boolean;
};

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  return enrichKbsParsedFromSources(row.parsed_payload);
}

function statusUi(parsed: ParsedDocument | null) {
  const card = kbsCaptureCardStatus(parsed);
  if (!card || card.tone !== 'ok') return null;
  return {
    label: card.label,
    bg: '#ecfdf5',
    fg: '#059669',
    icon: 'checkmark-circle-outline' as const,
  };
}

export function KbsCaptureDetailView({
  row,
  canSeeImage,
  isNew = false,
  onImagePress,
  onCorrect,
  correctBusy = false,
}: Props) {
  const [exportBusy, setExportBusy] = useState(false);
  const parsed = asParsed(row);
  const fields = useMemo(() => buildKbsCopyFields(parsed), [parsed]);
  const ocrInProgress = isKbsOcrInProgress(parsed);
  const badge = statusUi(parsed);

  const buildReportHtml = useCallback(
    () => buildKbsCaptureSingleReportHtml(row, canSeeImage),
    [row, canSeeImage]
  );

  const exportPdf = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const html = await buildReportHtml();
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Kimlik PDF' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      Alert.alert('PDF', e instanceof Error ? e.message : 'PDF oluşturulamadı');
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, buildReportHtml]);

  const printDocument = useCallback(async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const html = await buildReportHtml();
      await Print.printAsync({ html });
    } catch (e) {
      Alert.alert('Yazdır', e instanceof Error ? e.message : 'Yazdırılamadı');
    } finally {
      setExportBusy(false);
    }
  }, [exportBusy, buildReportHtml]);

  const copyValue = useCallback(async (label: string, value: string) => {
    await Clipboard.setStringAsync(value);
    hapticImpactLight();
    Alert.alert('Kopyalandı', `${label} panoya kopyalandı.`);
  }, []);

  const copyAll = useCallback(async () => {
    if (!fields.length) {
      Alert.alert('Henüz veri yok', 'Bu kayıt yalnızca görsel olarak saklanmış.');
      return;
    }
    const block = fields.map((f) => `${f.label}: ${f.value}`).join('\n');
    await Clipboard.setStringAsync(block);
    hapticImpactLight();
    Alert.alert('Kopyalandı', `${fields.length} alan panoya kopyalandı.`);
  }, [fields]);

  const showExportActions = fields.length > 0 || (canSeeImage && !!row.front_image_url);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {canSeeImage && row.front_image_url ? (
        <Pressable onPress={onImagePress} style={styles.heroWrap}>
          <Image source={{ uri: row.front_image_url }} style={styles.hero} contentFit="contain" />
          <View style={styles.heroHint}>
            <Ionicons name="expand-outline" size={16} color="#fff" />
            <Text style={styles.heroHintText}>Büyüt</Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.heroPlaceholder}>
          <Ionicons name="id-card-outline" size={40} color={theme.colors.textMuted} />
        </View>
      )}

      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{displayCapturedName(row)}</Text>
            {isNew ? (
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>Yeni</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.meta}>Oda {row.room_number ?? '—'}</Text>
          <Text style={styles.meta}>{new Date(capturedAtTs(row)).toLocaleString('tr-TR')}</Text>
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Ionicons name={badge.icon} size={16} color={badge.fg} />
            <Text style={[styles.badgeText, { color: badge.fg }]}>{badge.label}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Kimlik bilgileri</Text>
      {canSeeImage && row.front_image_url && onCorrect ? (
        <Pressable
          style={[styles.correctBtn, correctBusy && styles.correctBtnDisabled]}
          onPress={onCorrect}
          disabled={correctBusy || ocrInProgress}
        >
          {correctBusy || ocrInProgress ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="scan-outline" size={18} color="#fff" />
          )}
          <Text style={styles.correctBtnText}>
            {correctBusy ? 'Belge taranıyor…' : ocrInProgress ? 'Okunuyor…' : 'Düzelt — yeniden tara'}
          </Text>
        </Pressable>
      ) : null}
      {fields.length > 0 ? (
        <Text style={styles.hint}>Alana dokunun — değer panoya kopyalanır.</Text>
      ) : null}

      {ocrInProgress ? (
        <View style={styles.ocrProgressBox}>
          <ActivityIndicator size="small" color={theme.colors.primary} />
          <Text style={styles.ocrProgressText}>Kimlik okunuyor…</Text>
        </View>
      ) : null}

      {fields.length === 0 && !ocrInProgress ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>Belge henüz okunmadı veya okunabilir alan çıkarılamadı.</Text>
        </View>
      ) : fields.length > 0 ? (
        <View style={styles.fieldList}>
          {fields.map((f) => (
            <Pressable
              key={f.key}
              style={({ pressed }) => [styles.fieldRow, pressed && styles.fieldRowPressed]}
              onPress={() => void copyValue(f.label, f.value)}
            >
              <View style={styles.fieldTextCol}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <Text style={styles.fieldValue} selectable>
                  {f.value}
                </Text>
              </View>
              <Ionicons name="copy-outline" size={20} color={theme.colors.primary} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {fields.length > 0 ? (
        <Pressable style={styles.copyAllBtn} onPress={() => void copyAll()}>
          <Ionicons name="clipboard-outline" size={20} color="#fff" />
          <Text style={styles.copyAllText}>Tümünü kopyala</Text>
        </Pressable>
      ) : null}

      {showExportActions ? (
        <View style={styles.exportRow}>
          {exportBusy ? (
            <View style={styles.exportBusyRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.exportBusyText}>PDF hazırlanıyor…</Text>
            </View>
          ) : null}
          <Pressable
            style={[styles.exportBtn, exportBusy && styles.exportBtnDisabled]}
            onPress={() => void exportPdf()}
            disabled={exportBusy}
          >
            <Ionicons name="document-text-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.exportBtnText}>PDF</Text>
          </Pressable>
          <Pressable
            style={[styles.exportBtn, exportBusy && styles.exportBtnDisabled]}
            onPress={() => void printDocument()}
            disabled={exportBusy}
          >
            <Ionicons name="print-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.exportBtnText}>Yazdır</Text>
          </Pressable>
          <Pressable
            style={[styles.exportBtn, exportBusy && styles.exportBtnDisabled]}
            onPress={() => void exportPdf()}
            disabled={exportBusy}
          >
            <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
            <Text style={[styles.exportBtnText, { color: '#25D366' }]}>WhatsApp</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 40 },
  heroWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
    marginBottom: 14,
    minHeight: 240,
  },
  hero: { width: '100%', height: 260 },
  heroHint: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  heroHintText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroPlaceholder: {
    height: 160,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  name: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  newBadge: {
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  newBadgeText: { fontSize: 11, fontWeight: '800', color: '#0d9488' },
  meta: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  badgeText: { fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4, marginTop: 4 },
  correctBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  correctBtnDisabled: { opacity: 0.72 },
  correctBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  hint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 10 },
  ocrProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  ocrProgressText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  exportBusyRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  exportBusyText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  exportBtnDisabled: { opacity: 0.5 },
  exportBtnText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  fieldList: { gap: 8 },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  fieldRowPressed: { backgroundColor: '#f8fafc' },
  fieldTextCol: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 },
  fieldValue: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  copyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 16,
  },
  copyAllText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyBox: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
