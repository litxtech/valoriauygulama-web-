import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import {
  fetchKbsCapturedDocumentById,
  filterKbsCapturesForViewer,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { getKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import {
  buildKbsIdentityCompareRows,
  compareDisplayTitle,
  resolveComparePreviousId,
  summarizeKbsIdentityMatch,
  type KbsCompareFieldRow,
  type KbsIdentityMatchSummary,
} from '@/lib/kbsReturningGuestCompare';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { buildKbsCaptureGalleryItems } from '@/lib/kbsCaptureGallery';
import { Redirect } from 'expo-router';

function statusColor(status: KbsCompareFieldRow['status']): string {
  if (status === 'match') return '#059669';
  if (status === 'partial') return '#d97706';
  if (status === 'differ') return '#dc2626';
  return '#94a3b8';
}

function statusIcon(status: KbsCompareFieldRow['status']): keyof typeof Ionicons.glyphMap {
  if (status === 'match') return 'checkmark-circle';
  if (status === 'partial') return 'alert-circle';
  if (status === 'differ') return 'close-circle';
  return 'remove-circle-outline';
}

function PassportPane({
  title,
  badge,
  row,
  width,
  onPressImage,
  canSeeImage,
}: {
  title: string;
  badge: string;
  row: KbsCapturedDocumentRow | null;
  width: number;
  onPressImage: () => void;
  canSeeImage: boolean;
}) {
  return (
    <View style={[styles.pane, { width }]}>
      <View style={styles.paneHead}>
        <Text style={styles.paneBadge}>{badge}</Text>
        <Text style={styles.paneTitle} numberOfLines={2}>
          {title}
        </Text>
      </View>
      {canSeeImage && row?.front_image_url ? (
        <Pressable onPress={onPressImage} style={styles.paneImageWrap}>
          <Image source={{ uri: row.front_image_url }} style={styles.paneImage} contentFit="contain" />
          <View style={styles.zoomChip}>
            <Ionicons name="expand-outline" size={12} color="#fff" />
          </View>
        </Pressable>
      ) : (
        <View style={styles.paneImagePlaceholder}>
          <Ionicons name="id-card-outline" size={36} color={theme.colors.textMuted} />
          <Text style={styles.panePlaceholderText}>Görsel yok</Text>
        </View>
      )}
      <Text style={styles.paneMeta} numberOfLines={1}>
        Oda {row?.room_number ?? '—'}
      </Text>
    </View>
  );
}

export default function KbsCaptureCompareScreen() {
  const { currentId, previousId: previousIdParam } = useLocalSearchParams<{
    currentId: string;
    previousId?: string;
  }>();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const { width: winW } = useWindowDimensions();
  const paneW = Math.max(140, Math.floor((winW - 40) / 2));

  const [current, setCurrent] = useState<KbsCapturedDocumentRow | null>(null);
  const [previous, setPrevious] = useState<KbsCapturedDocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);
  const [summary, setSummary] = useState<KbsIdentityMatchSummary | null>(null);
  const [rows, setRows] = useState<KbsCompareFieldRow[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [zoomVisible, setZoomVisible] = useState(false);

  const canSeeImage =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const load = useCallback(async () => {
    if (!currentId) return;
    setLoading(true);
    setError(null);
    try {
      const cache = getKbsCaptureHistoryCache() ?? [];
      let cur = cache.find((r) => r.id === currentId) ?? null;
      if (!cur) cur = await fetchKbsCapturedDocumentById(currentId);
      cur = cur ? filterKbsCapturesForViewer([cur], staff, staff?.auth_id)[0] ?? null : null;
      if (!cur) {
        setError('Güncel kayıt bulunamadı');
        setCurrent(null);
        setPrevious(null);
        return;
      }
      setCurrent(cur);

      const { previousId: fromMeta, meta } = resolveComparePreviousId(cur);
      const prevId = (previousIdParam || fromMeta || '').trim() || null;

      let prev: KbsCapturedDocumentRow | null = null;
      if (prevId) {
        prev = cache.find((r) => r.id === prevId) ?? null;
        if (!prev) {
          try {
            prev = await fetchKbsCapturedDocumentById(prevId);
          } catch {
            prev = null;
          }
        }
        if (prev) {
          prev = filterKbsCapturesForViewer([prev], staff, staff?.auth_id)[0] ?? prev;
        }
      }

      setPrevious(prev);
      const compareRows = buildKbsIdentityCompareRows(cur, prev, meta);
      setRows(compareRows);
      setSummary(summarizeKbsIdentityMatch(compareRows, cur, prev, meta));
      setMatched(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Karşılaştırma yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [currentId, previousIdParam, staff]);

  useEffect(() => {
    void load();
  }, [load]);

  const galleryItems = useMemo(() => {
    const list = [previous, current].filter(Boolean) as KbsCapturedDocumentRow[];
    return buildKbsCaptureGalleryItems(list, canSeeImage);
  }, [previous, current, canSeeImage]);

  const openZoom = useCallback(
    (id: string) => {
      const idx = galleryItems.findIndex((g) => g.id === id);
      setGalleryIndex(idx >= 0 ? idx : 0);
      setZoomVisible(true);
    },
    [galleryItems]
  );

  const runMatch = useCallback(() => {
    if (!current) return;
    const { meta } = resolveComparePreviousId(current);
    const compareRows = buildKbsIdentityCompareRows(current, previous, meta);
    const next = summarizeKbsIdentityMatch(compareRows, current, previous, meta);
    setRows(compareRows);
    setSummary(next);
    setMatched(true);
  }, [current, previous]);

  if (!canStaffViewKbsCaptureHistory(staff)) {
    return <Redirect href="/staff" />;
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.primary} size="large" />
        <Text style={styles.centerText}>Pasaportlar yükleniyor…</Text>
      </View>
    );
  }

  if (error || !current) {
    return (
      <View style={styles.center}>
        <Ionicons name="alert-circle-outline" size={40} color="#94a3b8" />
        <Text style={styles.centerText}>{error ?? 'Kayıt yok'}</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Geri</Text>
        </Pressable>
      </View>
    );
  }

  const { meta } = resolveComparePreviousId(current);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroPair}>
          <PassportPane
            title={
              previous
                ? compareDisplayTitle(previous)
                : meta?.previousGuestName?.trim() || 'Önceki kayıt'
            }
            badge="Önceki"
            row={previous}
            width={paneW}
            canSeeImage={canSeeImage}
            onPressImage={() => {
              if (!previous?.front_image_url) return;
              openZoom(previous.id);
            }}
          />
          <PassportPane
            title={compareDisplayTitle(current)}
            badge="Güncel"
            row={current}
            width={paneW}
            canSeeImage={canSeeImage}
            onPressImage={() => {
              if (!current.front_image_url) return;
              openZoom(current.id);
            }}
          />
        </View>

        {summary && matched ? (
          <View
            style={[
              styles.verdictCard,
              summary.verdict === 'same_person' || summary.verdict === 'likely'
                ? styles.verdictOk
                : summary.verdict === 'different'
                  ? styles.verdictBad
                  : styles.verdictWarn,
            ]}
          >
            <Ionicons
              name={
                summary.verdict === 'same_person' || summary.verdict === 'likely'
                  ? 'checkmark-circle'
                  : summary.verdict === 'different'
                    ? 'close-circle'
                    : 'help-circle'
              }
              size={22}
              color={
                summary.verdict === 'same_person' || summary.verdict === 'likely'
                  ? '#059669'
                  : summary.verdict === 'different'
                    ? '#dc2626'
                    : '#d97706'
              }
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.verdictTitle}>{summary.verdictLabel}</Text>
              <Text style={styles.verdictSub}>
                Eşleşen {summary.matched} · Farklı {summary.differed} · Eksik {summary.missing} · %
                {summary.scorePct}
              </Text>
              {summary.daysBetween != null ? (
                <Text style={styles.verdictSub}>
                  Ziyaretler arası:{' '}
                  {summary.daysBetween > 0
                    ? `${summary.daysBetween} gün`
                    : `${summary.hoursBetween ?? 0} saat`}
                </Text>
              ) : null}
              {summary.previousAtLabel ? (
                <Text style={styles.verdictSub}>Önceki: {summary.previousAtLabel}</Text>
              ) : null}
              {summary.currentAtLabel ? (
                <Text style={styles.verdictSub}>Güncel: {summary.currentAtLabel}</Text>
              ) : null}
              {summary.sameDocumentRecord ? (
                <Text style={styles.verdictHint}>Aynı belge kaydı güncellenmiş.</Text>
              ) : null}
            </View>
          </View>
        ) : (
          <View style={styles.hintCard}>
            <Ionicons name="git-compare-outline" size={20} color="#0f766e" />
            <Text style={styles.hintText}>
              İki pasaport / kimliği yan yana görün. Alan eşleşmesi için aşağıdaki butona basın.
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Alan karşılaştırması</Text>
        {rows.map((r) => (
          <View key={r.key} style={styles.fieldRow}>
            <View style={styles.fieldLabelRow}>
              <Ionicons name={statusIcon(r.status)} size={16} color={statusColor(r.status)} />
              <Text style={styles.fieldLabel}>{r.label}</Text>
            </View>
            <View style={styles.fieldCols}>
              <View style={styles.fieldCol}>
                <Text style={styles.fieldColHead}>Önceki</Text>
                <Text style={styles.fieldVal}>{r.previous}</Text>
              </View>
              <View style={styles.fieldCol}>
                <Text style={styles.fieldColHead}>Güncel</Text>
                <Text style={styles.fieldVal}>{r.current}</Text>
              </View>
            </View>
          </View>
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.matchBtn, matched && styles.matchBtnDone]}
          onPress={runMatch}
          accessibilityRole="button"
          accessibilityLabel="Kimlik eşleştir"
        >
          <Ionicons name={matched ? 'refresh' : 'git-compare'} size={20} color="#fff" />
          <Text style={styles.matchBtnText}>
            {matched ? 'Yeniden eşleştir' : 'Kimlik eşleştir'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.openCurrentBtn}
          onPress={() => router.push(`/staff/kbs/capture/${current.id}` as Href)}
        >
          <Text style={styles.openCurrentText}>Güncel kayda dön</Text>
        </Pressable>
      </View>

      {zoomVisible ? (
        <KbsZoomImageModal
          items={galleryItems}
          initialIndex={galleryIndex}
          visible={zoomVisible}
          onClose={() => setZoomVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 14, paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  centerText: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center' },
  heroPair: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  pane: {
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    paddingBottom: 10,
  },
  paneHead: { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, gap: 4 },
  paneBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  paneTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.text },
  paneImageWrap: {
    height: 150,
    marginHorizontal: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  paneImage: { width: '100%', height: '100%' },
  zoomChip: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paneImagePlaceholder: {
    height: 150,
    marginHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  panePlaceholderText: { fontSize: 12, color: theme.colors.textMuted },
  paneMeta: {
    marginTop: 8,
    paddingHorizontal: 10,
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  hintCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#f0fdfa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 12,
    marginBottom: 14,
  },
  hintText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0f766e', lineHeight: 18 },
  verdictCard: {
    flexDirection: 'row',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 14,
  },
  verdictOk: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  verdictWarn: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  verdictBad: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  verdictTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  verdictSub: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary, marginTop: 2 },
  verdictHint: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  fieldRow: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    marginBottom: 8,
  },
  fieldLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: theme.colors.text },
  fieldCols: { flexDirection: 'row', gap: 10 },
  fieldCol: { flex: 1, minWidth: 0 },
  fieldColHead: { fontSize: 10, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 2 },
  fieldVal: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 8,
  },
  matchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
  },
  matchBtnDone: { backgroundColor: '#115e59' },
  matchBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  openCurrentBtn: { alignItems: 'center', paddingVertical: 8 },
  openCurrentText: { fontSize: 13, fontWeight: '700', color: theme.colors.primary },
  secondaryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  secondaryBtnText: { fontWeight: '700', color: theme.colors.text },
});
