import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import {
  capturedAtTs,
  deleteKbsCapturedDocument,
  displayCapturedName,
  fetchKbsCapturedDocuments,
  staffCanDeleteKbsCaptures,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { getKbsCaptureHistoryCache, setKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import { listMissingIdFields } from '@/lib/kbsCaptureParsedFields';
import { formatKbsTrDate } from '@/lib/kbsDisplayFormat';
import { applyKbsCaptureOcrResult } from '@/lib/kbsCaptureHistory';
import { kbsOcrEngineLabel, kbsOcrEngineShort } from '@/lib/kbsOcrEngineLabel';
import { buildKbsCaptureReportHtml } from '@/lib/kbsCaptureReportHtml';
import { kbsOcrStatusLabel } from '@/lib/kbsCaptureParsedFields';
import { buildKbsCaptureListItems } from '@/lib/kbsCaptureListGroups';
import { enqueueKbsCaptureOcrBatch, kbsCaptureOcrQueueSize } from '@/lib/kbsCaptureOcrQueue';
import {
  filterKbsMrzOcrPending,
  isKbsCaptureRowNew,
  pickKbsMrzOcrTargets,
} from '@/lib/kbsCaptureHistoryMrzTargets';
import {
  consumeKbsCapturesJustSaved,
  getKbsCaptureHistoryLastSeenAt,
  setKbsCaptureHistoryLastSeenAt,
} from '@/lib/kbsCaptureHistorySeen';
import type { ParsedDocument } from '@/lib/scanner/types';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

const CAPTURE_ID_ROUTE = '/staff/kbs/capture-id' as Href;

function detailRoute(id: string): Href {
  return `/staff/kbs/capture/${id}` as Href;
}

type FilterKey = 'day' | 'week' | 'month' | 'all';

function inRange(ts: string, key: FilterKey) {
  if (key === 'all') return true;
  const now = Date.now();
  const d = now - new Date(ts).getTime();
  if (key === 'day') return d <= 24 * 60 * 60 * 1000;
  if (key === 'week') return d <= 7 * 24 * 60 * 60 * 1000;
  return d <= 31 * 24 * 60 * 60 * 1000;
}

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = row.parsed_payload;
  if (!p || typeof p !== 'object') return null;
  return p as ParsedDocument;
}

type CaptureCardProps = {
  item: KbsCapturedDocumentRow;
  canSeeImages: boolean;
  canDelete: boolean;
  selectMode: boolean;
  checked: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  onThumbPress?: (uri: string) => void;
  inGroup?: boolean;
  groupPosition?: 'first' | 'middle' | 'last' | 'only';
  isNew?: boolean;
};

function CaptureCard({
  item,
  canSeeImages,
  canDelete,
  selectMode,
  checked,
  onPress,
  onLongPress,
  onDelete,
  onThumbPress,
  inGroup,
  groupPosition = 'only',
  isNew = false,
}: CaptureCardProps) {
  const { t } = useTranslation();
  const parsed = asParsed(item);
  const missing = parsed ? listMissingIdFields(parsed) : [];
  const ocrStatus = kbsOcrStatusLabel(parsed);
  const engineShort = kbsOcrEngineShort(item.ocr_engine);
  const statusLabel =
    ocrStatus === 'ready'
      ? engineShort ? `${t('kbsStatusReady')} · ${engineShort}` : t('kbsStatusReady')
      : ocrStatus === 'processing'
        ? t('kbsStatusReading')
        : ocrStatus === 'pending'
          ? t('kbsStatusQueued')
          : t('kbsStatusIncomplete');

  const isFirst = groupPosition === 'first' || groupPosition === 'only';
  const isLast = groupPosition === 'last' || groupPosition === 'only';

  return (
    <Pressable
      style={[
        styles.card,
        inGroup && styles.cardInGroup,
        inGroup && isFirst && styles.cardInGroupFirst,
        inGroup && isLast && styles.cardInGroupLast,
        !inGroup && checked && styles.cardSelected,
        inGroup && checked && styles.cardInGroupSelected,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {selectMode ? (
        <View style={[styles.check, checked && styles.checkOn]}>
          {checked ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
        </View>
      ) : null}
      {canSeeImages && item.front_image_url ? (
        <Pressable
          onPress={() => onThumbPress?.(item.front_image_url!)}
          accessibilityLabel={t('kbsEnlargeIdA11y')}
        >
          <Image source={{ uri: item.front_image_url }} style={styles.thumb} contentFit="cover" />
        </Pressable>
      ) : (
        <View style={styles.thumbMask}>
          <Ionicons name="id-card-outline" size={28} color="#94a3b8" />
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayCapturedName(item)}
          </Text>
          {isNew ? (
            <View style={styles.newBadge}>
              <Text style={styles.newBadgeText}>Yeni</Text>
            </View>
          ) : null}
          <View
            style={[
              styles.statusChip,
              ocrStatus === 'ready' && styles.statusChipOk,
              ocrStatus === 'processing' && styles.statusChipBusy,
            ]}
          >
            <Text style={styles.statusChipText}>{statusLabel}</Text>
          </View>
        </View>
        {!inGroup ? <Text style={styles.meta}>Oda {item.room_number ?? '—'}</Text> : null}
        <Text style={styles.meta}>{new Date(capturedAtTs(item)).toLocaleString('tr-TR')}</Text>
        {ocrStatus === 'ready' && parsed?.birthDate ? (
          <Text style={styles.parsedLine}>D.T: {formatKbsTrDate(parsed.birthDate) ?? parsed.birthDate}</Text>
        ) : null}
        {missing.length > 0 ? (
          <Text style={styles.missingLine} numberOfLines={1}>
            Eksik: {missing.join(', ')}
          </Text>
        ) : ocrStatus === 'ready' ? (
          <Text style={styles.okLine}>Dokunun — alanları kopyalayın</Text>
        ) : (
          <Text style={styles.parsedHint}>
            {ocrStatus === 'processing' || ocrStatus === 'pending'
              ? 'Belge okunuyor…'
              : kbsOcrEngineLabel(item.ocr_engine)}
          </Text>
        )}
      </View>
      {!selectMode ? (
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      ) : null}
      {canDelete && !selectMode ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color="#dc2626" />
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}

export default function KbsCaptureHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [filter, setFilter] = useState<FilterKey>('day');
  const [rows, setRows] = useState<KbsCapturedDocumentRow[]>(() => getKbsCaptureHistoryCache() ?? []);
  const [loading, setLoading] = useState(() => !getKbsCaptureHistoryCache()?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setQueueTick] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [justSavedIds] = useState(() => consumeKbsCapturesJustSaved());
  const resumedOcrRef = useRef(false);

  const canDelete = staffCanDeleteKbsCaptures(staff);
  const canSeeImages =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const reload = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchKbsCapturedDocuments();
      setRows(data);
      setKbsCaptureHistoryCache(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('kbsListLoadFailed'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void reload();
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void getKbsCaptureHistoryLastSeenAt().then(setLastSeenAt);
  }, []);

  useEffect(() => {
    return () => {
      void setKbsCaptureHistoryLastSeenAt(new Date().toISOString());
    };
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setQueueTick((n) => n + 1), 700);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('kbs-captured-documents-live')
      .on('postgres_changes', { event: '*', schema: 'ops', table: 'guest_documents' }, () => {
        void reload();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [reload]);

  const combined = useMemo(
    () =>
      rows
        .filter((r) => inRange(capturedAtTs(r), filter))
        .sort((a, b) => new Date(capturedAtTs(b)).getTime() - new Date(capturedAtTs(a)).getTime()),
    [rows, filter]
  );

  const listItems = useMemo(() => buildKbsCaptureListItems(combined), [combined]);

  const isRowNew = useCallback(
    (row: KbsCapturedDocumentRow) => isKbsCaptureRowNew(row, justSavedIds, lastSeenAt),
    [justSavedIds, lastSeenAt]
  );

  const mrzTargetRows = useMemo(
    () =>
      pickKbsMrzOcrTargets({
        combined: selectMode ? combined : rows,
        selectMode,
        selectedIds: selected,
        justSavedIds,
        lastSeenAt,
      }),
    [combined, rows, selectMode, selected, justSavedIds, lastSeenAt]
  );

  const newCount = useMemo(() => rows.filter(isRowNew).length, [rows, isRowNew]);

  useEffect(() => {
    if (loading || resumedOcrRef.current || rows.length === 0) return;
    resumedOcrRef.current = true;
    const pending = filterKbsMrzOcrPending(
      pickKbsMrzOcrTargets({
        combined: rows,
        selectMode: false,
        selectedIds: new Set(),
        justSavedIds,
        lastSeenAt,
      })
    );
    if (pending.length > 0) {
      enqueueKbsCaptureOcrBatch(
        pending.map((r) => ({
          docId: r.id,
          guestId: r.guest_id,
          imageUrl: r.front_image_url!,
        }))
      );
    }
  }, [loading, rows, justSavedIds, lastSeenAt]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const retryOcr = (picked: KbsCapturedDocumentRow[]) => {
    const targets = picked.filter((r) => r.front_image_url);
    if (!targets.length) {
      Alert.alert(t('kbsNoRecord'), t('kbsNoReadableId'));
      return;
    }
    enqueueKbsCaptureOcrBatch(
      targets.map((r) => ({
        docId: r.id,
        guestId: r.guest_id,
        imageUrl: r.front_image_url!,
      }))
    );
    Alert.alert(t('kbsReadStarted'), t('kbsMrzBatchStarted', { count: targets.length }));
  };

  const retryOcrFiltered = () => {
    if (!mrzTargetRows.length) {
      Alert.alert(
        t('kbsNoRecord'),
        selectMode ? t('kbsNoSelectedRecord') : t('kbsNoRecordFilterHint')
      );
      return;
    }
    retryOcr(mrzTargetRows);
  };

  const selectAllVisible = () => {
    setSelectMode(true);
    setSelected(new Set(combined.map((r) => r.id)));
  };

  const retryAiOcrFiltered = async () => {
    const picked = (selectMode ? combined.filter((r) => selected.has(r.id)) : combined).filter(
      (r) => r.front_image_url
    );
    if (!picked.length) {
      Alert.alert(t('kbsNoRecord'), t('kbsNoReadableId'));
      return;
    }
    let ok = 0;
    for (const row of picked) {
      try {
        const local = `${FileSystem.cacheDirectory ?? ''}kbs-ai-${row.id}.jpg`;
        const dl = await FileSystem.downloadAsync(row.front_image_url!, local);
        const { parseIdCardImageUriWithFallback } = await import('@/lib/kbsCaptureOcr');
        const ocr = await parseIdCardImageUriWithFallback(dl.uri);
        const res = await applyKbsCaptureOcrResult(
          row.id,
          row.guest_id,
          ocr.parsed,
          ocr.parsed.confidence,
          ocr.engine
        );
        if (res.ok) ok += 1;
      } catch {
        /* sonraki kayıt */
      }
    }
    void reload();
    Alert.alert('AI yedek okuma', `${ok} / ${picked.length} kayıt güncellendi.`);
  };

  const confirmDelete = (row: KbsCapturedDocumentRow) => {
    Alert.alert(t('kbsDeleteIdTitle'), t('kbsDeleteIdBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteKbsCapturedDocument(row.id, row.guest_id);
            if (!res.ok) {
              Alert.alert('Silinemedi', res.message);
              return;
            }
            setRows((prev) => {
              const next = prev.filter((r) => r.id !== row.id);
              setKbsCaptureHistoryCache(next);
              return next;
            });
          })();
        },
      },
    ]);
  };

  const onSharePrint = async () => {
    if (!combined.length) return Alert.alert(t('kbsListEmpty'), t('kbsNothingToShare'));
    const html = buildKbsCaptureReportHtml('KBS Kimlik Raporu', combined, canSeeImages);
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'KBS kimlik raporu' });
    } else {
      await Print.printAsync({ uri });
    }
  };

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Liste yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.captureLink}
        onPress={() => router.push(CAPTURE_ID_ROUTE as never)}
        activeOpacity={0.85}
      >
        <Ionicons name="camera-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.captureLinkText}>Yeni kimlik çek</Text>
        <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
      </TouchableOpacity>

      {newCount > 0 ? (
        <View style={styles.newBanner}>
          <Ionicons name="sparkles" size={16} color="#0d9488" />
          <Text style={styles.newBannerText}>
            {newCount} yeni kimlik — okuma otomatik başlar veya aşağıdan tetikleyin
          </Text>
        </View>
      ) : null}

      {kbsCaptureOcrQueueSize() > 0 ? (
        <View style={styles.queueBanner}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.queueBannerText}>
            Belge okunuyor ({kbsCaptureOcrQueueSize()} sırada)…
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.retryOcrBtn}
        onPress={retryOcrFiltered}
        disabled={combined.length === 0}
      >
        <Ionicons name="scan-outline" size={18} color={theme.colors.primary} />
        <Text style={styles.retryOcrText}>
          {selectMode && selected.size > 0
            ? `Seçilenleri oku (${selected.size})`
            : `Son çekilenleri oku (${mrzTargetRows.length})`}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.retryAiBtn}
        onPress={() => void retryAiOcrFiltered()}
        disabled={combined.length === 0}
      >
        <Ionicons name="sparkles-outline" size={16} color="#64748b" />
        <Text style={styles.retryAiText}>
          {selectMode && selected.size > 0
            ? t('kbsAiBackupReadSelected', { count: selected.size })
            : t('kbsAiBackupRead')}
        </Text>
      </TouchableOpacity>

      <View style={styles.toolRow}>
        <TouchableOpacity
          style={[styles.toolChip, selectMode && styles.toolChipOn]}
          onPress={() => {
            setSelectMode((v) => !v);
            setSelected(new Set());
          }}
        >
          <Ionicons name="checkbox-outline" size={16} color={selectMode ? '#fff' : theme.colors.text} />
          <Text style={[styles.toolChipText, selectMode && styles.toolChipTextOn]}>Seç</Text>
        </TouchableOpacity>
        {combined.length > 0 ? (
          <TouchableOpacity style={styles.toolChip} onPress={selectAllVisible}>
            <Ionicons name="checkmark-done-outline" size={16} color={theme.colors.text} />
            <Text style={styles.toolChipText}>Tümünü seç</Text>
          </TouchableOpacity>
        ) : null}
        {selectMode ? (
          <Text style={styles.selectHint}>
            {selected.size > 0
              ? t('kbsMrzReadSelected', { count: selected.size })
              : t('kbsSelectForMrz')}
          </Text>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {([
          ['day', t('kbsFilterDaily')],
          ['week', t('kbsFilterWeekly')],
          ['month', t('kbsFilterMonthly')],
          ['all', t('kbsFilterAll')],
        ] as const).map(([k, l]) => (
          <TouchableOpacity key={k} style={[styles.chip, filter === k && styles.chipOn]} onPress={() => setFilter(k)}>
            <Text style={[styles.chipText, filter === k && styles.chipTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.reportBtn} onPress={() => void onSharePrint()}>
          <Ionicons name="print-outline" size={14} color="#fff" />
          <Text style={styles.reportBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={listItems}
        keyExtractor={(entry) =>
          entry.kind === 'single' ? entry.row.id : `grp-${entry.batchKey}`
        }
        initialNumToRender={8}
        windowSize={6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {filter === 'day'
              ? t('kbsEmptyToday')
              : t('kbsEmptyRange')}
          </Text>
        }
        renderItem={({ item: entry }) => {
          const openRow = (row: KbsCapturedDocumentRow) => {
            if (selectMode) {
              toggleSelect(row.id);
              return;
            }
            router.push(detailRoute(row.id));
          };

          const longPressRow = (row: KbsCapturedDocumentRow) => {
            if (!selectMode) {
              setSelectMode(true);
              setSelected(new Set([row.id]));
            }
          };

          const thumbZoom = (uri: string) => setPreviewUri(uri);

          if (entry.kind === 'single') {
            const row = entry.row;
            return (
              <CaptureCard
                item={row}
                canSeeImages={canSeeImages}
                canDelete={canDelete}
                selectMode={selectMode}
                checked={selected.has(row.id)}
                isNew={isRowNew(row)}
                onPress={() => openRow(row)}
                onLongPress={() => longPressRow(row)}
                onDelete={() => confirmDelete(row)}
                onThumbPress={thumbZoom}
              />
            );
          }

          const { rows, roomNumber, capturedAt } = entry;
          const capturedLabel = new Date(capturedAt).toLocaleString('tr-TR');

          return (
            <View style={styles.groupBlock}>
              <View style={styles.groupAccent} />
              <View style={styles.groupHeader}>
                <View style={styles.groupHeaderIcon}>
                  <Ionicons name="people" size={18} color="#0d9488" />
                </View>
                <View style={styles.groupHeaderText}>
                  <Text style={styles.groupTitle}>Aynı kayıt · {rows.length} kişi</Text>
                  <Text style={styles.groupSub}>
                    Oda {roomNumber ?? '—'} · {capturedLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.groupDivider} />
              <View style={styles.groupCards}>
                {rows.map((row, index) => {
                  const pos =
                    rows.length === 1
                      ? 'only'
                      : index === 0
                        ? 'first'
                        : index === rows.length - 1
                          ? 'last'
                          : 'middle';
                  return (
                    <View key={row.id}>
                      {index > 0 ? <View style={styles.groupInnerLine} /> : null}
                      <CaptureCard
                        item={row}
                        canSeeImages={canSeeImages}
                        canDelete={canDelete}
                        selectMode={selectMode}
                        checked={selected.has(row.id)}
                        isNew={isRowNew(row)}
                        inGroup
                        groupPosition={pos}
                        onPress={() => openRow(row)}
                        onLongPress={() => longPressRow(row)}
                        onDelete={() => confirmDelete(row)}
                        onThumbPress={thumbZoom}
                      />
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }}
      />

      {!canSeeImages ? (
        <Text style={styles.permHint}>Görseller yalnızca yetkili personelde açılır.</Text>
      ) : null}

      <KbsZoomImageModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: theme.colors.textSecondary, fontWeight: '600' },
  captureLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    marginBottom: 8,
  },
  captureLinkText: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.text },
  queueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  queueBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#2563eb' },
  newBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdfa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 10,
    marginBottom: 8,
  },
  newBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#0f766e' },
  newBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#ccfbf1',
  },
  newBadgeText: { fontSize: 10, fontWeight: '800', color: '#0d9488' },
  retryOcrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: 11,
    marginBottom: 8,
  },
  retryOcrText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
  retryAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 8,
  },
  retryAiText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  statusChipOk: { backgroundColor: '#ecfdf5' },
  statusChipBusy: { backgroundColor: '#eff6ff' },
  statusChipText: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  toolChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toolChipText: { fontSize: 12, fontWeight: '700', color: theme.colors.text },
  toolChipTextOn: { color: '#fff' },
  selectHint: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  reportBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0d9488',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  reportBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  errorText: { color: theme.colors.error, marginBottom: 8, fontSize: 13 },
  groupBlock: {
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#99f6e4',
    overflow: 'hidden',
    position: 'relative',
  },
  groupAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#0d9488',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingLeft: 16,
    paddingVertical: 11,
    backgroundColor: '#f0fdfa',
  },
  groupHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupHeaderText: { flex: 1 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  groupSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#99f6e4',
    marginLeft: 16,
  },
  groupCards: { paddingLeft: 4 },
  groupInnerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 124,
    marginRight: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
    marginBottom: 8,
  },
  cardInGroup: {
    marginBottom: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 11,
    paddingRight: 12,
  },
  cardInGroupFirst: { paddingTop: 10 },
  cardInGroupLast: { paddingBottom: 12 },
  cardInGroupSelected: { backgroundColor: '#fffbeb' },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: '#fffbeb' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  thumb: {
    width: 88,
    height: 112,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
  },
  thumbMask: {
    width: 88,
    height: 112,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  parsedLine: { fontSize: 11, color: theme.colors.text, marginTop: 6, lineHeight: 15 },
  parsedHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  missingLine: { fontSize: 11, color: '#b45309', marginTop: 4, fontWeight: '700' },
  okLine: { fontSize: 11, color: '#059669', marginTop: 4, fontWeight: '700' },
  deleteBtn: { padding: 6 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40, lineHeight: 20, paddingHorizontal: 16 },
  permHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center' },
});
