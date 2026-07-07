import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
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
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { buildKbsCaptureGalleryItems } from '@/lib/kbsCaptureGallery';
import { correctKbsCapturedDocument } from '@/lib/kbsCaptureOcrCorrection';
import { Redirect } from 'expo-router';

export default function KbsCaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<KbsCapturedDocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [justSavedIds] = useState(() => consumeKbsCapturesJustSaved());
  const [correctBusy, setCorrectBusy] = useState(false);

  const isNew = row
    ? isKbsCaptureRowNew(row, justSavedIds, lastSeenAt)
    : false;

  const canSeeImage =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const galleryItems = useMemo(() => {
    if (!row) return [];
    return buildKbsCaptureGalleryItems([row], canSeeImage);
  }, [row, canSeeImage]);

  const openGallery = useCallback(() => {
    if (!row?.front_image_url) return;
    const idx = galleryItems.findIndex((item) => item.id === row.id);
    setGalleryIndex(idx >= 0 ? idx : 0);
  }, [galleryItems, row]);

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

  const handleCorrect = useCallback(async () => {
    if (!row || correctBusy) return;
    setCorrectBusy(true);
    try {
      const res = await correctKbsCapturedDocument(row);
      if (!res.ok) {
        Alert.alert('Düzelt', res.message);
        return;
      }
      await load();
      if (!res.coreComplete) {
        Alert.alert(
          'Kısmi okuma',
          'Belge yeniden tarandı. Bazı alanlar hâlâ eksik veya belirsiz olabilir; gerekirse ad/soyadı elle düzenleyin.'
        );
      }
    } finally {
      setCorrectBusy(false);
    }
  }, [correctBusy, load, row]);

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

  // Realtime: müşteri numarası (veya OCR) başka cihazdan/web'den değişince güncelle.
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

  const handleSavePhone = useCallback(
    async (phone: string | null): Promise<{ ok: boolean; message?: string }> => {
      if (!row) return { ok: false, message: 'Kayıt bulunamadı' };
      const res = await updateKbsCaptureGuestPhone(row.id, phone);
      if (!res.ok) return { ok: false, message: res.message };
      setRow((cur) => (cur ? { ...cur, guest_phone_submitted: res.phone } : cur));
      const cache = getKbsCaptureHistoryCache();
      if (cache) {
        setKbsCaptureHistoryCache(
          cache.map((r) => (r.id === row.id ? { ...r, guest_phone_submitted: res.phone } : r))
        );
      }
      return { ok: true };
    },
    [row]
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
      <KbsCaptureDetailView
        row={row}
        canSeeImage={canSeeImage}
        isNew={isNew}
        onImagePress={openGallery}
        onCorrect={() => void handleCorrect()}
        correctBusy={correctBusy}
        onSavePhone={handleSavePhone}
      />
      <KbsZoomImageModal
        items={galleryItems}
        initialIndex={galleryIndex ?? 0}
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
