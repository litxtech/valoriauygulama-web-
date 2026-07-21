import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import { LANGUAGES, LANG_STORAGE_KEY, changeAppLanguage, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';
import { confirmDialog } from '@/lib/confirmDialog';
import { safeRouterReplace } from '@/lib/safeRouter';
import { listBlockedUsersForStaff } from '@/lib/userBlocks';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};

function MenuRow({
  icon,
  title,
  subtitle,
  onPress,
  textColor,
  borderColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  textColor: string;
  borderColor: string;
}) {
  return (
    <TouchableOpacity style={[styles.menuRow, { borderBottomColor: borderColor }]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.menuIconCircle}>
        <Ionicons name={icon} size={22} color={P.accent.blue} />
      </View>
      <View style={styles.menuRowTextCol}>
        <Text style={[styles.menuTitle, { color: textColor }]}>{title}</Text>
        {subtitle ? <Text style={styles.menuSub}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function StaffProfileAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePersonelDesign();
  const { t, i18n } = useTranslation();
  const { staff, signOut } = useAuthStore();
  const [blockedCount, setBlockedCount] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);

  const loadBlocked = useCallback(async () => {
    if (!staff?.id) return;
    try {
      const list = await listBlockedUsersForStaff(staff.id);
      setBlockedCount(list.length);
    } catch {
      setBlockedCount(0);
    }
  }, [staff?.id]);

  useEffect(() => {
    void loadBlocked();
  }, [loadBlocked]);

  const handleLanguageSelect = async (code: LangCode) => {
    await changeAppLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageModalVisible(false);
    await applyRTLAndReloadIfNeeded(code);
  };

  const handleSignOut = () => {
    void (async () => {
      const ok = await confirmDialog({
        title: t('signOut'),
        message: t('signOutConfirm'),
        cancelText: t('cancel'),
        confirmText: t('signOut'),
        destructive: true,
      });
      if (!ok) return;
      await signOut();
      safeRouterReplace(router, '/');
    })();
  };

  const langLabel =
    LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])?.label ?? t('selectLanguage');

  return (
    <>
      <Stack.Screen options={{ title: t('account'), headerBackTitle: t('back') }} />
      <ScrollView
        style={[styles.container, { backgroundColor: palette.pageBg }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}>
          <MenuRow
            icon="language-outline"
            title={t('language')}
            subtitle={langLabel}
            onPress={() => setLanguageModalVisible(true)}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
          <MenuRow
            icon="notifications-outline"
            title={t('notificationPrefsShort')}
            subtitle={t('notificationsSection')}
            onPress={() => router.push('/staff/profile/notifications')}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
          <MenuRow
            icon="ban-outline"
            title={t('blockedUsersTitle')}
            subtitle={blockedCount > 0 ? t('blockedUsersBadge', { count: blockedCount }) : t('openBlockedList')}
            onPress={() => router.push('/staff/profile/blocked-users')}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
          <MenuRow
            icon="apps-outline"
            title={t('profileUiAppsWebTitle')}
            onPress={() => router.push('/staff/profile/app-links' as never)}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            title={t('permissionsLegal')}
            onPress={() => router.push('/permissions')}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
          <MenuRow
            icon="document-text-outline"
            title={t('modernProfileMenuCertificates')}
            onPress={() => router.push('/staff/profile/passports' as never)}
            textColor={palette.text}
            borderColor={palette.cardBorder}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: palette.muted }]}>{t('accountManagement')}</Text>
        <TouchableOpacity style={styles.signOutRow} onPress={handleSignOut} activeOpacity={0.75}>
          <Ionicons name="log-out-outline" size={18} color={theme.colors.textSecondary} />
          <Text style={styles.signOutText}>{t('signOut')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteRow}
          onPress={() => router.push('/staff/delete-account')}
          activeOpacity={0.8}
        >
          <Text style={styles.deleteText}>{t('deleteMyAccount')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={languageModalVisible} transparent animationType="fade" onRequestClose={() => setLanguageModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setLanguageModalVisible(false)}>
          <Pressable style={[styles.langBox, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <Text style={styles.langTitle}>{t('selectLanguage')}</Text>
            {LANGUAGES.map((l) => (
              <TouchableOpacity
                key={l.code}
                style={styles.langRow}
                onPress={() => void handleLanguageSelect(l.code)}
                activeOpacity={0.85}
              >
                <Text style={styles.langFlag}>{LANGUAGE_FLAGS[l.code] ?? '🌐'}</Text>
                <Text style={styles.langLabel}>{l.label}</Text>
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 20,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  menuIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: P.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowTextCol: { flex: 1 },
  menuTitle: { fontSize: 15, fontWeight: '700' },
  menuSub: { fontSize: 12, color: P.subtext, marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    paddingVertical: 12,
  },
  signOutText: { fontSize: 15, fontWeight: '600', color: theme.colors.textSecondary },
  deleteRow: { marginHorizontal: 20, paddingVertical: 12 },
  deleteText: { fontSize: 14, fontWeight: '600', color: theme.colors.error },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  langBox: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  langTitle: { fontSize: 17, fontWeight: '800', color: P.text, marginBottom: 12, textAlign: 'center' },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: P.border,
  },
  langFlag: { fontSize: 22 },
  langLabel: { fontSize: 16, fontWeight: '600', color: P.text },
});
