import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useLocalSearchParams } from 'expo-router';
import { TechAssetUsageGuide } from '@/components/technicalAssets/TechAssetUsageGuide';
import { parsePublicTechAssetTokenFromLocation } from '@/lib/publicWebRoute';
import {
  buildPublicTechAssetUrl,
  fetchPublicTechAsset,
  normalizePhotoUrls,
  type PublicTechAsset,
} from '@/lib/technicalAssets';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readParamToken(raw: string | string[] | undefined): string {
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) return (raw[0] ?? '').trim();
  return '';
}

export default function PublicTechAssetPage() {
  const { token } = useLocalSearchParams<{ token?: string | string[] }>();
  const [asset, setAsset] = useState<PublicTechAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const publicToken = useMemo(() => {
    const fromParams = readParamToken(token);
    if (fromParams) return fromParams;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
    return parsePublicTechAssetTokenFromLocation(window.location.pathname, window.location.search);
  }, [token]);

  const load = useCallback(async () => {
    const value = publicToken.trim();
    if (!value) {
      setError('QR bağlantısı geçersiz.');
      setAsset(null);
      return;
    }
    if (!UUID_RE.test(value)) {
      setError('QR bağlantısı geçersiz.');
      setAsset(null);
      return;
    }
    const result = await fetchPublicTechAsset(value);
    setAsset(result.data);
    setError(result.error ?? (result.data ? null : 'Bu bilgi sayfası yayında değil veya bulunamadı.'));
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
    if (!asset) return;
    const url =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.location.href
        : buildPublicTechAssetUrl(publicToken);
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const webNavigator = navigator as Navigator & {
        share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
      };
      if (typeof webNavigator.share === 'function') {
        await webNavigator.share({
          title: asset.name,
          text: `${asset.name} — Valoria Hotel bilgi sayfası`,
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
      title: asset.name,
      message: `${asset.name}\n${url}`,
      url,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0f766e" />
        <Text style={styles.loadingText}>Bilgiler yükleniyor…</Text>
      </View>
    );
  }

  if (!asset || error) {
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

  const photos = normalizePhotoUrls(asset.photo_urls);
  const location = [asset.building_name, asset.location_name].filter(Boolean).join(' / ');

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
          <Text style={styles.brandSub}>Ürün ve ekipman bilgi sistemi</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.category}>{asset.category_label}</Text>
        <Text style={styles.title}>{asset.name}</Text>
        {asset.label_tagline ? <Text style={styles.tagline}>{asset.label_tagline}</Text> : null}
        <View style={styles.metaRow}>
          <View style={styles.codePill}>
            <Ionicons name="barcode-outline" size={16} color="#0f766e" />
            <Text style={styles.code}>{asset.asset_code}</Text>
          </View>
          {location ? (
            <View style={styles.locationPill}>
              <Ionicons name="location-outline" size={16} color="#475569" />
              <Text style={styles.location}>{location}</Text>
            </View>
          ) : null}
        </View>
        <TouchableOpacity style={styles.shareButton} onPress={() => void sharePage()} activeOpacity={0.85}>
          <Ionicons name={linkCopied ? 'checkmark-circle-outline' : 'share-social-outline'} size={19} color="#fff" />
          <Text style={styles.shareButtonText}>{linkCopied ? 'Bağlantı kopyalandı' : 'URL’yi paylaş'}</Text>
        </TouchableOpacity>
      </View>

      {asset.usage_guide_video_url?.trim() || photos.length ? (
        <View style={styles.mediaSection}>
          <Text style={styles.mediaHeading}>Video ve görseller</Text>
          {asset.usage_guide_video_url?.trim() ? (
            <TechAssetUsageGuide text={null} videoUrl={asset.usage_guide_video_url} clean />
          ) : null}
          {photos.length ? (
            <View style={styles.photoList}>
              {photos.map((uri, index) => (
                <View key={uri} style={styles.photoFrame}>
                  <Image source={{ uri }} style={styles.photo} resizeMode="contain" />
                  {photos.length > 1 ? (
                    <Text style={styles.photoCount}>{index + 1} / {photos.length}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.textSection}>
        <Text style={styles.textHeading}>Bilgiler</Text>
        <InfoSection icon="school-outline" title="Kullanım talimatı" body={asset.usage_guide_text} />
      <InfoSection icon="information-circle-outline" title="Hakkında" body={asset.description} />
      <InfoSection icon="construct-outline" title="Ne işe yarar?" body={asset.function_text} />
      <InfoSection icon="warning-outline" title="Uyarılar" body={asset.warning_text} warning />
      </View>

      <Text style={styles.updated}>
        Son güncelleme: {new Date(asset.updated_at).toLocaleDateString('tr-TR')}
      </Text>
      <Text style={styles.footer}>Bu sayfa Valoria Hotel QR bilgi sistemi tarafından sunulmaktadır.</Text>
    </ScrollView>
  );
}

function InfoSection({
  icon,
  title,
  body,
  warning = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string | null;
  warning?: boolean;
}) {
  if (!body?.trim()) return null;
  return (
    <View style={[styles.section, warning && styles.warningSection]}>
      <View style={styles.sectionTitleRow}>
        <Ionicons name={icon} size={21} color={warning ? '#b45309' : '#0f766e'} />
        <Text style={[styles.sectionTitle, warning && styles.warningTitle]}>{title}</Text>
      </View>
      <Text style={styles.sectionBody}>{body.trim()}</Text>
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
  hero: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  category: { color: '#0f766e', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: '#0f172a', fontSize: 28, lineHeight: 34, fontWeight: '900', marginTop: 7 },
  tagline: { color: '#475569', fontSize: 16, lineHeight: 23, marginTop: 9 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 17 },
  shareButton: {
    marginTop: 18,
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
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  code: { color: '#0f766e', fontWeight: '800', fontSize: 12 },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  location: { color: '#475569', fontWeight: '700', fontSize: 12, flexShrink: 1 },
  mediaSection: { marginTop: 20 },
  mediaHeading: { color: '#0f172a', fontSize: 19, fontWeight: '900', marginBottom: 12 },
  photoList: { gap: 14, marginTop: 14 },
  photoFrame: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  photo: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#f8fafc' },
  photoCount: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    color: '#fff',
    backgroundColor: 'rgba(15,23,42,0.72)',
    fontSize: 11,
    fontWeight: '800',
  },
  textSection: { marginTop: 24 },
  textHeading: { color: '#0f172a', fontSize: 19, fontWeight: '900', marginBottom: 2 },
  section: {
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 17,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  warningSection: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9 },
  sectionTitle: { color: '#0f766e', fontSize: 16, fontWeight: '900' },
  warningTitle: { color: '#b45309' },
  sectionBody: { color: '#334155', fontSize: 15, lineHeight: 23 },
  updated: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 28 },
  footer: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 7 },
});
