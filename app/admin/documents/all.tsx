import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Modal,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { useRouter } from 'expo-router';
import { listDocuments, type DocumentRow } from '@/lib/documentManagement';
import { supabase } from '@/lib/supabase';
import { CachedImage } from '@/components/CachedImage';
import { getDocumentsBucketPublicUrl, isDocumentImageMime } from '@/lib/documentsSignedUrl';
import { DocumentScreenIntro } from '@/components/documents/DocumentScreenIntro';
import { documentDetailHref, useDocumentsBasePath } from '@/lib/documentManagementRoutes';
import { docTheme } from '@/constants/documentManagementTheme';

type LightboxState = { uri: string; title: string } | null;

export default function AdminDocumentsAll() {
  const router = useRouter();
  const base = useDocumentsBasePath();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [versionsById, setVersionsById] = useState<Record<string, { file_path: string; mime_type: string | null; file_name: string }>>({});
  const [publicUrlByPath, setPublicUrlByPath] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listDocuments({ archived: false });
    if (!res.error && res.data) {
      const docs = (res.data as any as DocumentRow[]) ?? [];
      setRows(docs);

      const versionIds = Array.from(
        new Set(docs.map((d) => d.current_version_id).filter(Boolean) as string[])
      );
      if (versionIds.length > 0) {
        const vRes = await supabase
          .from('document_versions')
          .select('id, file_path, mime_type, file_name')
          .in('id', versionIds);
        if (!vRes.error && vRes.data) {
          const map: Record<string, { file_path: string; mime_type: string | null; file_name: string }> = {};
          const urlMap: Record<string, string> = {};
          for (const v of vRes.data as any[]) {
            if (!v?.id || !v?.file_path) continue;
            const fp = String(v.file_path);
            const fn = String(v.file_name ?? '');
            map[String(v.id)] = { file_path: fp, mime_type: v.mime_type ?? null, file_name: fn };
            const url = getDocumentsBucketPublicUrl(fp);
            if (url) urlMap[fp] = url;
          }
          setVersionsById(map);
          setPublicUrlByPath(urlMap);
        }
      } else {
        setVersionsById({});
        setPublicUrlByPath({});
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const emptyText = useMemo(() => (loading ? 'Yükleniyor…' : 'Kayıt yok'), [loading]);

  const goDetail = (docId: string) => router.push(documentDetailHref(base, docId) as never);

  const openLightbox = (uri: string, title: string) => {
    setLightbox({ uri, title });
  };

  const closeLightbox = () => setLightbox(null);

  const previewMaxH = Math.min(winH * 0.82, winW * 1.1);

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={docTheme.accent} />}
        ListHeaderComponent={<DocumentScreenIntro screenKey="all" />}
        ListEmptyComponent={<Text style={styles.sub}>{emptyText}</Text>}
        renderItem={({ item }) => {
          const ver = item.current_version_id ? versionsById[item.current_version_id] : undefined;
          const mime = ver?.mime_type ?? null;
          const fn = ver?.file_name ?? '';
          const isImage = isDocumentImageMime(mime, fn, ver?.file_path);
          const thumbUrl = ver?.file_path ? publicUrlByPath[ver.file_path] : undefined;
          const fileLabel = ver?.file_name ? ver.file_name : '';

          return (
            <View style={styles.card}>
              {isImage && thumbUrl ? (
                <TouchableOpacity
                  style={styles.thumb}
                  activeOpacity={0.9}
                  onPress={() => openLightbox(thumbUrl, item.title)}
                  accessibilityLabel="Önizlemeyi tam ekran aç"
                >
                  <CachedImage uri={thumbUrl} style={styles.thumbImg} contentFit="cover" />
                </TouchableOpacity>
              ) : (
                <View style={styles.thumb}>
                  <View style={styles.thumbPlaceholder}>
                    <Ionicons
                      name={mime === 'application/pdf' || /\.pdf$/i.test(fileLabel) ? 'document-text-outline' : 'document-outline'}
                      size={24}
                      color={adminTheme.colors.textMuted}
                    />
                  </View>
                </View>
              )}

              <TouchableOpacity style={styles.cardBody} activeOpacity={0.8} onPress={() => goDetail(item.id)}>
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {!!fileLabel ? (
                  <Text style={styles.fileMeta} numberOfLines={1}>
                    {fileLabel}
                  </Text>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  Durum: {item.status} · Güncelleme: {new Date(item.updated_at).toLocaleString('tr-TR')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} onPress={() => goDetail(item.id)} accessibilityLabel="Belge detayı">
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <Modal visible={lightbox !== null} transparent animationType="fade" onRequestClose={closeLightbox} statusBarTranslucent>
        <View style={[styles.lightboxRoot, { paddingTop: insets.top }]}>
          <View style={styles.lightboxHeader}>
            <TouchableOpacity onPress={closeLightbox} style={styles.lightboxCloseBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="chevron-back" size={26} color="#fff" />
              <Text style={styles.lightboxCloseText}>Geri</Text>
            </TouchableOpacity>
            {lightbox?.title ? (
              <Text style={styles.lightboxTitle} numberOfLines={1}>
                {lightbox.title}
              </Text>
            ) : null}
            <View style={{ width: 72 }} />
          </View>

          <Pressable style={styles.lightboxBackdrop} onPress={closeLightbox}>
            <Pressable style={styles.lightboxImageWrap} onPress={() => {}}>
              {lightbox?.uri ? (
                <CachedImage
                  uri={lightbox.uri}
                  style={{ width: winW, height: previewMaxH }}
                  contentFit="contain"
                  cachePolicy="disk"
                />
              ) : null}
            </Pressable>
          </Pressable>

          <Text style={styles.lightboxHint}>Kapat: Geri · Kenar boşluğa dokun</Text>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: docTheme.bg },
  content: { padding: 20, paddingBottom: 96 },
  sub: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, lineHeight: 18 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 10,
  },
  /** Liste önizlemesi: görsel belgeler için daha büyük thumb */
  thumb: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  fileMeta: { marginTop: 4, fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  rowMeta: { marginTop: 4, fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  lightboxRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  lightboxCloseBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 8 },
  lightboxCloseText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  lightboxTitle: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center', marginHorizontal: 8 },
  lightboxBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxImageWrap: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxHint: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
});
