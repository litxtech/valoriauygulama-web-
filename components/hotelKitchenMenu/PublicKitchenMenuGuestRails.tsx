import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  Image,
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
import { hotelManagerWhatsAppUrl } from '@/components/hotelKitchenMenu/PublicKitchenMenuGuestMenuButton';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  organizationId?: string | null;
  menuLang: PublicMenuLang;
  accentColor?: string;
  navyColor?: string;
  /** compact = mobile strip; sidebar = complaint+apps; complaint = manager only; apps-only */
  variant?: 'sidebar' | 'compact' | 'apps-only' | 'complaint';
};

const appLogo = require('../../assets/icon.png');

export function PublicKitchenMenuGuestRails({
  organizationId,
  menuLang,
  accentColor = menuUi.accent,
  navyColor = menuUi.navy,
  variant = 'sidebar',
}: Props) {
  const { t } = useTranslation();
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

  if (variant === 'apps-only') {
    return (
      <View style={[styles.appsCard, { borderColor: `${accentColor}33` }]}>
        <View style={styles.appsHead}>
          <Image source={appLogo} style={styles.appLogo} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.appsBadge, { color: accentColor }]}>{promo.badge}</Text>
            <Text style={styles.appsTitle}>{promo.title}</Text>
          </View>
        </View>
        <Text style={styles.appsSub}>{promo.subtitle}</Text>
        <TouchableOpacity
          style={[styles.storeBtn, { backgroundColor: navyColor }]}
          onPress={() => openUrl(appleUrl)}
          activeOpacity={0.88}
        >
          <Ionicons name="logo-apple" size={16} color="#fff" />
          <Text style={styles.storeBtnText}>{promo.appStore}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.storeBtn, styles.storeBtnAlt]}
          onPress={() => openUrl(VALORIA_GOOGLE_PLAY_URL)}
          activeOpacity={0.88}
        >
          <Ionicons name="logo-google-playstore" size={16} color={navyColor} />
          <Text style={[styles.storeBtnText, { color: navyColor }]}>{promo.playStore}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = resp?.name || 'Soner';
  const title = resp?.title || t('publicMenuManagerTitle');
  const note = resp?.note || t('publicMenuComplaintNote');
  const photo = resp?.photoUrl;

  const complaintBlock = (
    <View style={[styles.managerCard, { borderColor: `${accentColor}33` }]}>
      <Text style={[styles.sectionLabel, { color: accentColor }]}>
        {t('publicMenuComplaintLine')}
      </Text>
      <TouchableOpacity style={styles.managerRow} onPress={openProfile} activeOpacity={0.88}>
        {photo ? (
          <CachedImage uri={photo} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarPh, { backgroundColor: `${accentColor}22` }]}>
            <Text style={[styles.avatarLetter, { color: accentColor }]}>{name.charAt(0)}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.managerTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.managerName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.profileLink}>{t('publicMenuViewProfile')}</Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.note}>{note}</Text>
      <Text style={styles.hint}>{t('publicMenuComplaintHint')}</Text>

      <TouchableOpacity style={styles.waBtn} onPress={openWhatsApp} activeOpacity={0.9}>
        <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        <Text style={styles.waBtnText}>{t('publicMenuWhatsApp')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: navyColor }]}
        onPress={() => openComplaint()}
        activeOpacity={0.9}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
        <Text style={styles.ctaText}>{t('publicMenuComplainCta')}</Text>
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
    </View>
  );

  const appsBlock = (
    <View style={[styles.appsCard, { borderColor: `${accentColor}33` }]}>
      <View style={styles.appsHead}>
        <Image source={appLogo} style={styles.appLogo} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.appsBadge, { color: accentColor }]}>{promo.badge}</Text>
          <Text style={styles.appsTitle}>{promo.title}</Text>
        </View>
      </View>
      <Text style={styles.appsSub}>{promo.subtitle}</Text>
      <TouchableOpacity
        style={[styles.storeBtn, { backgroundColor: navyColor }]}
        onPress={() => openUrl(appleUrl)}
        activeOpacity={0.88}
      >
        <Ionicons name="logo-apple" size={16} color="#fff" />
        <Text style={styles.storeBtnText}>{promo.appStore}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.storeBtn, styles.storeBtnAlt]}
        onPress={() => openUrl(VALORIA_GOOGLE_PLAY_URL)}
        activeOpacity={0.88}
      >
        <Ionicons name="logo-google-playstore" size={16} color={navyColor} />
        <Text style={[styles.storeBtnText, { color: navyColor }]}>{promo.playStore}</Text>
      </TouchableOpacity>
    </View>
  );

  if (variant === 'compact') {
    return (
      <View style={styles.compactWrap}>
        <View style={[styles.compactCard, { borderColor: `${accentColor}40` }]}>
          <TouchableOpacity onPress={openProfile} activeOpacity={0.85} hitSlop={6}>
            {photo ? (
              <CachedImage uri={photo} style={styles.compactAvatar} contentFit="cover" />
            ) : (
              <View style={[styles.compactAvatar, styles.avatarPh, { backgroundColor: `${accentColor}22` }]}>
                <Text style={[styles.avatarLetter, { color: accentColor }]}>{name.charAt(0)}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, minWidth: 0 }}
            onPress={() => openComplaint()}
            activeOpacity={0.9}
          >
            <Text style={styles.compactKicker}>{t('publicMenuComplainCta')}</Text>
            <Text style={styles.compactName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.compactHint} numberOfLines={2}>
              {t('publicMenuComplaintHint')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openComplaint()} hitSlop={8}>
            <Ionicons name="chevron-forward" size={18} color={accentColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.compactApps}>
          <TouchableOpacity style={styles.compactStore} onPress={() => openUrl(appleUrl)}>
            <Ionicons name="logo-apple" size={14} color={navyColor} />
            <Text style={[styles.compactStoreText, { color: navyColor }]}>App Store</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.compactStore}
            onPress={() => openUrl(VALORIA_GOOGLE_PLAY_URL)}
          >
            <Ionicons name="logo-google-playstore" size={14} color={navyColor} />
            <Text style={[styles.compactStoreText, { color: navyColor }]}>Google Play</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (variant === 'complaint') {
    return <View style={styles.sidebarStack}>{complaintBlock}</View>;
  }

  return (
    <View style={styles.sidebarStack}>
      {complaintBlock}
      {appsBlock}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarStack: { marginTop: 20, gap: 14 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  managerCard: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    ...menuUi.shadowSm,
  },
  managerRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarPh: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 20, fontWeight: '800' },
  managerTitle: { fontSize: 11, fontWeight: '700', color: menuUi.webMuted, lineHeight: 15 },
  managerName: { fontSize: 16, fontWeight: '800', color: menuUi.webText, marginTop: 2 },
  profileLink: {
    fontSize: 11,
    fontWeight: '700',
    color: menuUi.accent,
    marginTop: 3,
  },
  note: {
    fontSize: 12,
    color: menuUi.webMuted,
    lineHeight: 17,
    marginTop: 10,
  },
  hint: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 15,
    marginTop: 6,
  },
  waBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
    backgroundColor: '#25D366',
  },
  waBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  quickChipText: { fontSize: 11, fontWeight: '700', color: menuUi.webMuted },
  appsCard: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    ...menuUi.shadowSm,
  },
  appsHead: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 6 },
  appLogo: { width: 36, height: 36, borderRadius: 10 },
  appsBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  appsTitle: { fontSize: 13, fontWeight: '800', color: menuUi.webText, marginTop: 1 },
  appsSub: { fontSize: 11, color: menuUi.webMuted, lineHeight: 15, marginBottom: 10 },
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
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: menuUi.border,
    marginBottom: 0,
  },
  storeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  compactWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 8 },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    ...menuUi.shadowSm,
  },
  compactAvatar: { width: 48, height: 48, borderRadius: 24 },
  compactKicker: {
    fontSize: 10,
    fontWeight: '800',
    color: menuUi.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactName: { fontSize: 15, fontWeight: '800', color: menuUi.webText, marginTop: 1 },
  compactHint: { fontSize: 11, color: menuUi.webMuted, marginTop: 2, lineHeight: 14 },
  compactApps: { flexDirection: 'row', gap: 8 },
  compactStore: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: menuUi.cardBg,
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  compactStoreText: { fontSize: 12, fontWeight: '700' },
});
