import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Linking,
  Platform,
  Image,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  VALORIA_GOOGLE_PLAY_URL,
  appStorePromoCopy,
  valoriaAppStoreUrl,
} from '@/constants/appStoreLinks';
import { buildPublicComplaintUrl, buildPublicStaffProfileUrl } from '@/lib/appPublicUrl';
import { buildPublicSikayetDocumentUrl } from '@/lib/sikayetPortalUrl';
import {
  fetchPublicComplaintResponsible,
  type PublicComplaintResponsible,
} from '@/lib/publicComplaintResponsible';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

/** Otel sorumlusu WhatsApp hattı */
export const HOTEL_MANAGER_WHATSAPP_E164 = '905330483061';

export function hotelManagerWhatsAppUrl(prefill?: string): string {
  const text = prefill?.trim() ? `?text=${encodeURIComponent(prefill.trim())}` : '';
  return `https://wa.me/${HOTEL_MANAGER_WHATSAPP_E164}${text}`;
}

type Props = {
  organizationId?: string | null;
  menuLang: PublicMenuLang;
  accentColor?: string;
  navyColor?: string;
  /** Header icon colors */
  iconBorderColor?: string;
  iconColor?: string;
};

const appLogo = require('../../assets/icon.png');

export function PublicKitchenMenuGuestMenuButton({
  organizationId,
  menuLang,
  accentColor = menuUi.accent,
  navyColor = menuUi.navy,
  iconBorderColor = 'rgba(15,23,42,0.12)',
  iconColor = menuUi.navy,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [resp, setResp] = useState<PublicComplaintResponsible | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicComplaintResponsible().then((r) => {
      if (!cancelled) setResp(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const promo = useMemo(() => appStorePromoCopy(menuLang), [menuLang]);
  const appleUrl = useMemo(() => valoriaAppStoreUrl(menuLang), [menuLang]);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const openComplaint = (category?: string) => {
    setOpen(false);
    const url =
      Platform.OS === 'web'
        ? buildPublicSikayetDocumentUrl({
            organizationId,
            search: category ? `category=${encodeURIComponent(category)}` : undefined,
          })
        : buildPublicComplaintUrl({ organizationId, category });
    openUrl(url);
  };

  const openProfile = () => {
    setOpen(false);
    if (!resp?.staffId) {
      openComplaint();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = buildPublicStaffProfileUrl(resp.staffId);
      return;
    }
    openUrl(buildPublicStaffProfileUrl(resp.staffId));
  };

  const openWhatsApp = () => {
    setOpen(false);
    const name = resp?.name || 'Soner';
    openUrl(
      hotelManagerWhatsAppUrl(
        menuLang === 'en'
          ? `Hello ${name}, I am writing from the Valoria menu.`
          : menuLang === 'ar'
            ? `مرحباً ${name}، أكتب من قائمة Valoria.`
            : `Merhaba ${name}, Valoria menüden yazıyorum.`
      )
    );
  };

  const name = resp?.name || 'Soner';
  const title = resp?.title || t('publicMenuManagerTitle');
  const photo = resp?.photoUrl;

  return (
    <>
      <TouchableOpacity
        style={[styles.iconBtn, { borderColor: iconBorderColor }]}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        accessibilityLabel={t('publicMenuGuestMenu')}
      >
        <Ionicons name="menu-outline" size={20} color={iconColor} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{t('publicMenuGuestMenu')}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={menuUi.webMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.managerRow} onPress={openProfile} activeOpacity={0.88}>
                {photo ? (
                  <CachedImage uri={photo} style={styles.avatar} contentFit="cover" />
                ) : (
                  <View style={[styles.avatar, styles.avatarPh, { backgroundColor: `${accentColor}22` }]}>
                    <Text style={[styles.avatarLetter, { color: accentColor }]}>{name.charAt(0)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.kicker, { color: accentColor }]}>{title}</Text>
                  <Text style={styles.name}>{name}</Text>
                  <Text style={styles.profileLink}>{t('publicMenuViewProfile')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={menuUi.webMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={[styles.waBtn]} onPress={openWhatsApp} activeOpacity={0.9}>
                <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.waTitle}>{t('publicMenuWhatsApp')}</Text>
                  <Text style={styles.waSub}>+90 533 048 30 61</Text>
                </View>
                <Ionicons name="open-outline" size={16} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: navyColor }]}
                onPress={() => openComplaint()}
                activeOpacity={0.9}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{t('publicMenuComplainCta')}</Text>
              </TouchableOpacity>

              <View style={styles.quickRow}>
                <TouchableOpacity style={styles.quickChip} onPress={() => openComplaint('food')}>
                  <Text style={styles.quickChipText}>{t('publicMenuCatFood')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => openComplaint('payment')}>
                  <Text style={styles.quickChipText}>{t('publicMenuCatPayment')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.quickChip} onPress={() => openComplaint('other')}>
                  <Text style={styles.quickChipText}>{t('publicMenuCatOther')}</Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.appsCard, { borderColor: `${accentColor}33` }]}>
                <View style={styles.appsHead}>
                  <Image source={appLogo} style={styles.appLogo} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.appsBadge, { color: accentColor }]}>{promo.badge}</Text>
                    <Text style={styles.appsTitle}>{promo.title}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.storeBtn, { backgroundColor: navyColor }]}
                  onPress={() => {
                    setOpen(false);
                    openUrl(appleUrl);
                  }}
                >
                  <Ionicons name="logo-apple" size={16} color="#fff" />
                  <Text style={styles.storeBtnText}>{promo.appStore}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.storeBtnAlt}
                  onPress={() => {
                    setOpen(false);
                    openUrl(VALORIA_GOOGLE_PLAY_URL);
                  }}
                >
                  <Ionicons name="logo-google-playstore" size={16} color={navyColor} />
                  <Text style={[styles.storeBtnText, { color: navyColor }]}>{promo.playStore}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Platform.OS === 'web' ? 'rgba(255,255,255,0.06)' : 'transparent',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'web' ? 72 : 56,
    paddingHorizontal: 14,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    overflow: 'hidden',
    zIndex: 2,
    ...menuUi.shadowLg,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: menuUi.webText },
  sheetScroll: { padding: 14 },
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    marginBottom: 12,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 18, fontWeight: '800' },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  name: { fontSize: 16, fontWeight: '800', color: menuUi.webText, marginTop: 2 },
  profileLink: { fontSize: 11, fontWeight: '700', color: menuUi.accent, marginTop: 2 },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  waTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  waSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600', marginTop: 1 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    marginBottom: 10,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  quickChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  quickChipText: { fontSize: 12, fontWeight: '700', color: menuUi.webMuted },
  appsCard: {
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    backgroundColor: menuUi.warmBg,
    marginBottom: 8,
  },
  appsHead: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 },
  appLogo: { width: 32, height: 32, borderRadius: 8 },
  appsBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  appsTitle: { fontSize: 13, fontWeight: '800', color: menuUi.webText },
  storeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 11,
    paddingVertical: 11,
    marginBottom: 8,
  },
  storeBtnAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 11,
    paddingVertical: 11,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  storeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
