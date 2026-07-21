import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
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
import {
  fetchKbsBrowseDocuments,
  listAccessibleHotels,
  resolveKbsMultiHotelContext,
  type KbsOpsHotel,
} from '@/lib/kbsMultiHotelCaptures';
import {
  capturedAtTs,
  deleteKbsCapturedDocument,
  displayCapturedName,
  filterKbsCapturesForViewer,
  staffCanDeleteKbsCaptures,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import {
  getKbsCaptureHistoryCache,
  loadKbsCaptureHistoryCacheFromDisk,
  setKbsCaptureHistoryCache,
} from '@/lib/kbsCaptureHistoryCache';
import { kbsCaptureCardStatus, enrichKbsParsedFromSources, isKbsCaptureOcrCoreComplete, isKbsTcOnlyCapture, isKbsOcrManualReview, isKbsOcrInProgress, kbsCaptureIsPartialReadable, isKbsOcrFailed } from '@/lib/kbsCaptureParsedFields';
import { isKbsReturningGuest } from '@/lib/kbsGuestDocumentIdentity';
import {
  isKbsDocInOcrQueue,
  kickUnreadCapturesOcr,
  kbsCaptureOcrQueueSize,
  startKbsOcrClaimLoop,
  kickKbsOcrRecovery,
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

function asParsed(row: KbsCapturedDocumentRow): ParsedDocument | null {
  const p = row.parsed_payload;
  if (!p || typeof p !== 'object') return null;
  return enrichKbsParsedFromSources(p) as ParsedDocument;
}

type CaptureCardProps = {
  item: KbsCapturedDocumentRow;
  canSeeImages: boolean;
  canDelete: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  onThumbPress?: (rowId: string) => void;
  inGroup?: boolean;
  groupPosition?: 'first' | 'middle' | 'last' | 'only';
  isNew?: boolean;
  showCapturedBy?: boolean;
  showHotel?: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  /** Kuyruk epoch — yalnız gerçek Okunuyor için. */
  ocrEpoch?: number;
};

function CaptureCardInner({
  item,
  canSeeImages,
  canDelete,
  onPress,
  onLongPress,
  onDelete,
  onThumbPress,
  inGroup,
  groupPosition = 'only',
  isNew = false,
  showCapturedBy = false,
  showHotel = false,
  selectionMode = false,
  selected = false,
  ocrEpoch = 0,
}: CaptureCardProps) {
  const { t } = useTranslation();
  const parsed = asParsed(item);
  void ocrEpoch;
  const activelyReading = isKbsDocInOcrQueue(item.id);
  const cardStatus = kbsCaptureCardStatus(parsed, {
    ocrStatus: item.ocr_status,
    activelyReading,
  });
  const statusChipStyle =
    cardStatus?.tone === 'ok'
      ? styles.statusChipOk
      : cardStatus?.tone === 'warn'
        ? styles.statusChipWarn
        : cardStatus?.tone === 'progress'
          ? styles.statusChipBusy
          : styles.statusChipMuted;
  const statusChipTextStyle =
    cardStatus?.tone === 'ok'
      ? styles.statusChipTextOk
      : cardStatus?.tone === 'warn'
        ? styles.statusChipTextWarn
        : cardStatus?.tone === 'progress'
          ? styles.statusChipTextBusy
          : styles.statusChipText;

  const isFirst = groupPosition === 'first' || groupPosition === 'only';
  const isLast = groupPosition === 'last' || groupPosition === 'only';

  return (
    <Pressable
      style={[
        styles.card,
        inGroup && styles.cardInGroup,
        inGroup && isFirst && styles.cardInGroupFirst,
        inGroup && isLast && styles.cardInGroupLast,
        selectionMode && selected && (inGroup ? styles.cardInGroupSelected : styles.cardSelected),
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {selectionMode ? (
        <View style={[styles.check, selected && styles.checkOn]}>
          {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
        </View>
      ) : null}
      {canSeeImages && item.front_image_url ? (
        <Pressable
          onPress={() => onThumbPress?.(item.id)}
          accessibilityLabel={t('kbsEnlargeIdA11y')}
        >
          <Image source={{ uri: item.front_image_url }} style={styles.thumb} contentFit="cover" />
        </Pressable>
      ) : isKbsTcOnlyCapture(parsed) ? (
        <View style={styles.tcThumb}>
          <Ionicons name="finger-print" size={26} color="#2563eb" />
          <Text style={styles.tcThumbText} numberOfLines={1}>
            {parsed?.documentNumber ?? 'T.C.'}
          </Text>
        </View>
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
          {cardStatus ? (
            <View style={[styles.statusChip, statusChipStyle]}>
              <Text style={[styles.statusChipText, statusChipTextStyle]}>{cardStatus.label}</Text>
            </View>
          ) : null}
        </View>
        {!inGroup ? <Text style={styles.meta}>Oda {item.room_number ?? '—'}</Text> : null}
        {showHotel && item.hotel_name ? (
          <Text style={styles.metaHotel}>🏨 {item.hotel_name}</Text>
        ) : null}
        {showCapturedBy && (item.captured_by_staff_name || item.scanned_by_user_id) ? (
          <Text style={styles.metaStaff}>
            Yükleyen: {item.captured_by_staff_name?.trim() || 'Personel'}
          </Text>
        ) : null}
        <Text style={styles.meta}>{new Date(capturedAtTs(item)).toLocaleString('tr-TR')}</Text>
        {isKbsReturningGuest(parsed) ? (
          <Text style={styles.returningLine}>Daha önce geldi</Text>
        ) : null}
        {cardStatus ? (
          <Text
            style={
              cardStatus.tone === 'ok'
                ? styles.okLine
                : cardStatus.tone === 'warn'
                  ? styles.warnLine
                  : cardStatus.tone === 'progress'
                    ? styles.meta
                    : styles.meta
            }
          >
            {cardStatus.label === 'Tamam'
              ? 'Tüm alanlar okundu'
              : cardStatus.tone === 'progress'
                ? 'Şu an okunuyor'
                : cardStatus.label === 'Okunamadı'
                  ? 'Boş / okunamadı — otomatik okuma denenecek'
                  : cardStatus.label.startsWith('Manuel')
                    ? 'Manuel kontrol gerekli'
                    : cardStatus.label.startsWith('Eksik')
                      ? 'Eksik alanlar var'
                      : cardStatus.label}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      {canDelete && !selectionMode ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} hitSlop={8}>
          <Ionicons name="trash-outline" size={20} color="#dc2626" />
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );
}

const CaptureCard = memo(CaptureCardInner);

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

      // Boş / eksik kayıtları bir kez okumaya al (listeyi sürekli yenilemeden)
      const kicked = kickUnreadCapturesOcr(scoped, 10);
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
      }, 1_800);
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
      startKbsOcrClaimLoop();
      void kickKbsOcrRecovery();
      return () => {
        void setKbsCaptureHistoryLastSeenAt(new Date().toISOString());
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
        .sort((a, b) => new Date(capturedAtTs(b)).getTime() - new Date(capturedAtTs(a)).getTime()),
    [rows, filter, ocrFilter, ocrEpoch]
  );

  const ocrCounts = useMemo(() => {
    const base = rows.filter((r) => inRange(capturedAtTs(r), filter));
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
  }, [rows, filter, ocrEpoch]);

  // Boş/eksik tespit + okuma: reload içinde kickUnreadCapturesOcr (tek sefer).

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
    () => filterKbsCapturesBySearchQuery(combined, searchQuery),
    [combined, searchQuery]
  );

  const searchSuggestions = useMemo(
    () =>
      searchFocused && searchQuery.trim().length >= 1
        ? buildKbsCaptureSearchSuggestions(combined, searchQuery, 8)
        : [],
    [combined, searchQuery, searchFocused]
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

  return (
    <View style={styles.container}>
      <KbsBrowseTabBar active="captures" />

      <KbsHotelFilterBar
        hotels={hotels}
        canViewAll={canViewAllHotels}
        value={hotelFilter}
        onChange={setHotelFilter}
      />

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
          <Text style={styles.newBannerText}>{newCount} yeni kimlik kaydedildi</Text>
        </View>
      ) : null}

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
        <TouchableOpacity
          style={[styles.reportBtn, pdfBusy && styles.reportBtnBusy]}
          onPress={() => void onSharePrint()}
          disabled={pdfBusy}
        >
          {pdfBusy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="print-outline" size={14} color="#fff" />
          )}
          <Text style={styles.reportBtnText}>{pdfBusy ? '…' : 'PDF'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {(
          [
            ['all', 'Tümü'],
            ['reading', `Okunuyor${ocrCounts.reading ? ` (${ocrCounts.reading})` : ''}`],
            ['partial', `Eksik${ocrCounts.partial ? ` (${ocrCounts.partial})` : ''}`],
            ['manual', `Manuel${ocrCounts.manual ? ` (${ocrCounts.manual})` : ''}`],
            ['failed', `Okunamadı${ocrCounts.failed ? ` (${ocrCounts.failed})` : ''}`],
          ] as const
        ).map(([k, l]) => (
          <TouchableOpacity
            key={k}
            style={[styles.chip, ocrFilter === k && styles.chipOn]}
            onPress={() => setOcrFilter(k)}
          >
            <Text style={[styles.chipText, ocrFilter === k && styles.chipTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {canDelete ? (
        <View style={styles.toolRow}>
          {selectionMode ? (
            <>
              <Text style={styles.selectHint} numberOfLines={2}>
                {t('kbsSelectForMrz')}
              </Text>
              <TouchableOpacity style={styles.toolChip} onPress={selectAllVisible}>
                <Ionicons name="checkbox-outline" size={14} color={theme.colors.text} />
                <Text style={styles.toolChipText}>{t('kbsSelectAll')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolChip} onPress={exitSelectionMode}>
                <Text style={styles.toolChipText}>{t('cancel')}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.toolChip}
              onPress={() => setSelectionMode(true)}
            >
              <Ionicons name="trash-outline" size={14} color="#dc2626" />
              <Text style={[styles.toolChipText, styles.toolChipDangerText]}>{t('kbsBulkDeleteMode')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Ad, soyad, oda, kimlik no, uyruk, yaş…"
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
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

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
                        : s.kind === 'staff'
                          ? 'person-outline'
                          : 'id-card-outline'
                  }
                  size={16}
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
              <Ionicons name="arrow-forward" size={16} color={theme.colors.textMuted} />
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

      <FlatList
        data={listItems}
        extraData={ocrEpoch}
        keyExtractor={(entry) =>
          entry.kind === 'single' ? entry.row.id : `grp-${entry.batchKey}`
        }
        initialNumToRender={8}
        windowSize={6}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {searchQuery.trim().length > 0
              ? `"${searchQuery.trim()}" için sonuç bulunamadı`
              : filter === 'day'
                ? t('kbsEmptyToday')
                : t('kbsEmptyRange')}
          </Text>
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
              <CaptureCard
                item={row}
                canSeeImages={canSeeImages}
                canDelete={canDelete}
                isNew={isRowNew(row)}
                showCapturedBy
                showHotel={canViewAllHotels}
                selectionMode={selectionMode}
                selected={selectedIds.has(row.id)}
                ocrEpoch={ocrEpoch}
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
          const capturedLabel = new Date(capturedAt).toLocaleString('tr-TR');
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
                      <CaptureCard
                        item={row}
                        canSeeImages={canSeeImages}
                        canDelete={canDelete}
                        isNew={isRowNew(row)}
                        showCapturedBy
                        showHotel={canViewAllHotels}
                        inGroup
                        groupPosition={pos}
                        selectionMode={selectionMode}
                        selected={selectedIds.has(row.id)}
                        ocrEpoch={ocrEpoch}
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
  statusChipWarn: { backgroundColor: '#fff7ed' },
  statusChipMuted: { backgroundColor: '#f1f5f9' },
  statusChipText: { fontSize: 10, fontWeight: '800', color: theme.colors.textSecondary },
  statusChipTextOk: { color: '#059669' },
  statusChipTextWarn: { color: '#c2410c' },
  statusChipTextBusy: { color: '#2563eb' },
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
  toolChipDangerText: { color: '#dc2626' },
  selectHint: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: theme.colors.text,
    paddingVertical: 2,
  },
  searchMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 8,
  },
  suggestPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 8,
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
  reportBtnBusy: { opacity: 0.75 },
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
  checkPartial: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: theme.colors.primary,
  },
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
  tcThumb: {
    width: 88,
    height: 112,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 6,
    gap: 6,
  },
  tcThumbText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1d4ed8',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  meta: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  metaStaff: { fontSize: 12, color: '#0f766e', marginTop: 2, fontWeight: '700' },
  metaHotel: { fontSize: 12, color: '#0d9488', marginTop: 2, fontWeight: '700' },
  parsedLine: { fontSize: 11, color: theme.colors.text, marginTop: 6, lineHeight: 15 },
  parsedHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 6, fontStyle: 'italic' },
  missingLine: { fontSize: 11, color: '#b45309', marginTop: 4, fontWeight: '700' },
  okLine: { fontSize: 11, color: '#059669', marginTop: 4, fontWeight: '700' },
  warnLine: { fontSize: 11, color: '#c2410c', marginTop: 4, fontWeight: '700' },
  returningLine: { fontSize: 11, color: '#b45309', marginTop: 4, fontWeight: '800' },
  busyLine: { fontSize: 11, color: '#2563eb', marginTop: 4, fontWeight: '700' },
  deleteBtn: { padding: 6 },
  bulkFooter: {
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    marginTop: 4,
  },
  bulkDeleteBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  bulkDeleteBtnDisabled: { opacity: 0.45 },
  bulkDeleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  empty: { textAlign: 'center', color: theme.colors.textSecondary, marginTop: 40, lineHeight: 20, paddingHorizontal: 16 },
  permHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 6, textAlign: 'center' },
});
