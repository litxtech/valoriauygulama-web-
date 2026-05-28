import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseIdCapture } from '@/lib/kbsMrzAccess';
import {
  fetchKbsCapturedDocumentById,
  type KbsCapturedDocumentRow,
} from '@/lib/kbsCaptureHistory';
import { getKbsCaptureHistoryCache, setKbsCaptureHistoryCache } from '@/lib/kbsCaptureHistoryCache';
import { KbsCaptureDetailView } from '@/components/kbs/KbsCaptureDetailView';
import { KbsZoomImageModal } from '@/components/kbs/KbsZoomImageModal';
import { supabase } from '@/lib/supabase';
import { Redirect } from 'expo-router';

export default function KbsCaptureDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const staff = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<KbsCapturedDocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const canSeeImage =
    staff?.role === 'admin' ||
    staff?.role === 'reception_chief' ||
    staff?.kbs_access_enabled !== false ||
    canStaffUseIdCapture(staff);

  const load = useCallback(async () => {
    if (!id) return;
    const cached = getKbsCaptureHistoryCache()?.find((r) => r.id === id);
    if (cached) setRow(cached);
    const fresh = await fetchKbsCapturedDocumentById(id);
    if (fresh) {
      setRow(fresh);
      const cache = getKbsCaptureHistoryCache();
      if (cache) {
        setKbsCaptureHistoryCache(cache.map((r) => (r.id === id ? fresh : r)));
      }
    }
  }, [id]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`kbs-capture-doc-${id}`)
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

  if (!canStaffUseIdCapture(staff)) {
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
        onImagePress={() => row.front_image_url && setPreviewUri(row.front_image_url)}
      />
      <KbsZoomImageModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miss: { color: theme.colors.textSecondary, fontWeight: '600' },
});
