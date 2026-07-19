import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import {
  VALORIA_GOOGLE_PLAY_URL,
  appStorePromoCopy,
  valoriaAppStoreUrl,
} from '@/constants/appStoreLinks';
import { buildPublicComplaintUrl } from '@/lib/appPublicUrl';
import { buildPublicSikayetDocumentUrl } from '@/lib/sikayetPortalUrl';
import { fetchPublicStaffProfile, type PublicStaffProfile } from '@/lib/publicStaffProfile';
import {
  fetchPublicComplaintResponsible,
  type PublicComplaintResponsible,
} from '@/lib/publicComplaintResponsible';

const C = {
  bg: '#0c1222',
  card: '#141c2e',
  gold: '#c9a227',
  text: '#f8fafc',
  muted: '#94a3b8',
  border: 'rgba(201,162,39,0.28)',
};

export default function PublicStaffProfileScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicStaffProfile | null>(null);
  const [meta, setMeta] = useState<PublicComplaintResponsible | null>(null);
  const [loading, setLoading] = useState(true);
  const [lang] = useState(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
      const code = (navigator.language || 'tr').slice(0, 2).toLowerCase();
      return ['tr', 'en', 'ar'].includes(code) ? code : 'tr';
    }
    return 'tr';
  });

  const copy = useMemo(() => {
    const map = {
      tr: {
        kicker: 'Otel sorumlusu',
        notFound: 'Profil bulunamadı',
        notFoundBody: 'Bu bağlantı geçersiz veya profil yayında değil.',
        complain: 'Şikayet et',
        complainHint: 'Yemek, ödeme, personel… mesaj yazın, fotoğraf ekleyin. Giriş gerekmez.',
        about: 'Hakkında',
        back: 'Geri',
        openApp: 'Valoria uygulaması',
      },
      en: {
        kicker: 'Hotel manager',
        notFound: 'Profile not found',
        notFoundBody: 'This link is invalid or the profile is not public.',
        complain: 'File a complaint',
        complainHint: 'Food, payment, staff… write a message, add photos. No login needed.',
        about: 'About',
        back: 'Back',
        openApp: 'Valoria app',
      },
      ar: {
        kicker: 'مسؤول الفندق',
        notFound: 'الملف غير موجود',
        notFoundBody: 'هذا الرابط غير صالح أو الملف غير متاح.',
        complain: 'قدّم شكوى',
        complainHint: 'طعام، دفع، موظفون… اكتب رسالة وأضف صوراً. بدون تسجيل دخول.',
        about: 'نبذة',
        back: 'رجوع',
        openApp: 'تطبيق Valoria',
      },
    } as const;
    return map[lang as keyof typeof map] ?? map.tr;
  }, [lang]);

  const promo = useMemo(() => appStorePromoCopy(lang), [lang]);

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [p, m] = await Promise.all([
      fetchPublicStaffProfile(id),
      fetchPublicComplaintResponsible(),
    ]);
    setProfile(p);
    setMeta(m);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && id) {
      const path = `/profil/${encodeURIComponent(id)}`;
      if (!window.location.pathname.includes(path)) {
        window.history.replaceState(null, '', path);
      }
    }
  }, [id]);

  const openComplaint = () => {
    const url =
      Platform.OS === 'web'
        ? buildPublicSikayetDocumentUrl()
        : buildPublicComplaintUrl();
    Linking.openURL(url).catch(() => {});
  };

  const openUrl = (url: string) => Linking.openURL(url).catch(() => {});

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40 }]}>
        <ActivityIndicator color={C.gold} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
          <Text style={styles.backText}>{copy.back}</Text>
        </TouchableOpacity>
        <Text style={styles.notFoundTitle}>{copy.notFound}</Text>
        <Text style={styles.notFoundBody}>{copy.notFoundBody}</Text>
      </View>
    );
  }

  const displayName = meta?.staffId === profile.id && meta.name ? meta.name : profile.full_name;
  const title =
    meta?.staffId === profile.id && meta.title
      ? meta.title
      : profile.position || profile.department || copy.kicker;
  const note = meta?.staffId === profile.id ? meta.note : null;
  const photo = meta?.photoUrl || profile.profile_image;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={C.text} />
          <Text style={styles.backText}>{copy.back}</Text>
        </TouchableOpacity>

        <LinearGradient colors={['#1a2236', '#0c1222']} style={styles.hero}>
          {profile.cover_image ? (
            <CachedImage uri={profile.cover_image} style={styles.cover} contentFit="cover" />
          ) : null}
          <View style={styles.heroOverlay}>
            {photo ? (
              <CachedImage uri={photo} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPh]}>
                <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <Text style={styles.kicker}>{copy.kicker}</Text>
            <Text style={styles.name}>{displayName}</Text>
            <Text style={styles.title}>{title}</Text>
            {meta?.brands ? <Text style={styles.brands}>{meta.brands}</Text> : null}
            {note ? <Text style={styles.note}>{note}</Text> : null}
          </View>
        </LinearGradient>

        {profile.bio ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{copy.about}</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        <TouchableOpacity style={styles.complainBtn} onPress={openComplaint} activeOpacity={0.88}>
          <Ionicons name="chatbubble-ellipses-outline" size={20} color="#0c1222" />
          <View style={{ flex: 1 }}>
            <Text style={styles.complainTitle}>{copy.complain}</Text>
            <Text style={styles.complainHint}>{copy.complainHint}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#0c1222" />
        </TouchableOpacity>

        <View style={styles.appCard}>
          <Text style={styles.appBadge}>{promo.badge}</Text>
          <Text style={styles.appTitle}>{promo.title}</Text>
          <Text style={styles.appSub}>{promo.subtitle}</Text>
          <View style={styles.storeRow}>
            <TouchableOpacity
              style={styles.storeBtn}
              onPress={() => openUrl(valoriaAppStoreUrl(lang))}
              activeOpacity={0.88}
            >
              <Ionicons name="logo-apple" size={18} color={C.text} />
              <Text style={styles.storeText}>{promo.appStore}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.storeBtn}
              onPress={() => openUrl(VALORIA_GOOGLE_PLAY_URL)}
              activeOpacity={0.88}
            >
              <Ionicons name="logo-google-playstore" size={18} color={C.text} />
              <Text style={styles.storeText}>{promo.playStore}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  scroll: { width: '100%', maxWidth: 520, paddingHorizontal: 20, alignSelf: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, marginTop: 8 },
  backText: { color: C.text, fontWeight: '600', fontSize: 15 },
  hero: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 16,
    minHeight: 220,
  },
  cover: { ...StyleSheet.absoluteFillObject, opacity: 0.35 },
  heroOverlay: { padding: 24, alignItems: 'center' },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: C.gold,
    marginBottom: 12,
  },
  avatarPh: {
    backgroundColor: '#1e2a42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 32, fontWeight: '800', color: C.gold },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  name: { fontSize: 26, fontWeight: '800', color: C.text, textAlign: 'center' },
  title: { fontSize: 14, color: C.muted, marginTop: 4, textAlign: 'center', fontWeight: '600' },
  brands: { fontSize: 12, color: C.muted, marginTop: 6, textAlign: 'center' },
  note: {
    fontSize: 13,
    color: 'rgba(248,250,252,0.85)',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 19,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 14,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  bio: { fontSize: 14, color: C.text, lineHeight: 21 },
  complainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.gold,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  complainTitle: { fontSize: 16, fontWeight: '800', color: '#0c1222' },
  complainHint: { fontSize: 12, color: 'rgba(12,18,34,0.75)', marginTop: 2, lineHeight: 16 },
  appCard: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  appBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: C.gold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  appTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  appSub: { fontSize: 13, color: C.muted, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  storeRow: { flexDirection: 'row', gap: 10 },
  storeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1e2a42',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  storeText: { color: C.text, fontWeight: '700', fontSize: 13 },
  notFoundTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginTop: 24 },
  notFoundBody: { fontSize: 14, color: C.muted, marginTop: 8, lineHeight: 20 },
});
