import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { LinearGradient } from 'expo-linear-gradient';
import { StaffStackBackButton } from '@/lib/staffStackBack';
import { useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { canManageHotelKitchenMenu } from '@/lib/staffPermissions';
import {
  fetchHotelKitchenMenuItems,
  getHotelKitchenMenuCache,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { openHotelMenuLightbox } from '@/lib/openHotelMenuLightbox';
import { HotelKitchenMenuListCard } from '@/components/hotelKitchenMenu/HotelKitchenMenuListCard';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { HotelKitchenMenuQrSheet } from '@/components/hotelKitchenMenu/HotelKitchenMenuQrSheet';

const CACHE_KEY = 'list:all';

export default function StaffHotelMenuManageScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { qr } = useLocalSearchParams<{ qr?: string }>();
  const navigation = useNavigation();
  const staff = useAuthStore((s) => s.staff);
  const [items, setItems] = useState<HotelKitchenMenuItemWithImages[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <StaffStackBackButton accessibilityLabel={t('back')} fallback="/staff/hotel-menu" />
      ),
    });
  }, [navigation, t]);

  const load = useCallback(async (opts?: { skipCache?: boolean }) => {
    try {
      const rows = await fetchHotelKitchenMenuItems({ availableOnly: false, skipCache: opts?.skipCache });
      setItems(rows);
    } catch {
      /* 522 vb. — mevcut listeyi koru */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cached = getHotelKitchenMenuCache(CACHE_KEY);
      if (cached?.length) {
        setItems(cached);
        setLoading(false);
        void load({ skipCache: false }).catch(() => {});
      } else {
        setLoading(true);
        void load({ skipCache: true }).finally(() => setLoading(false));
      }
      if (qr === '1') setQrOpen(true);
      return undefined;
    }, [load, qr])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ skipCache: true }).catch(() => {});
    setRefreshing(false);
  };

  const openImage = useCallback((item: HotelKitchenMenuItemWithImages) => {
    openHotelMenuLightbox(item, setLightbox, 0);
  }, []);

  if (!canManageHotelKitchenMenu(staff)) {
    return (
      <View style={styles.centered}>
        <Text style={styles.denied}>{t('hotelKitchenMenuNoPermissionMessage')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[...menuUi.heroGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.manageHero}
      >
        <Text style={styles.manageHeroTitle}>{t('hotelKitchenMenuManageHero')}</Text>
        <Text style={styles.manageHeroSub}>{t('hotelKitchenMenuManageHeroSub')}</Text>
      </LinearGradient>
      <TouchableOpacity
        style={styles.qrBtn}
        onPress={() => setQrOpen(true)}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={[menuUi.navy, menuUi.navyMid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.qrBtnGrad}
        >
          <Ionicons name="qr-code-outline" size={22} color="#fff" />
          <View style={styles.qrBtnTexts}>
            <Text style={styles.qrBtnTitle}>{t('publicKitchenMenuQrOpenBtn')}</Text>
            <Text style={styles.qrBtnSub}>{t('publicKitchenMenuQrSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />
        </LinearGradient>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.themeBtn}
        onPress={() => router.push('/staff/fnb-hub/menu-theme')}
        activeOpacity={0.88}
      >
        <Ionicons name="color-palette-outline" size={20} color={menuUi.navy} />
        <Text style={styles.themeBtnText}>{t('hotelKitchenMenuThemeTitle')}</Text>
        <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => router.push('/staff/hotel-menu/edit')}
        activeOpacity={0.88}
      >
        <LinearGradient
          colors={[menuUi.accent, menuUi.accentDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.addBtnGrad}
        >
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.addBtnText}>{t('hotelKitchenMenuAddItem')}</Text>
        </LinearGradient>
      </TouchableOpacity>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={items.length === 0 ? styles.listEmpty : styles.list}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={8}
        removeClippedSubviews
        renderItem={({ item }) => (
          <HotelKitchenMenuListCard
            item={item}
            variant="manage"
            trailingIcon="create-outline"
            onPress={() => router.push(`/staff/hotel-menu/edit?id=${item.id}`)}
            onImagePress={() => openImage(item)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t('hotelKitchenMenuManageEmpty')}</Text>}
      />

      <HotelKitchenMenuImageLightbox
        visible={!!lightbox}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />

      {staff?.organization_id ? (
        <HotelKitchenMenuQrSheet
          visible={qrOpen}
          onClose={() => setQrOpen(false)}
          organizationId={staff.organization_id}
          organizationName={staff.organization?.name}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: menuUi.warmBg },
  centered: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: menuUi.warmBg },
  denied: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 15 },
  manageHero: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    padding: 18,
    ...menuUi.shadowSm,
  },
  manageHeroTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
  manageHeroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 6, lineHeight: 18 },
  qrBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    ...menuUi.shadowSm,
  },
  qrBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  qrBtnTexts: { flex: 1, minWidth: 0 },
  qrBtnTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  qrBtnSub: { fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 2, lineHeight: 16 },
  themeBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: menuUi.border,
    ...menuUi.shadowSm,
  },
  themeBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: menuUi.navy },
  addBtn: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, overflow: 'hidden', ...menuUi.shadowSm },
  addBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  listEmpty: { flexGrow: 1, padding: 24 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15 },
});
