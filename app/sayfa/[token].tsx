import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Video, ResizeMode } from 'expo-av';
import { useLocalSearchParams } from 'expo-router';
import { parsePublicQrPageTokenFromLocation } from '@/lib/publicWebRoute';
import {
  buildPublicQrPageUrl,
  fetchPublicQrPage,
  type PublicQrPage,
  type PublicQrPageBlock,
} from '@/lib/qrPages';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readParamToken(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return (raw[0] ?? '').trim();
  return '';
}

export default function PublicQrPageScreen() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const [page, setPage] = useState<PublicQrPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const publicToken = useMemo(() => {
    const fromParams = readParamToken(token);
    if (fromParams) return fromParams;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return parsePublicQrPageTokenFromLocation(window.location.pathname, window.location.search);
  }, [token]);

  const load = useCallback(async () => {
    const value = publicToken.trim();
    if (!value) {
      setError('QR bağlantısı geçersiz.');
      setPage(null);
      return;
    }
    if (!UUID_RE.test(value)) {
      setError('QR bağlantısı geçersiz.');
      setPage(null);
      return;
    }
    const result = await fetchPublicQrPage(value);
    setPage(result.data);
    setError(result.error ?? (result.data ? null : 'Bu sayfa yayında değil veya bulunamadı.'));
  }, [publicToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void load().finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sharePage = async () => {
    if (!page) return;
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : buildPublicQrPageUrl(publicToken);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const webNavigator = navigator as Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      };
      if (typeof webNavigator.share === 'function') {
        await webNavigator.share({
          title: page.title,
          text: page.title,
          url,
        });
        return;
      }
      await Clipboard.setStringAsync(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
      return;
    }
    await Share.share({
      title: page.title,
      message: `${page.title}\n${url}`,
      url,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Sayfa yükleniyor…</Text>
      </View>
    );
  }

  if (!page || error) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIcon}>
          <Ionicons name="qr-code-outline" size={42} color="#b45309" />
        </View>
        <Text style={styles.errorTitle}>İçerik açılamadı</Text>
        <Text style={styles.errorText}>{error ?? 'Kayıt bulunamadı.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <View style={styles.brand}>
        <View style={styles.brandMark}>
          <Text style={styles.brandLetter}>V</Text>
        </View>
        <View>
          <Text style={styles.brandName}>VALORIA HOTEL</Text>
          <Text style={styles.brandSub}>QR sayfa</Text>
        </View>
      </View>

      <Text style={styles.title}>{page.title}</Text>
      <TouchableOpacity style={styles.shareButton} onPress={() => void sharePage()} activeOpacity={0.85}>
        <Ionicons name={linkCopied ? 'checkmark-circle-outline' : 'share-social-outline'} size={19} color="#fff" />
        <Text style={styles.shareButtonText}>{linkCopied ? 'Bağlantı kopyalandı' : 'URL’yi paylaş'}</Text>
      </TouchableOpacity>

      <View style={styles.blocks}>
        {page.blocks.length === 0 ? (
          <Text style={styles.empty}>Bu sayfada henüz içerik yok.</Text>
        ) : (
          page.blocks.map((block) => <BlockView key={block.id} block={block} />)
        )}
      </View>

      <Text style={styles.updated}>
        Son güncelleme: {new Date(page.updated_at).toLocaleDateString('tr-TR')}
      </Text>
      <Text style={styles.footer}>Bu sayfa Valoria Hotel QR sistemi tarafından sunulmaktadır.</Text>
    </ScrollView>
  );
}

function BlockView({ block }: { block: PublicQrPageBlock }) {
  if (block.block_type === 'text') {
    const body = block.body?.trim();
    if (!body) return null;
    return <Text style={styles.textBlock}>{body}</Text>;
  }

  if (block.block_type === 'image') {
    const uri = block.media_url?.trim();
    if (!uri) return null;
    return (
      <View style={styles.mediaFrame}>
        <Image source={{ uri }} style={styles.photo} resizeMode="contain" />
      </View>
    );
  }

  const uri = block.media_url?.trim();
  if (!uri) return null;
  return <VideoBlock url={uri} />;
}

function VideoBlock({ url }: { url: string }) {
  const videoRef = useRef<Video>(null);
  const [ready, setReady] = useState(false);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.mediaFrame}>
        {React.createElement('video', {
          src: url,
          controls: true,
          playsInline: true,
          style: { width: '100%', aspectRatio: '16 / 9', backgroundColor: '#0f172a' },
        })}
      </View>
    );
  }

  return (
    <View style={styles.mediaFrame}>
      {!ready ? (
        <View style={styles.videoLoading}>
          <ActivityIndicator color="#0f766e" />
        </View>
      ) : null}
      <Video
        ref={videoRef}
        style={styles.video}
        source={{ uri: url }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        onLoad={() => setReady(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 48 },
  center: {
    flex: 1,
    minHeight: 480,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#f8fafc',
  },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  errorIcon: { backgroundColor: '#fffbeb', padding: 18, borderRadius: 999 },
  errorTitle: { marginTop: 18, color: '#0f172a', fontWeight: '900', fontSize: 21 },
  errorText: { marginTop: 8, color: '#64748b', textAlign: 'center', lineHeight: 21 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a365d',
  },
  brandLetter: { color: '#d4af37', fontSize: 25, fontWeight: '900' },
  brandName: { color: '#1a365d', fontSize: 14, fontWeight: '900', letterSpacing: 1.2 },
  brandSub: { color: '#64748b', fontSize: 11, marginTop: 2 },
  title: { color: '#0f172a', fontSize: 30, lineHeight: 36, fontWeight: '900' },
  shareButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: '#0f766e',
  },
  shareButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  blocks: { marginTop: 24, gap: 18 },
  empty: { color: '#64748b', fontSize: 15, lineHeight: 22 },
  textBlock: { color: '#334155', fontSize: 16, lineHeight: 25 },
  mediaFrame: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#f8fafc' },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#0f172a' },
  videoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  updated: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 28 },
  footer: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 7 },
});
