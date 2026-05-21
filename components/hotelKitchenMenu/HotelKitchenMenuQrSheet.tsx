import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '@/constants/theme';
import { DesignableQR, type QRCodeRef } from '@/components/DesignableQR';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { buildPublicKitchenMenuUrl, fetchOrganizationSlugById } from '@/lib/publicKitchenMenu';

type Props = {
  visible: boolean;
  organizationId: string | null | undefined;
  organizationName?: string | null;
  onClose: () => void;
};

export function HotelKitchenMenuQrSheet({ visible, organizationId, organizationName, onClose }: Props) {
  const { t } = useTranslation();
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qrRef, setQrRef] = useState<QRCodeRef>(null);

  useEffect(() => {
    if (!visible || !organizationId) return;
    let active = true;
    setLoading(true);
    fetchOrganizationSlugById(organizationId)
      .then((s) => {
        if (active) setSlug(s);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, organizationId]);

  const menuUrl = slug ? buildPublicKitchenMenuUrl(slug) : null;

  const copyUrl = async () => {
    if (!menuUrl) return;
    await Clipboard.setStringAsync(menuUrl);
    Alert.alert(t('publicKitchenMenuQrCopiedTitle'), t('publicKitchenMenuQrCopiedBody'));
  };

  const shareQr = useCallback(() => {
    if (!qrRef?.toDataURL || !menuUrl) {
      if (Platform.OS === 'web') Alert.alert(t('info'), t('qrDownloadWebRightClick'));
      return;
    }
    qrRef.toDataURL(async (data: string) => {
      try {
        const base64 = data.startsWith('data:') ? data.replace(/^data:image\/\w+;base64,/, '') : data;
        const path = `${FileSystem.cacheDirectory}menu-qr-${Date.now()}.png`;
        await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: t('publicKitchenMenuQrShare') });
        } else {
          Alert.alert(t('saved'), path);
        }
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('qrDownloadFailed'));
      }
    });
  }, [qrRef, menuUrl, t]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t('publicKitchenMenuQrTitle')}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={28} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sub}>{t('publicKitchenMenuQrSub')}</Text>
          {organizationName ? <Text style={styles.orgName}>{organizationName}</Text> : null}

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 32 }} color={menuUi.accent} />
          ) : !menuUrl ? (
            <Text style={styles.err}>{t('publicKitchenMenuQrNoSlug')}</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
              <View style={styles.qrWrap}>
                <DesignableQR value={menuUrl} size={220} getRef={setQrRef} />
              </View>
              <Text style={styles.urlLabel}>{t('publicKitchenMenuQrUrlLabel')}</Text>
              <Text selectable style={styles.url}>
                {menuUrl}
              </Text>
              <Text style={styles.hint}>{t('publicKitchenMenuQrHint')}</Text>

              <TouchableOpacity style={styles.btn} onPress={copyUrl} activeOpacity={0.88}>
                <Ionicons name="copy-outline" size={20} color="#fff" />
                <Text style={styles.btnText}>{t('publicKitchenMenuQrCopy')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={shareQr} activeOpacity={0.88}>
                <Ionicons name="share-outline" size={20} color={menuUi.accentDeep} />
                <Text style={[styles.btnText, styles.btnTextOutline]}>{t('publicKitchenMenuQrShare')}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: menuUi.warmBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  sub: { fontSize: 14, color: theme.colors.textSecondary, paddingHorizontal: 20, marginTop: 8, lineHeight: 20 },
  orgName: { fontSize: 16, fontWeight: '700', color: menuUi.accentDeep, paddingHorizontal: 20, marginTop: 6 },
  body: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 },
  qrWrap: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 20,
    ...menuUi.shadow,
  },
  urlLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 16, alignSelf: 'flex-start' },
  url: { fontSize: 13, color: theme.colors.text, marginTop: 4, alignSelf: 'stretch', lineHeight: 18 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 10, textAlign: 'center', lineHeight: 17 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: menuUi.accent,
  },
  btnOutline: { backgroundColor: menuUi.cardBg, borderWidth: 2, borderColor: menuUi.accent },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnTextOutline: { color: menuUi.accentDeep },
  err: { textAlign: 'center', color: theme.colors.error, margin: 24 },
});
