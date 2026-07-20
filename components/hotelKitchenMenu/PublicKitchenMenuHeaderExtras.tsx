import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { VALORIA_GOOGLE_PLAY_URL, valoriaAppStoreUrl } from '@/constants/appStoreLinks';
import { buildPublicComplaintUrl } from '@/lib/appPublicUrl';
import { buildPublicSikayetDocumentUrl } from '@/lib/sikayetPortalUrl';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  organizationId?: string | null;
  menuLang: PublicMenuLang;
  tokens: RestaurantTokens;
};

/**
 * Compact header accessories: complaint + store icons next to hotel name.
 * Kept small so the hero stays clean.
 */
export function PublicKitchenMenuHeaderExtras({ organizationId, menuLang, tokens }: Props) {
  const { t } = useTranslation();
  const appleUrl = useMemo(() => valoriaAppStoreUrl(menuLang), [menuLang]);

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const openComplaint = () => {
    const url =
      Platform.OS === 'web'
        ? buildPublicSikayetDocumentUrl({ organizationId })
        : buildPublicComplaintUrl({ organizationId });
    openUrl(url);
  };

  return (
    <View style={styles.row} {...(Platform.OS === 'web' ? ({ dir: 'ltr' } as object) : null)}>
      <TouchableOpacity
        style={[styles.complainBtn, { borderColor: tokens.border, backgroundColor: tokens.bgGlass }]}
        onPress={openComplaint}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('publicMenuComplainShort')}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={12} color={tokens.accent} />
        <Text style={[styles.complainText, { color: tokens.text }]} numberOfLines={1}>
          {t('publicMenuComplainShort')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconChip, { borderColor: tokens.border, backgroundColor: tokens.bgGlass }]}
        onPress={() => openUrl(appleUrl)}
        activeOpacity={0.85}
        accessibilityRole="link"
        accessibilityLabel="App Store"
      >
        <Ionicons name="logo-apple" size={14} color={tokens.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.iconChip, { borderColor: tokens.border, backgroundColor: tokens.bgGlass }]}
        onPress={() => openUrl(VALORIA_GOOGLE_PLAY_URL)}
        activeOpacity={0.85}
        accessibilityRole="link"
        accessibilityLabel="Google Play"
      >
        <Ionicons name="logo-google-playstore" size={13} color={tokens.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
    maxWidth: '52%',
  },
  complainBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 128,
  },
  complainText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
