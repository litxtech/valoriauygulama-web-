import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture, canStaffViewKbsCaptureHistory } from '@/lib/kbsMrzAccess';
import {
  fetchKbsCapturedDocumentById,
  filterKbsCapturesForViewer,
  updateKbsCaptureGuestPhone,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { supabase } from '@/lib/supabase';
import { getKbsCaptureHistoryCache, setKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import {
  consumeKbsCapturesJustSaved,
  getKbsCaptureHistoryLastSeenAt,
} from '@/lib/kbsCaptureHistorySeen';
import { isKbsCaptureRowNew } from '@/lib/kbsCaptureHistoryMrzTargets';
import { KbsCaptureDetailView } from '@/components/kbs/KbsCaptureDetailView';
import { KbsCaptureOpsActions } from '@/components/kbs/KbsCaptureOpsActions';
import { KbsPassportViewerPager } from '@/components/kbs/KbsPassportViewerPager';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { buildKbsCaptureGalleryItems } from '@/lib/kbsCaptureGallery';
import { correctKbsCapturedDocument } from '@/lib/kbsCaptureOcrCorrection';
import { canKbsCheckin } from '@/lib/kbsStaysPermissions';
import { Redirect } from 'expo-router';
import {
  findKbsDuplicatePhoneHits,
  kbsDuplicatePhoneCompareHref,
  pickPrimaryKbsDuplicatePhoneHit,
  showKbsDuplicatePhoneAlert,
  type KbsDuplicatePhoneHit,
} from '@/lib/kbsDuplicatePhone';
import {
  findKbsCaptureRoommates,
  indexOfKbsCaptureRoommate,
} from '@/lib/kbsCaptureRoommates';

type PageProps = {
  row: KbsCapturedDocumentRow;
  canSeeImage: boolean;
  isNew: boolean;
  onImagePress: () => void;
  onReload: () => Promise<void>;
};

function CaptureDetailPage({ row, canSeeImage, isNew, onImagePress, onReload }: PageProps) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [correctBusy, setCorrectBusy] = useState(false);
  const [phoneDuplicate, setPhoneDuplicate] = useState<KbsDuplicatePhoneHit | null>(null);

  const handleCorrect = useCallback(async () => {
    if (correctBusy) return;
    setCorrectBusy(true);
    try {
      const res = await correctKbsCapturedDocument(row);
      if (!res.ok) {
        Alert.alert('Düzelt', res.message);
        return;
      }
      await onReload();
      if (!res.coreComplete) {
        Alert.alert(
          'Kısmi okuma',
          'Belge yeniden tarandı. Bazı alanlar hâlâ eksik veya belirsiz olabilir; gerekirse ad/soyadı elle düzenleyin.'
        );
      }
    } finally {
      setCorrectBusy(false);
    }
  }, [correctBusy, onReload, row]);

  const refreshPhoneDuplicate = useCallback(async (doc: KbsCapturedDocumentRow) => {
    const phone = doc.guest_phone_submitted?.trim();
    if (!phone) {
      setPhoneDuplicate(null);
      return null;
    }
    try {
      const hits = await findKbsDuplicatePhoneHits({
        phone,
        excludeDocumentId: doc.id,
        hotelId: doc.hotel_id ?? null,
      });
      const primary = pickPrimaryKbsDuplicatePhoneHit(hits);
      setPhoneDuplicate(primary);
      return primary;
    } catch {
      setPhoneDuplicate(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!row.guest_phone_submitted) {
      setPhoneDuplicate(null);
      return;
    }
    void refreshPhoneDuplicate(row);
  }, [row.id, row.guest_phone_submitted, row.hotel_id, refreshPhoneDuplicate]);

  const openPhoneCompare = useCallback(
    (hit: KbsDuplicatePhoneHit, currentId: string) => {
      if (!hit.documentId) return;
      router.push(kbsDuplicatePhoneCompareHref(currentId, hit.documentId));
    },
    [router]
  );

  const handleSavePhone = useCallback(
    async (phone: string | null): Promise<{ ok: boolean; message?: string }> => {
      const res = await updateKbsCaptureGuestPhone(row.id, phone);
      if (!res.ok) return { ok: false, message: res.message };
      const nextRow = { ...row, guest_phone_submitted: res.phone };
      const cache = getKbsCaptureHistoryCache();
      if (cache) {
        setKbsCaptureHistoryCache(
          cache.map((r) => (r.id === row.id ? { ...r, guest_phone_submitted: res.phone } : r))
        );
      }

      if (res.phone) {
        const hit = await refreshPhoneDuplicate(nextRow);
        if (hit) {
          showKbsDuplicatePhoneAlert(hit, {
            onCompare: hit.documentId ? () => openPhoneCompare(hit, row.id) : undefined,
          });
        }
      } else {
        setPhoneDuplicate(null);
      }

      await onReload();
      return { ok: true };
    },
    [onReload, openPhoneCompare, refreshPhoneDuplicate, row]
  );

  return (
    <KbsCaptureDetailView
      row={row}
      canSeeImage={canSeeImage}
      isNew={isNew}
      onImagePress={onImagePress}
      onCorrect={() => void handleCorrect()}
      correctBusy={correctBusy}
      onSavePhone={handleSavePhone}
      phoneDuplicate={phoneDuplicate}
      onComparePhoneDuplicate={
        phoneDuplicate?.documentId ? () => openPhoneCompare(phoneDuplicate, row.id) : undefined
      }
      notesHotelId={row.hotel_id ?? null}
      notesAuthUserId={staff?.auth_id ?? null}
      notesStaffName={staff?.full_name ?? null}
      canWriteNotes={canStaffUseIdCapture(staff) || canStaffViewKbsCaptureHistory(staff)}
      opsActions={
        <KbsCaptureOpsActions
          row={row}
          canNotify={canKbsCheckin(staff)}
          onUpdated={() => void onReload()}
        />
      }
    />
  );
}

export default function KbsCaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<KbsCapturedDocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [justSavedIds] = useState(() => consumeKbsCapturesJustSaved());
  const [activeIndex, setActiveIndex] = useState(0);

  const canSeeImage =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const roommates = useMemo(() => {
    if (!row) return [];
    const pool = getKbsCaptureHistoryCache() ?? [];
    const merged = pool.some((r) => r.id === row.id) ? pool : [row, ...pool];
    return findKbsCaptureRoommates(row, merged);
  }, [row]);

  const initialIndex = useMemo(() => {
    if (!row) return 0;
    return indexOfKbsCaptureRoommate(row.id, roommates);
  }, [row, roommates]);

  const galleryItems = useMemo(() => {
    return buildKbsCaptureGalleryItems(roommates.length ? roommates : row ? [row] : [], canSeeImage);
  }, [roommates, row, canSeeImage]);

  const openGallery = useCallback(
    (targetRow: KbsCapturedDocumentRow) => {
      if (!targetRow.front_image_url) return;
      const idx = galleryItems.findIndex((item) => item.id === targetRow.id);
      setGalleryIndex(idx >= 0 ? idx : 0);
    },
    [galleryItems]
  );

  const load = useCallback(async () => {
    if (!id) return;
    const cached = getKbsCaptureHistoryCache()?.find((r) => r.id === id);
    if (cached) setRow(cached);
    try {
      const fresh = await fetchKbsCapturedDocumentById(id);
      const scoped = fresh ? filterKbsCapturesForViewer([fresh], staff, staff?.auth_id)[0] ?? null : null;
      if (scoped) {
        setRow(scoped);
        const cache = getKbsCaptureHistoryCache();
        if (cache) {
          setKbsCaptureHistoryCache(cache.map((r) => (r.id === id ? scoped : r)));
        }
      } else if (!cached) {
        setRow(null);
      }
    } catch {
      // Oturum henüz hazır değil / geçici ağ hatası — önbellekteki kayıt gösterilmeye devam eder.
    }
  }, [id, staff]);

  useEffect(() => {
    if (!staff?.id) return;
    void getKbsCaptureHistoryLastSeenAt(staff.id).then(setLastSeenAt);
  }, [staff?.id]);

  useEffect(() => {
    if (!id) return;
    const cached = getKbsCaptureHistoryCache()?.find((r) => r.id === id);
    if (cached) {
      setRow(cached);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id || !staff?.auth_id) return;
    void load().finally(() => setLoading(false));
  }, [id, load, staff?.auth_id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`kbs-doc-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'ops', table: 'guest_documents', filter: `id=eq.${id}` },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  const renderPage = useCallback(
    (pageRow: KbsCapturedDocumentRow) => (
      <CaptureDetailPage
        row={pageRow}
        canSeeImage={canSeeImage}
        isNew={isKbsCaptureRowNew(pageRow, justSavedIds, lastSeenAt)}
        onImagePress={() => openGallery(pageRow)}
        onReload={load}
      />
    ),
    [canSeeImage, justSavedIds, lastSeenAt, openGallery, load]
  );

  if (!canStaffViewKbsCaptureHistory(staff)) {
    return <Redirect href="/staff" />;
  }

  if (loading && !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.centered}>
        <Text style={styles.miss}>Kayıt bulunamadı</Text>
      </View>
    );
  }

  return (
    <>
      <KbsPassportViewerPager
        roommates={roommates}
        initialIndex={initialIndex}
        canSeeImage={canSeeImage}
        onIndexChange={(index) => setActiveIndex(index)}
        renderPage={(pageRow) => renderPage(pageRow)}
      />
      <KbsZoomImageModal
        items={galleryItems}
        initialIndex={galleryIndex ?? activeIndex}
        visible={galleryIndex !== null}
        onClose={() => setGalleryIndex(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miss: { color: theme.colors.textSecondary, fontWeight: '600' },
});
