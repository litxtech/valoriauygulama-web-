import { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  useWindowDimensions,
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
  onCommentsPress?: () => void;
  commentsCount?: number;
};

/**
 * Compact header accessories: comments + complaint + store icons.
 * Responsive chips for small phones.
 */
export function PublicKitchenMenuHeaderExtras({
  organizationId,
  menuLang,
  tokens,
  onCommentsPress,
  commentsCount = 0,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const appleUrl = useMemo(() => valoriaAppStoreUrl(menuLang), [menuLang]);
  const narrow = width < 380;

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
      {onCommentsPress ? (
        <TouchableOpacity
          style={[styles.chipBtn, { borderColor: tokens.border, backgroundColor: tokens.bgGlass }]}
          onPress={onCommentsPress}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('guestBookBtn')}
        >
          <Ionicons name="chatbubbles-outline" size={12} color={tokens.accent} />
          <Text style={[styles.chipText, { color: tokens.text }]} numberOfLines={1}>
            {narrow ? t('guestBookBtnShort') : t('guestBookBtn')}
          </Text>
          {commentsCount > 0 ? (
            <View style={[styles.countBadge, { backgroundColor: tokens.accent }]}>
              <Text style={styles.countText}>{commentsCount > 99 ? '99+' : commentsCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={[styles.chipBtn, { borderColor: tokens.border, backgroundColor: tokens.bgGlass }]}
        onPress={openComplaint}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('publicMenuComplainShort')}
      >
        <Ionicons name="chatbubble-ellipses-outline" size={12} color={tokens.accent} />
        <Text style={[styles.chipText, { color: tokens.text }]} numberOfLines={1}>
          {narrow ? t('publicMenuComplainTiny') : t('publicMenuComplainShort')}
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
    flexWrap: 'wrap',
    gap: 6,
    maxWidth: '100%',
  },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  countBadge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginLeft: 1,
  },
  countText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
