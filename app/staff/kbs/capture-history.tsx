import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture, canStaffViewAllKbsCaptures, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import { KbsBrowseTabBar } from '@/components/kbs/KbsBrowseTabBar';
import { KbsHotelFilterBar } from '@/components/kbs/KbsHotelFilterBar';
import { KbsCaptureListCard } from '@/components/kbs/KbsCaptureListCard';
import {
  fetchKbsBrowseDocuments,
  listAccessibleHotels,
  resolveKbsMultiHotelContext,
  type KbsOpsHotel,
} from '@/lib/kbsMultiHotelCaptures';
import {
  capturedAtTs,
  deleteKbsCapturedDocument,
  filterKbsCapturesForViewer,
  staffCanDeleteKbsCaptures,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import {
  getKbsCaptureHistoryCache,
  loadKbsCaptureHistoryCacheFromDisk,
  setKbsCaptureHistoryCache,
} from '@/lib/kbsCaptureHistoryCache';
import { kbsCaptureCardStatus, enrichKbsParsedFromSources, isKbsCaptureOcrCoreComplete, isKbsOcrManualReview, isKbsOcrInProgress, kbsCaptureIsPartialReadable, isKbsOcrFailed } from '@/lib/kbsCaptureParsedFields';
import {
  isKbsDocInOcrQueue,
  kickUnreadCapturesOcr,
  kbsCaptureOcrQueueSize,
  subscribeKbsOcrQueue,
} from '@/lib/kbsCaptureOcrQueue';
import { buildKbsCaptureReportHtml } from '@/lib/kbsCaptureReportHtml';
import { buildKbsCaptureListItems } from '@/lib/kbsCaptureListGroups';
import {
  isKbsCaptureRowNew,
} from '@/lib/kbsCaptureHistoryMrzTargets';
import {
  buildKbsCaptureSearchSuggestions,
  filterKbsCapturesBySearchQuery,
  type KbsCaptureSearchSuggestion,
} from '@/lib/kbsCaptureHistorySearch';
import {
  countKbsDetailFilters,
  KBS_DETAIL_FILTER_OPTIONS,
  matchesKbsDetailFilter,
  type KbsDetailFilterKey,
} from '@/lib/kbsCaptureDetailFilters';
import {
  fetchKbsGuestNoteSummaries,
  type KbsGuestNoteSummary,
} from '@/lib/kbsGuestNotes';
import {
  consumeKbsCapturesJustSaved,
  getKbsCaptureHistoryLastSeenAt,
  setKbsCaptureHistoryLastSeenAt,
} from '@/lib/kbsCaptureHistorySeen';
import type { ParsedDocument } from '@/lib/scanner/types';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { buildKbsCaptureGalleryItems } from '@/lib/kbsCaptureGallery';
import { useTranslation } from 'react-i18next';
import { isAbortLikeError, toSupabaseUserMessage } from '@/lib/supabaseTransientErrors';

const CAPTURE_ID_ROUTE = '/staff/kbs/capture-id' as Href;

function detailRoute(id: string): Href {
  return `/staff/kbs/capture/${id}` as Href;
}

type FilterKey = 'day' | 'week' | 'month' | 'all';
type OcrFilterKey = 'all' | 'reading' | 'partial' | 'manual' | 'failed';

function matchesOcrFilter(
  parsed: ParsedDocument | null,
  key: OcrFilterKey,
  opts?: { ocrStatus?: string | null; activelyReading?: boolean }
): boolean {
  if (key === 'all') return true;
  const status = kbsCaptureCardStatus(parsed, opts);
  if (key === 'reading') return status?.tone === 'progress';
  if (key === 'manual') return status?.label.startsWith('Manuel') === true || isKbsOcrManualReview(parsed);
  if (key === 'partial') return status?.tone === 'warn' && !status.label.startsWith('Manuel');
  if (key === 'failed') {
    return (
      status?.tone === 'muted' ||
      isKbsOcrFailed(parsed) ||
      (!status &&
        !isKbsOcrInProgress(parsed) &&
        !isKbsCaptureOcrCoreComplete(parsed) &&
        !kbsCaptureIsPartialReadable(parsed) &&
        !isKbsOcrManualReview(parsed))
    );
  }
  return true;
}

function inRange(ts: string, key: FilterKey) {
  if (key === 'all') return true;
  const now = Date.now();
  const d = now - new Date(ts).getTime();
  if (key === 'day') return d <= 24 * 60 * 60 * 1000;
  if (key === 'week') return d <= 7 * 24 * 60 * 60 * 1000;
  return d <= 31 * 24 * 60 * 60 * 1000;
}

/** Bugün 14:32 · Dün 09:15 · 12 Tem 14:32 — listede kısa, taranabilir zaman. */
function formatCapturedAt(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Bugün ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Dün ${time}`;
  const date =
    d.getFullYear() === now.getFullYear()
      ? d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
      : d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${date} ${time}`;
}

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = row.parsed_payload;
  if (!p || typeof p !== 'object') return null;
  return enrichKbsParsedFromSources(p) as ParsedDocument;
}

export default function KbsCaptureHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);
  const viewAllCaptures = canStaffViewAllKbsCaptures(staff);
  const [filter, setFilter] = useState<FilterKey>(viewAllCaptures ? 'all' : 'day');
  const [ocrFilter, setOcrFilter] = useState<OcrFilterKey>('all');
  const [rows, setRows] = useState<KbsCapturedDocumentRow[]>(() => getKbsCaptureHistoryCache() ?? []);
  const [loading, setLoading] = useState(() => !getKbsCaptureHistoryCache()?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [justSavedIds] = useState(() => consumeKbsCapturesJustSaved());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [hotels, setHotels] = useState<KbsOpsHotel[]>([]);
  const [canViewAllHotels, setCanViewAllHotels] = useState(false);
  const [hotelFilter, setHotelFilter] = useState('all');
  const [detailFilter, setDetailFilter] = useState<KbsDetailFilterKey>('all');
  const [noteSummaries, setNoteSummaries] = useState<Map<string, KbsGuestNoteSummary>>(
    () => new Map()
  );
  const reloadSeqRef = useRef(0);
  const lastFocusReloadAtRef = useRef(0);
  const rowsLenRef = useRef(0);
  const softReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ocrEpoch, setOcrEpoch] = useState(0);
  rowsLenRef.current = rows.length;

  const canDelete = staffCanDeleteKbsCaptures(staff);
  const canSeeImages =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const reload = useCallback(async (opts?: { showRefresh?: boolean }) => {
    const authId = user?.id ?? staff?.auth_id;
    if (!authId) return;
    const seq = ++reloadSeqRef.current;
    if (opts?.showRefresh) setRefreshing(true);
    try {
      setError(null);
      const ctx = await resolveKbsMultiHotelContext(authId);
      if (!ctx.ok) throw new Error(ctx.message);
      if (seq !== reloadSeqRef.current) return;

      const hotelList = await listAccessibleHotels();
      setHotels(hotelList);
      setCanViewAllHotels(ctx.canViewAllHotels);

      const fetchHotelId =
        hotelFilter === 'all' ? (ctx.canViewAllHotels ? null : ctx.hotelId) : hotelFilter;

      const data = await fetchKbsBrowseDocuments(authId, {
        hotelId: fetchHotelId,
        limit: ctx.canViewAllHotels && hotelFilter === 'all' ? 400 : 300,
      });
      if (seq !== reloadSeqRef.current) return;
      const scoped = filterKbsCapturesForViewer(data, staff, staff?.auth_id);
      setRows(scoped);
      setKbsCaptureHistoryCache(scoped);

      // Okunmamış / eksik: hızlı OCR kick (eksikte deep’e yükselir)
      const kicked = kickUnreadCapturesOcr(scoped, 16);
      if (kicked > 0) setOcrEpoch((n) => n + 1);
    } catch (e) {
      if (seq !== reloadSeqRef.current) return;
      if (isAbortLikeError(e) && (getKbsCaptureHistoryCache()?.length ?? rowsLenRef.current) > 0) {
        return;
      }
      setError(toSupabaseUserMessage(e, t('kbsListLoadFailed')));
    } finally {
      if (seq !== reloadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [hotelFilter, staff, user?.id, t]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  const refresh = useCallback(() => {
    void reload({ showRefresh: true });
  }, [reload]);

  useEffect(() => {
    return subscribeKbsOcrQueue(() => {
      setOcrEpoch((n) => n + 1);
      if (softReloadTimerRef.current) clearTimeout(softReloadTimerRef.current);
      softReloadTimerRef.current = setTimeout(() => {
        if (kbsCaptureOcrQueueSize() > 0) return;
        void reloadRef.current({ showRefresh: false });
      }, 600);
    });
  }, []);

  useEffect(() => {
    if (getKbsCaptureHistoryCache()?.length) return;
    let active = true;
    void loadKbsCaptureHistoryCacheFromDisk().then((cached) => {
      if (!active || !cached?.length) return;
      const scoped = filterKbsCapturesForViewer(cached, staff, staff?.auth_id);
      setRows((prev) => (prev.length ? prev : scoped));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [staff]);

  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (now - lastFocusReloadAtRef.current < 2500) return;
      lastFocusReloadAtRef.current = now;
      void reloadRef.current({ showRefresh: false });
      return () => {
        const staffId = useAuthStore.getState().staff?.id;
        if (staffId) void setKbsCaptureHistoryLastSeenAt(staffId, new Date().toISOString());
        reloadSeqRef.current += 1;
      };
    }, [])
  );

  useEffect(() => {
    if (!user?.id && !staff?.auth_id) return;
    setLoading((prev) => (rowsLenRef.current === 0 ? true : prev));
    void reloadRef.current({ showRefresh: false });
  }, [hotelFilter, user?.id, staff?.auth_id]);

  const combined = useMemo(
    () =>
      rows
        .filter((r) => inRange(capturedAtTs(r), filter))
        .filter((r) =>
          matchesOcrFilter(asParsed(r), ocrFilter, {
            ocrStatus: r.ocr_status,
            activelyReading: isKbsDocInOcrQueue(r.id),
          })
        )
        .filter((r) => matchesKbsDetailFilter(r, detailFilter, noteSummaries.get(r.guest_id)))
        .sort((a, b) => new Date(capturedAtTs(b)).getTime() - new Date(capturedAtTs(a)).getTime()),
    [rows, filter, ocrFilter, ocrEpoch, detailFilter, noteSummaries]
  );

  const dateScopedRows = useMemo(
    () => rows.filter((r) => inRange(capturedAtTs(r), filter)),
    [rows, filter]
  );

  const detailCounts = useMemo(
    () => countKbsDetailFilters(dateScopedRows, noteSummaries),
    [dateScopedRows, noteSummaries]
  );

  useEffect(() => {
    const guestIds = [...new Set(rows.map((r) => r.guest_id).filter(Boolean))];
    if (guestIds.length === 0) {
      setNoteSummaries(new Map());
      return;
    }
    let cancelled = false;
    const hotelIds = [
      ...new Set(rows.map((r) => r.hotel_id).filter((id): id is string => !!id)),
    ];
    void fetchKbsGuestNoteSummaries({
      guestIds,
      hotelIds: hotelIds.length ? hotelIds : null,
    })
      .then((map) => {
        if (!cancelled) setNoteSummaries(map);
      })
      .catch(() => {
        if (!cancelled) setNoteSummaries(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const ocrCounts = useMemo(() => {
    const base = dateScopedRows;
    let reading = 0;
    let partial = 0;
    let manual = 0;
    let failed = 0;
    for (const r of base) {
      const p = asParsed(r);
      const opts = { ocrStatus: r.ocr_status, activelyReading: isKbsDocInOcrQueue(r.id) };
      if (matchesOcrFilter(p, 'reading', opts)) reading += 1;
      else if (matchesOcrFilter(p, 'manual', opts)) manual += 1;
      else if (matchesOcrFilter(p, 'partial', opts)) partial += 1;
      else if (matchesOcrFilter(p, 'failed', opts)) failed += 1;
    }
    return { reading, partial, manual, failed };
  }, [dateScopedRows, ocrEpoch]);

  // Okunmayan/eksik: kickUnreadCapturesOcr (bir kez derin tarama, limitli).

  useEffect(() => {
    if (!staff?.id) return;
    void getKbsCaptureHistoryLastSeenAt(staff.id).then(setLastSeenAt);
  }, [staff?.id]);

  useEffect(() => {
    if (!staff?.id) return;
    return () => {
      void setKbsCaptureHistoryLastSeenAt(staff.id, new Date().toISOString());
    };
  }, [staff?.id]);

  const searched = useMemo(
    () => filterKbsCapturesBySearchQuery(combined, searchQuery, noteSummaries),
    [combined, searchQuery, noteSummaries]
  );

  const searchSuggestions = useMemo(
    () =>
      searchFocused && searchQuery.trim().length >= 1
        ? buildKbsCaptureSearchSuggestions(combined, searchQuery, 8, noteSummaries)
        : [],
    [combined, searchQuery, searchFocused, noteSummaries]
  );

  const listItems = useMemo(() => buildKbsCaptureListItems(searched), [searched]);

  const galleryItems = useMemo(
    () => buildKbsCaptureGalleryItems(combined, canSeeImages),
    [combined, canSeeImages]
  );

  const openGallery = useCallback(
    (rowId: string) => {
      const idx = galleryItems.findIndex((item) => item.id === rowId);
      if (idx >= 0) setGalleryIndex(idx);
    },
    [galleryItems]
  );

  const isRowNew = useCallback(
    (row: KbsCapturedDocumentRow) => isKbsCaptureRowNew(row, justSavedIds, lastSeenAt),
    [justSavedIds, lastSeenAt]
  );

  const newCount = useMemo(() => combined.filter(isRowNew).length, [combined, isRowNew]);

  const liveStats = useMemo(() => {
    const today = rows.filter((r) => inRange(capturedAtTs(r), 'day')).length;
    const attention = ocrCounts.partial + ocrCounts.manual + ocrCounts.failed;
    return { today, attention, total: combined.length };
  }, [rows, combined.length, ocrCounts.partial, ocrCounts.manual, ocrCounts.failed]);

  const onSearchSuggestionPress = useCallback(
    (suggestion: KbsCaptureSearchSuggestion) => {
      if (suggestion.kind === 'room') {
        setSearchQuery(suggestion.label.replace(/^Oda\s*/i, '').trim());
        setSearchFocused(false);
        return;
      }
      if (suggestion.kind === 'staff') {
        setSearchQuery(suggestion.label);
        setSearchFocused(false);
        return;
      }
      setSearchQuery(suggestion.label);
      setSearchFocused(false);
      router.push(detailRoute(suggestion.rowId));
    },
    [router]
  );

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
            setSelectedIds((prev) => {
              if (!prev.has(row.id)) return prev;
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          })();
        },
      },
    ]);
  };

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleGroupSelect = useCallback((groupRows: KbsCapturedDocumentRow[]) => {
    setSelectedIds((prev) => {
      const ids = groupRows.map((r) => r.id);
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of ids) next.delete(id);
      } else {
        for (const id of ids) next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    const ids = new Set<string>();
    for (const entry of listItems) {
      if (entry.kind === 'single') ids.add(entry.row.id);
      else for (const row of entry.rows) ids.add(row.id);
    }
    setSelectedIds(ids);
  }, [listItems]);

  const deleteRows = useCallback(
    async (targetRows: KbsCapturedDocumentRow[]) => {
      if (!targetRows.length || bulkDeleting) return;
      setBulkDeleting(true);
      let failed = 0;
      const deletedIds = new Set<string>();
      for (const row of targetRows) {
        const res = await deleteKbsCapturedDocument(row.id, row.guest_id);
        if (!res.ok) failed += 1;
        else deletedIds.add(row.id);
      }
      if (deletedIds.size > 0) {
        setRows((prev) => {
          const next = prev.filter((r) => !deletedIds.has(r.id));
          setKbsCaptureHistoryCache(next);
          return next;
        });
      }
      setBulkDeleting(false);
      exitSelectionMode();
      if (failed > 0) Alert.alert(t('error'), t('kbsBulkDeleteFailed', { count: failed }));
    },
    [bulkDeleting, exitSelectionMode, t]
  );

  const confirmDeleteGroup = useCallback(
    (groupRows: KbsCapturedDocumentRow[]) => {
      Alert.alert(t('kbsDeleteGroupTitle'), t('kbsDeleteGroupBody', { count: groupRows.length }), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => void deleteRows(groupRows),
        },
      ]);
    },
    [deleteRows, t]
  );

  const confirmBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const targetRows = rows.filter((r) => selectedIds.has(r.id));
    Alert.alert(t('kbsBulkDeleteTitle'), t('kbsBulkDeleteBody', { count: targetRows.length }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => void deleteRows(targetRows),
      },
    ]);
  }, [deleteRows, rows, selectedIds, t]);

  const enterSelectionWith = useCallback((id: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const onSharePrint = async () => {
    if (!combined.length) return Alert.alert(t('kbsListEmpty'), t('kbsNothingToShare'));
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const html = await buildKbsCaptureReportHtml('KBS Kimlik Raporu', combined, canSeeImages);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'KBS kimlik raporu' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e) {
      Alert.alert('PDF', e instanceof Error ? e.message : 'PDF oluşturulamadı');
    } finally {
      setPdfBusy(false);
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

  const listHeader = (
    <View style={styles.listHeader}>
      <KbsBrowseTabBar active="captures" />

      <KbsHotelFilterBar
        hotels={hotels}
        canViewAll={canViewAllHotels}
        value={hotelFilter}
        onChange={setHotelFilter}
      />

      <View style={styles.toolbar}>
        {selectionMode && canDelete ? (
          <View style={styles.selectionBar}>
            <TouchableOpacity style={styles.selectionCloseBtn} onPress={exitSelectionMode} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </TouchableOpacity>
            <Text style={styles.selectionTitle} numberOfLines={1}>
              {selectedIds.size > 0 ? `${selectedIds.size} seçildi` : t('kbsSelectForMrz')}
            </Text>
            <TouchableOpacity style={styles.toolChip} onPress={selectAllVisible}>
              <Text style={styles.toolChipText}>{t('kbsSelectAll')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.captureBtn}
              onPress={() => router.push(CAPTURE_ID_ROUTE as never)}
              activeOpacity={0.88}
            >
              <Ionicons name="camera" size={16} color="#fff" />
              <Text style={styles.captureBtnText} numberOfLines={1}>
                Yeni çek
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.iconBtn, pdfBusy && styles.iconBtnBusy]}
              onPress={() => void onSharePrint()}
              disabled={pdfBusy}
              accessibilityLabel="PDF raporu paylaş"
            >
              {pdfBusy ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Ionicons name="share-outline" size={17} color={theme.colors.text} />
              )}
            </TouchableOpacity>
            {canDelete ? (
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setSelectionMode(true)}
                accessibilityLabel={t('kbsBulkDeleteMode')}
              >
                <Ionicons name="checkbox-outline" size={17} color={theme.colors.text} />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.liveInline}>
          <Text style={styles.liveInlineText}>
            Bugün <Text style={styles.liveInlineStrong}>{liveStats.today}</Text>
          </Text>
          {ocrCounts.reading > 0 ? (
            <Text style={[styles.liveInlineText, styles.liveInlineBusy]}>
              · Okunuyor {ocrCounts.reading}
            </Text>
          ) : null}
          {liveStats.attention > 0 ? (
            <Text style={[styles.liveInlineText, styles.liveInlineWarn]}>
              · Dikkat {liveStats.attention}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ad, pasaport no, telefon, oda, not…"
          placeholderTextColor={theme.colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => {
            setTimeout(() => setSearchFocused(false), 180);
          }}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 ? (
          <TouchableOpacity
            onPress={() => {
              setSearchQuery('');
              setSearchFocused(false);
            }}
            hitSlop={8}
          >
            <Ionicons name="close-circle" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
        nestedScrollEnabled
      >
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
        <View style={styles.chipGap} />
        {(
          [
            ['all', 'Tümü', null, 0],
            ['reading', 'Okunuyor', '#2563eb', ocrCounts.reading],
            ['partial', 'Eksik', '#ea580c', ocrCounts.partial],
            ['manual', 'Manuel', '#b45309', ocrCounts.manual],
            ['failed', 'Okunamadı', '#64748b', ocrCounts.failed],
          ] as const
        ).map(([k, l, dot, count]) => (
          <TouchableOpacity
            key={`ocr-${k}`}
            style={[styles.chip, ocrFilter === k && styles.chipOn]}
            onPress={() => setOcrFilter(k)}
          >
            <View style={styles.chipInner}>
              {dot ? (
                <View style={[styles.chipDot, { backgroundColor: ocrFilter === k ? '#fff' : dot }]} />
              ) : null}
              <Text style={[styles.chipText, ocrFilter === k && styles.chipTextOn]}>
                {l}
                {count ? ` ${count}` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipScrollContent}
        nestedScrollEnabled
      >
        {KBS_DETAIL_FILTER_OPTIONS.map(({ key, label }) => {
          const count = detailCounts[key];
          const showCount = key !== 'all' && count > 0;
          return (
            <TouchableOpacity
              key={`detail-${key}`}
              style={[styles.chip, styles.detailChip, detailFilter === key && styles.chipOn]}
              onPress={() => setDetailFilter(key)}
            >
              <Text style={[styles.chipText, detailFilter === key && styles.chipTextOn]}>
                {label}
                {showCount ? ` ${count}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {newCount > 0 ? (
        <View style={styles.newBanner}>
          <Ionicons name="sparkles" size={14} color="#0d9488" />
          <Text style={styles.newBannerText}>{newCount} yeni kimlik kaydedildi</Text>
        </View>
      ) : null}

      {searchSuggestions.length > 0 ? (
        <View style={styles.suggestPanel}>
          {searchSuggestions.map((s) => (
            <Pressable
              key={s.id}
              style={({ pressed }) => [styles.suggestRow, pressed && styles.suggestRowPressed]}
              onPress={() => onSearchSuggestionPress(s)}
            >
              <View style={styles.suggestIcon}>
                <Ionicons
                  name={
                    s.kind === 'room'
                      ? 'bed-outline'
                      : s.kind === 'document'
                        ? 'card-outline'
                        : s.kind === 'phone'
                          ? 'call-outline'
                          : s.kind === 'staff'
                            ? 'person-outline'
                            : s.kind === 'note'
                              ? 'document-text-outline'
                              : 'id-card-outline'
                  }
                  size={15}
                  color={theme.colors.primary}
                />
              </View>
              <View style={styles.suggestTextCol}>
                <Text style={styles.suggestLabel} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={styles.suggestSub} numberOfLines={1}>
                  {s.subtitle}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={15} color={theme.colors.textMuted} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {searchQuery.trim().length > 0 ? (
        <Text style={styles.searchMeta}>
          {searched.length} sonuç · {searchQuery.trim()}
        </Text>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={listItems}
        extraData={{ ocrEpoch, noteSummaries, detailFilter, selectedIds, selectionMode }}
        keyExtractor={(entry) =>
          entry.kind === 'single' ? entry.row.id : `grp-${entry.batchKey}`
        }
        initialNumToRender={8}
        windowSize={6}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeader}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name={searchQuery.trim().length > 0 ? 'search-outline' : 'id-card-outline'}
                size={30}
                color="#94a3b8"
              />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery.trim().length > 0 ? 'Sonuç bulunamadı' : 'Henüz kayıt yok'}
            </Text>
            <Text style={styles.empty}>
              {searchQuery.trim().length > 0
                ? `"${searchQuery.trim()}" için sonuç bulunamadı`
                : filter === 'day'
                  ? t('kbsEmptyToday')
                  : t('kbsEmptyRange')}
            </Text>
            {searchQuery.trim().length === 0 ? (
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => router.push(CAPTURE_ID_ROUTE as never)}
              >
                <Ionicons name="camera" size={16} color="#fff" />
                <Text style={styles.emptyCtaText}>Yeni kimlik çek</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
        renderItem={({ item: entry }) => {
          const openRow = (row: KbsCapturedDocumentRow) => {
            if (selectionMode) {
              toggleSelect(row.id);
              return;
            }
            router.push(detailRoute(row.id));
          };

          const thumbZoom = (rowId: string) => {
            if (selectionMode) return;
            openGallery(rowId);
          };

          if (entry.kind === 'single') {
            const row = entry.row;
            return (
              <KbsCaptureListCard
                item={row}
                parsed={asParsed(row)}
                canSeeImages={canSeeImages}
                canDelete={canDelete}
                isNew={isRowNew(row)}
                showCapturedBy
                showHotel={canViewAllHotels}
                selectionMode={selectionMode}
                selected={selectedIds.has(row.id)}
                activelyReading={isKbsDocInOcrQueue(row.id)}
                noteSummary={noteSummaries.get(row.guest_id) ?? null}
                formatTime={formatCapturedAt}
                onPress={() => openRow(row)}
                onLongPress={() => {
                  if (selectionMode) toggleSelect(row.id);
                  else enterSelectionWith(row.id);
                }}
                onDelete={() => confirmDelete(row)}
                onThumbPress={thumbZoom}
              />
            );
          }

          const { rows, roomNumber, capturedAt } = entry;
          const capturedLabel = formatCapturedAt(capturedAt);
          const groupCapturer = rows.find((r) => r.captured_by_staff_name)?.captured_by_staff_name;
          const groupAllSelected = rows.every((r) => selectedIds.has(r.id));
          const groupSomeSelected = rows.some((r) => selectedIds.has(r.id));

          return (
            <View style={styles.groupBlock}>
              <View style={styles.groupAccent} />
              <Pressable
                style={styles.groupHeader}
                onPress={() => {
                  if (selectionMode) toggleGroupSelect(rows);
                }}
                disabled={!selectionMode}
              >
                <View style={styles.groupHeaderIcon}>
                  <Ionicons name="people" size={18} color="#0d9488" />
                </View>
                <View style={styles.groupHeaderText}>
                  <Text style={styles.groupTitle}>Aynı kayıt · {rows.length} kişi</Text>
                  <Text style={styles.groupSub}>
                    Oda {roomNumber ?? '—'} · {capturedLabel}
                    {groupCapturer ? ` · ${groupCapturer}` : ''}
                  </Text>
                </View>
                {selectionMode ? (
                  <View style={[styles.check, groupAllSelected && styles.checkOn]}>
                    {groupAllSelected ? (
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    ) : groupSomeSelected ? (
                      <View style={styles.checkPartial} />
                    ) : null}
                  </View>
                ) : canDelete ? (
                  <TouchableOpacity
                    style={styles.groupDeleteBtn}
                    onPress={() => confirmDeleteGroup(rows)}
                    hitSlop={8}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                ) : null}
              </Pressable>
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
                      <KbsCaptureListCard
                        item={row}
                        parsed={asParsed(row)}
                        canSeeImages={canSeeImages}
                        canDelete={canDelete}
                        isNew={isRowNew(row)}
                        showCapturedBy
                        showHotel={canViewAllHotels}
                        inGroup
                        groupPosition={pos}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(row.id)}
                        activelyReading={isKbsDocInOcrQueue(row.id)}
                        noteSummary={noteSummaries.get(row.guest_id) ?? null}
                        formatTime={formatCapturedAt}
                        onPress={() => openRow(row)}
                        onLongPress={() => {
                          if (selectionMode) toggleSelect(row.id);
                          else enterSelectionWith(row.id);
                        }}
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

      {selectionMode && canDelete ? (
        <View style={styles.bulkFooter}>
          <TouchableOpacity
            style={[styles.bulkDeleteBtn, (selectedIds.size === 0 || bulkDeleting) && styles.bulkDeleteBtnDisabled]}
            onPress={confirmBulkDelete}
            disabled={selectedIds.size === 0 || bulkDeleting}
          >
            {bulkDeleting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.bulkDeleteBtnText}>
                {t('kbsBulkDeleteSelected', { count: selectedIds.size })}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <KbsZoomImageModal
        items={galleryItems}
        initialIndex={galleryIndex ?? 0}
        visible={galleryIndex !== null}
        onClose={() => setGalleryIndex(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8' },
  listHeader: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  listContent: { paddingBottom: 20, flexGrow: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: theme.colors.textSecondary, fontWeight: '600' },
  toolbar: { marginBottom: 8 },
  liveInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  liveInlineText: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted },
  liveInlineStrong: { fontWeight: '800', color: theme.colors.text },
  liveInlineBusy: { color: '#2563eb' },
  liveInlineWarn: { color: '#ea580c' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  captureBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 36,
  },
  captureBtnText: { fontSize: 13, fontWeight: '800', color: '#fff', flexShrink: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtnBusy: { opacity: 0.7 },
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 10,
    height: 36,
  },
  selectionCloseBtn: { padding: 2 },
  selectionTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: theme.colors.text },
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
    gap: 6,
    backgroundColor: '#f0fdfa',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#99f6e4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 6,
  },
  newBannerText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#0f766e' },
  newBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#ccfbf1',
    flexShrink: 0,
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#fffbeb',
  },
  statusChipOk: { backgroundColor: '#ecfdf5' },
  statusChipBusy: { backgroundColor: '#eff6ff' },
  statusChipWarn: { backgroundColor: '#fff7ed' },
  statusChipMuted: { backgroundColor: '#f1f5f9' },
  statusChipText: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary },
  statusChipTextOk: { color: '#059669' },
  statusChipTextWarn: { color: '#c2410c' },
  statusChipTextBusy: { color: '#2563eb' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotOk: { backgroundColor: '#10b981' },
  statusDotWarn: { backgroundColor: '#ea580c' },
  statusDotBusy: { backgroundColor: '#3b82f6' },
  statusDotMuted: { backgroundColor: '#94a3b8' },
  returningChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  returningChipText: { fontSize: 10, fontWeight: '800', color: '#059669' },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  noteChipAttention: { backgroundColor: '#fff7ed' },
  noteChipGood: { backgroundColor: '#ecfdf5' },
  noteChipText: { fontSize: 10, fontWeight: '800', color: '#475569' },
  noteChipTextAttention: { color: '#b45309' },
  noteChipTextGood: { color: '#047857' },
  detailChip: { borderStyle: 'dashed' as const },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8, minWidth: 0 },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    maxWidth: '100%',
  },
  metaText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary, flexShrink: 1 },
  metaDot: { fontSize: 12, color: theme.colors.textMuted, marginHorizontal: 2 },
  staffLine: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontWeight: '600' },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    flexShrink: 0,
  },
  toolChipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  toolChipText: { fontSize: 11, fontWeight: '700', color: theme.colors.text },
  toolChipTextOn: { color: '#fff' },
  toolChipDangerText: { color: '#dc2626' },
  chipScroll: { flexGrow: 0, marginBottom: 2 },
  chipScrollContent: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 4 },
  chipGap: {
    width: 1,
    height: 14,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 3,
  },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipDot: { width: 5, height: 5, borderRadius: 3 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    height: 36,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
    paddingVertical: 0,
  },
  searchMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  suggestPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 6,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  suggestRowPressed: { backgroundColor: theme.colors.backgroundSecondary },
  suggestIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestTextCol: { flex: 1, minWidth: 0 },
  suggestLabel: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  suggestSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: theme.colors.textSecondary },
  chipTextOn: { color: '#fff' },
  errorText: { color: theme.colors.error, marginTop: 6, fontSize: 12 },
  groupBlock: {
    marginBottom: 10,
    marginHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: '#99f6e4',
    overflow: 'hidden',
    position: 'relative',
    ...theme.shadows.sm,
  },
  groupAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: '#0d9488',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingLeft: 16,
    paddingVertical: 12,
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
  groupHeaderText: { flex: 1, minWidth: 0 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
  groupSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  groupDeleteBtn: { padding: 6 },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#99f6e4',
    marginLeft: 16,
  },
  groupCards: { paddingLeft: 4 },
  groupInnerLine: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.borderLight,
    marginLeft: 100,
    marginRight: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eef2f6',
    padding: 12,
    marginBottom: 10,
    marginHorizontal: 12,
    ...theme.shadows.sm,
  },
  cardPressed: { opacity: 0.92 },
  cardInGroup: {
    marginBottom: 0,
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingRight: 12,
    shadowOpacity: 0,
    elevation: 0,
  },
  cardInGroupFirst: { paddingTop: 10 },
  cardInGroupLast: { paddingBottom: 12 },
  cardInGroupSelected: { backgroundColor: '#fffbeb' },
  cardSelected: { borderColor: theme.colors.primary, backgroundColor: '#fffbeb' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  checkPartial: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
  thumbWrap: { flexShrink: 0 },
  tcThumb: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 4,
    gap: 4,
    flexShrink: 0,
  },
  tcThumbText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#1d4ed8',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: theme.colors.text, flexShrink: 1 },
  metaHotel: { fontSize: 11, color: '#0d9488', fontWeight: '700', flexShrink: 1 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chevronWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bulkFooter: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: '#fff',
  },
  bulkDeleteBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  bulkDeleteBtnDisabled: { opacity: 0.45 },
  bulkDeleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 28 },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#eef2f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    marginTop: 18,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  permHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 14,
  },
});
