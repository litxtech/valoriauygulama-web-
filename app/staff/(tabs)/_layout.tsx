import { useEffect, useState, type ReactNode } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, AppState, Modal, Pressable, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter, type Href } from 'expo-router';
import { FloatingIslandTabBar } from '@/components/FloatingIslandTabBar';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { pds } from '@/constants/personelDesignSystem';
import { appTabBar } from '@/constants/tabBarTheme';
import { AppTabBarCenterMessageButton } from '@/components/AppTabBarCenterMessageButton';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useAdminWarningStore } from '@/stores/adminWarningStore';
import { CachedImage } from '@/components/CachedImage';
import { isKbsUiEnabled } from '@/lib/kbsUiEnabled';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { signalStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

const IG_HEADER_FG = pds.text;
const IG_HEADER_BORDER = pds.borderLight;

function TabBarScaledIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  return <View style={{ transform: [{ scale: focused ? 1.1 : 1 }] }}>{children}</View>;
}

function CuteHeaderTitle({ text }: { text: string }) {
  return (
    <LinearGradient colors={['#6366f1', '#22c55e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cuteHeaderChip}>
      <Ionicons name="sparkles-outline" size={14} color="#fff" />
      <Text style={styles.cuteHeaderChipText} numberOfLines={1}>
        {text}
      </Text>
    </LinearGradient>
  );
}

function StaffProfileTabIcon({ color: _c, focused }: { color: string; focused: boolean }) {
  const staff = useAuthStore((s) => s.staff);
  const c = focused ? pds.indigo : appTabBar.inactive;
  const avatarUri = staff?.profile_image ?? null;
  if (avatarUri) {
    return (
      <View style={[styles.tabAvatarWrap, { borderColor: focused ? c : theme.colors.borderLight }]}>
        <CachedImage uri={avatarUri} style={styles.tabAvatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={TAB_ICON_SIZE} color={c} />;
}

/** Profil: şeffaf header, kapak görünsün; sadece geri; ana sekmeye */
function StaffProfileBackToHome() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.push('/staff' as Href)}
      style={styles.profileBackBtn}
      activeOpacity={0.85}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      accessibilityLabel={t('back')}
    >
      <Ionicons name="chevron-back" size={24} color="#fff" />
    </TouchableOpacity>
  );
}

const HEADER_CTRL = 34;
/** iOS: sol + ve sağ ikon satırı; 40px buton 34px kaba sığmayınca dikey taşma oluyordu */
const HEADER_ROW_H = 44;

function NotificationBellHeaderButton() {
  const router = useRouter();
  const unreadCount = useStaffNotificationStore((s) => s.unreadCount);
  return (
    <TouchableOpacity
      onPress={() => router.push('/staff/notifications')}
      style={styles.headerNotifyWrap}
      activeOpacity={0.8}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
    >
      <View>
        <Ionicons name="notifications-outline" size={24} color={IG_HEADER_FG} />
        {unreadCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: pds.blue,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

type StaffMenuItem = {
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

function canStaffCreateFeed(staff: ReturnType<typeof useAuthStore.getState>['staff']): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  const perms = staff.app_permissions ?? {};
  return (
    perms.video_paylasim === true ||
    perms.feed_create_post === true ||
    perms.feed_post_create === true ||
    perms.feed_create === true ||
    perms.feed === true
  );
}


export default function StaffTabsLayout() {
  const { t, i18n } = useTranslation();
  const tabBarHeight = 58 + 8;
  const tabBarPaddingBottom = 8;
  const staff = useAuthStore((s) => s.staff);
  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);
  const unreadMessagesCount = useStaffUnreadMessagesStore((s) => s.unreadCount);
  const refreshUnreadMessages = useStaffUnreadMessagesStore((s) => s.refreshUnread);
  const adminWarningCount = useAdminWarningStore((s) => s.count);
  const refreshAdminWarning = useAdminWarningStore((s) => s.refresh);
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  const canCreateFeed = canStaffCreateFeed(staff);
  const canKbsMrz = canStaffUseMrzScan(staff);
  const showHeaderFabMenu = canCreateFeed || canKbsMrz;
  useEffect(() => {
    if (!staff?.id) return;
    refreshNotifications();
    refreshUnreadMessages(staff.id);
    if (staff.role === 'admin') refreshAdminWarning(staff.id);
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, refreshAdminWarning]);

  const langCode = (i18n.language || '').toLowerCase();
  const isArabic = langCode.startsWith('ar');
  const isTurkish = langCode.startsWith('tr');
  const attendanceLabel = isArabic ? 'متابعة الدوام' : (isTurkish ? 'Mesai Takibi' : 'Attendance');
  const missingItemsLabel = t('screenMissingItems');
  const cleaningLabel = isArabic ? 'التنظيف' : (isTurkish ? 'Temizlik' : 'Cleaning');

  const menuItems: StaffMenuItem[] = [
    { label: t('staffHome'), href: '/staff', icon: 'home-outline', accent: '#2563eb' },
    { label: t('mapTab'), href: '/staff/map', icon: 'map-outline', accent: '#0d9488' },
    { label: t('tasks'), href: '/staff/tasks', icon: 'checkbox-outline', accent: '#7c3aed' },
    { label: attendanceLabel, href: '/staff/attendance', icon: 'time-outline', accent: '#0369a1' },
    { label: missingItemsLabel, href: '/staff/missing-items', icon: 'alert-circle-outline', accent: '#dc2626' },
    { label: 'Yemek listesi', href: '/staff/meal-menu', icon: 'fast-food-outline', accent: '#ea580c' },
    ...(staff?.role === 'admin'
      ? []
      : [{ label: t('screenEmergency'), href: '/staff/emergency', icon: 'warning-outline', accent: '#ea580c' }]),
    { label: t('messages'), href: '/staff/messages', icon: 'chatbubbles-outline', accent: '#2563eb' },
    ...(staff?.role === 'admin' || staff?.app_permissions?.yarin_oda_temizlik_listesi
      ? [{ label: cleaningLabel, href: '/staff/cleaning-plan', icon: 'checkbox-outline' as const, accent: '#0f766e' }]
      : []),
    { label: t('adminGuests'), href: '/staff/guests', icon: 'people-outline', accent: '#0ea5e9' },
    ...(staff?.role === 'admin'
      ? []
      : [
          { label: t('transferTourNavTitle'), href: '/staff/transfer-tour', icon: 'car-outline', accent: '#0f766e' },
          { label: t('diningVenuesNavTitle'), href: '/staff/dining-venues', icon: 'restaurant-outline', accent: '#b45309' },
        ]),
    { label: t('stockTab'), href: '/staff/stock', icon: 'cube-outline', accent: '#16a34a' },
    { label: t('myProfile'), href: '/staff/profile', icon: 'person-circle-outline', accent: '#6366f1' },
  ];

  if (isKbsUiEnabled() && (staff?.role === 'admin' || staff?.kbs_access_enabled !== false)) {
    menuItems.push({ label: t('kbsNavOperation'), href: '/staff/kbs', icon: 'scan-outline', accent: '#0f766e' });
  }
  if (staff && hasTechnicalAssetsStaffAccess(staff)) {
    menuItems.push({
      label: 'Teknik QR Envanter',
      href: '/staff/technical-assets',
      icon: 'layers-outline',
      accent: '#b8860b',
    });
  }
  if (staff?.role === 'admin') {
    menuItems.push({ label: t('adminTab'), href: '/staff/admin', icon: 'shield-checkmark-outline', accent: '#7c3aed' });
  }

  useEffect(() => {
    if (!staff?.id) return;
    const interval = setInterval(() => {
      refreshNotifications();
      refreshUnreadMessages(staff.id);
      if (staff.role === 'admin') refreshAdminWarning(staff.id);
    }, 180000);
    return () => clearInterval(interval);
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, refreshAdminWarning]);

  // Android: uygulama ön plana gelince tab rozetleri hemen güncellensin (ilgili sekmeye girmeden)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !staff?.id) return;
      refreshNotifications();
      refreshUnreadMessages(staff.id);
      if (staff.role === 'admin') refreshAdminWarning(staff.id);
    });
    return () => sub.remove();
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, refreshAdminWarning]);

  return (
    <>
    <Tabs
      tabBar={(props) => (
        <FloatingIslandTabBar {...props} surfaceColor={pds.cardBg} borderColor={pds.borderLight} />
      )}
      screenListeners={({ route }) => ({
        tabPress: () => {
          if (route.name !== 'admin') {
            signalStaffExitedAdminPanelFromRoot();
          }
        },
      })}
      screenOptions={{
        /** Varsayılan lazy: true ilk sekme tıklanınca mount + yükleme flicker’ı; hepsini erken mount et */
        lazy: false,
        /** Sekme değişince feed’in unmount olmaması — avatar/liste yeniden “boş→dolu” flicker’ını azaltır */
        detachInactiveScreens: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: pds.indigo,
        tabBarInactiveTintColor: pds.subtext,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: tabBarHeight,
          paddingTop: 8,
          paddingBottom: tabBarPaddingBottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          backgroundColor: 'transparent',
        },
        // iOS: sarımsı vurgu / “gölge” yok; seçili sekme sadece ikon/label rengiyle belli
        tabBarActiveBackgroundColor: 'transparent',
        tabBarInactiveBackgroundColor: 'transparent',
        // Opak header: tüm sekmelerde içerik çubuk altında hizalanır (şeffaf + manuel padding feed’e özel hata yaratıyordu).
        headerStyle: {
          backgroundColor: 'rgba(255,255,255,0.96)',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
        },
        headerTransparent: false,
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTintColor: IG_HEADER_FG,
        headerTitleStyle: { fontSize: 19, fontWeight: '800', color: '#111827', letterSpacing: 0.3 },
        ...(Platform.OS === 'android' ? { statusBarColor: 'rgba(255,255,255,0.96)', statusBarStyle: 'dark' } : null),
        headerLeftContainerStyle: { paddingLeft: 2, minWidth: HEADER_CTRL * 2 + 8 },
        headerRightContainerStyle: { paddingRight: 2, minWidth: HEADER_CTRL * 2 + 8 },
        headerRight: () => (
          <View style={styles.headerActionsRow}>
            {canKbsMrz ? (
              <TouchableOpacity
                onPress={() => router.push('/staff/mrz-scan' as never)}
                style={styles.headerMrzIconBtn}
                activeOpacity={0.82}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel={t('kbsNavScanSerial')}
              >
                <Ionicons name="scan-outline" size={21} color={IG_HEADER_FG} />
              </TouchableOpacity>
            ) : null}
            <NotificationBellHeaderButton />
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
              accessibilityLabel={t('more')}
            >
              <Ionicons name="menu-outline" size={26} color={IG_HEADER_FG} />
            </TouchableOpacity>
          </View>
        ),
        headerLeft: () =>
          showHeaderFabMenu ? (
            <View style={styles.headerLeftRow}>
              <TouchableOpacity
                onPress={() => setFabVisible(true)}
                style={styles.headerCtaAdd}
                activeOpacity={0.88}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={
                  canCreateFeed && canKbsMrz
                    ? t('staffFabCreateAll')
                    : canCreateFeed
                      ? t('staffFabCreatePostOrStory')
                      : t('staffFabCreateMrzOnly')
                }
              >
                <LinearGradient
                  colors={pds.gradientCta}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.headerCtaAddGrad}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '',
          headerTitle: () => <CuteHeaderTitle text={t('staffTab')} />,
          headerRight: () => (
            <View style={styles.headerActionsRow}>
              {canKbsMrz ? (
                <TouchableOpacity
                  onPress={() => router.push('/staff/mrz-scan' as never)}
                  style={styles.headerMrzIconBtn}
                  activeOpacity={0.82}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel={t('kbsNavScanSerial')}
                >
                  <Ionicons name="scan-outline" size={21} color={IG_HEADER_FG} />
                </TouchableOpacity>
              ) : null}
              <NotificationBellHeaderButton />
              <TouchableOpacity
                onPress={() => setMenuVisible(true)}
                style={styles.headerIconBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                accessibilityLabel={t('more')}
              >
                <Ionicons name="menu-outline" size={26} color={IG_HEADER_FG} />
              </TouchableOpacity>
            </View>
          ),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'people' : 'people-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t('tasks'),
          headerTitle: t('tasks'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('tasks'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'checkbox' : 'checkbox-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('stockTab'),
          headerTitle: t('stockManagement'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('stockTab'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'cube' : 'cube-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          headerTitle: t('teamChat'),
          tabBarActiveTintColor: pds.indigo,
          tabBarShowLabel: false,
          tabBarLabel: t('messages'),
          tabBarButton: (props) => (
            <AppTabBarCenterMessageButton
              {...props}
              unreadCount={unreadMessagesCount}
              accessibilityLabel={t('messages')}
            />
          ),
          tabBarItemStyle: {
            paddingHorizontal: 2,
          },
          tabBarIcon: () => <View style={{ width: 1, height: 1, opacity: 0 }} />,
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: t('screenEmergency'),
          headerTitle: t('screenEmergency'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('screenEmergency'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'warning' : 'warning-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? null : undefined,
        }}
      />
      <Tabs.Screen
        name="kbs"
        options={{
          title: t('kbsNavOperation'),
          headerTitle: t('kbsNavOperation'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('kbsNavOperation'),
          href:
            !isKbsUiEnabled() || (staff?.role !== 'admin' && staff?.kbs_access_enabled === false) ? null : undefined,
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'scan' : 'scan-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="cameras"
        options={{
          title: t('staffCamerasTitle'),
          headerTitle: t('staffLiveCamerasTitle'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="acceptances"
        options={{
          title: t('acceptances'),
          headerTitle: t('acceptancesHeader'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('acceptances'),
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'document-text' : 'document-text-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications'),
          headerTitle: t('notifications'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="misafir"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t('adminTab'),
          headerTitle: t('managementPanel'),
          tabBarActiveTintColor: pds.indigo,
          tabBarLabel: t('adminTab'),
          tabBarBadge: staff?.role === 'admin' && adminWarningCount > 0 ? (adminWarningCount > 99 ? '99+' : adminWarningCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ focused }) => (
            <TabBarScaledIcon focused={focused}>
              <Ionicons
                name={focused ? 'shield' : 'shield-outline'}
                size={TAB_ICON_SIZE}
                color={focused ? pds.indigo : appTabBar.inactive}
              />
            </TabBarScaledIcon>
          ),
          href: staff?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('myProfile'),
          headerTitle: '',
          headerShown: true,
          tabBarActiveTintColor: pds.indigo,
          headerTransparent: true,
          headerBackground: () => <View style={StyleSheet.absoluteFillObject} />,
          headerStyle: {
            backgroundColor: 'transparent',
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
            borderBottomColor: 'transparent',
          },
          headerShadowVisible: false,
          headerLeft: () => <StaffProfileBackToHome />,
          headerRight: () => null,
          headerTintColor: '#ffffff',
          tabBarShowLabel: false,
          tabBarIcon: ({ color, focused }) => <StaffProfileTabIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
    <Modal
      visible={menuVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setMenuVisible(false)}
    >
      <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
        <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
          <LinearGradient colors={['#0f172a', '#1d4ed8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.menuHero}>
            <Text style={styles.menuHeroTitle}>{t('more')}</Text>
            <Text style={styles.menuHeroSub}>
              {isArabic ? 'الوصول إلى كل الشاشات بلمسة واحدة' : 'One-tap access to all screens'}
            </Text>
          </LinearGradient>
          <ScrollView style={styles.menuScroll} contentContainerStyle={styles.menuScrollContent} showsVerticalScrollIndicator={false}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={item.href}
                style={[styles.menuItemCard, idx === menuItems.length - 1 && styles.menuItemLast]}
                activeOpacity={0.78}
                onPress={() => {
                  setMenuVisible(false);
                  router.push(item.href as never);
                }}
              >
                <View style={[styles.menuIconBadge, { backgroundColor: `${item.accent}22`, borderColor: `${item.accent}50` }]}>
                  <Ionicons name={item.icon} size={20} color={item.accent} />
                </View>
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="rgba(15,23,42,0.35)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal
      visible={fabVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setFabVisible(false)}
    >
      <Pressable style={styles.menuOverlay} onPress={() => setFabVisible(false)}>
        <Pressable style={styles.shareSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.shareTitle}>
            {canCreateFeed && canKbsMrz
              ? t('staffFabShareAndKbs')
              : canKbsMrz && !canCreateFeed
                ? t('kbsNavOperation')
                : t('share')}
          </Text>
          {canCreateFeed ? (
            <>
              <TouchableOpacity
                style={styles.shareCard}
                activeOpacity={0.9}
                onPress={() => {
                  setFabVisible(false);
                  router.push('/staff/feed/new' as never);
                }}
              >
                <LinearGradient colors={pds.gradientCta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shareIconWrapGrad}>
                  <Ionicons name="images-outline" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareCardTitle}>{t('post')}</Text>
                  <Text style={styles.shareCardSub}>{t('staffFabPostSub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shareCard, !canKbsMrz && styles.shareCardLast]}
                activeOpacity={0.9}
                onPress={() => {
                  setFabVisible(false);
                  router.push('/staff/feed/story-new' as never);
                }}
              >
                <LinearGradient colors={pds.gradientPremium} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.shareIconWrapGrad}>
                  <Ionicons name="sparkles-outline" size={20} color="#fff" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.shareCardTitle}>{t('story')}</Text>
                  <Text style={styles.shareCardSub}>{t('staffFabStorySub')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}
          {canKbsMrz ? (
            <TouchableOpacity
              style={[styles.shareCard, styles.shareCardLast]}
              activeOpacity={0.9}
              onPress={() => {
                setFabVisible(false);
                router.push('/staff/mrz-scan' as never);
              }}
            >
              <LinearGradient
                colors={['#0f766e', '#0369a1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.shareIconWrapGrad}
              >
                <Ionicons name="scan-outline" size={20} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareCardTitle}>{t('staffPassportsTitle')}</Text>
                <Text style={styles.shareCardSub}>{t('staffFabMrzSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  profileBackBtn: {
    marginLeft: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabAvatarWrap: {
    width: PROFILE_TAB_AVATAR_SIZE,
    height: PROFILE_TAB_AVATAR_SIZE,
    borderRadius: PROFILE_TAB_AVATAR_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tabAvatar: {
    width: '100%',
    height: '100%',
  },
  headerLeftRow: {
    marginLeft: 4,
    height: HEADER_ROW_H,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ translateY: -5 }],
  },
  headerMrzIconBtn: {
    width: HEADER_CTRL,
    height: HEADER_CTRL,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IG_HEADER_BORDER,
    backgroundColor: '#fff',
  },
  headerCtaAdd: {
    minWidth: HEADER_CTRL,
    minHeight: HEADER_ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCtaAddGrad: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_ROW_H,
    marginRight: 2,
  },
  headerNotifyWrap: {
    width: HEADER_CTRL,
    height: HEADER_CTRL,
    marginRight: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  menuSheet: {
    width: '100%',
    maxHeight: '82%',
    borderRadius: 18,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: IG_HEADER_BORDER,
    overflow: 'hidden',
    ...theme.shadows.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    paddingTop: 0,
    paddingBottom: 0,
  },
  menuHero: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 13,
  },
  menuHeroTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  menuHeroSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  menuScroll: { maxHeight: '100%' },
  menuScrollContent: { padding: 10, paddingBottom: 12 },
  menuItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    borderRadius: 13,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  menuIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  menuItemLast: {
    marginBottom: 0,
  },
  menuItemText: {
    flex: 1,
    color: IG_HEADER_FG,
    fontSize: 15,
    fontWeight: '700',
  },
  headerIconBtn: {
    minWidth: HEADER_CTRL,
    minHeight: HEADER_CTRL,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSheet: {
    marginTop: 'auto',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  shareTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  shareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: 10,
  },
  shareCardLast: {
    marginBottom: 0,
  },
  shareIconWrapGrad: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  shareCardSub: { marginTop: 2, fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  cuteHeaderChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  cuteHeaderChipText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
});
