import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  RefreshControl,
  Platform,
  InteractionManager,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { emitPermissionLiveChange, onPermissionLiveChange } from '@/lib/permissionLive';
import ExpoNotifications from '@/lib/expoNotificationsModule';
import { useAuthStore } from '@/stores/authStore';
import {
  disableStaffLiveLocationFromPermissions,
  enableStaffLiveLocationFromPermissions,
  getStaffLocationPermissionSnapshot,
} from '@/lib/map/staffLocationSharing';
import {
  disableGuestLiveLocationFromPermissions,
  enableGuestLiveLocationFromPermissions,
  enableGuestLiveLocationQuiet,
  getGuestLocationPermissionSnapshot,
} from '@/lib/map/guestLocationSharing';
import { getOrCreateGuestForCaller, getGuestFullNameFromUser } from '@/lib/getOrCreateGuestForCaller';

type PermStatus = 'granted' | 'denied' | 'undetermined' | 'unavailable';

const BASE_DEVICE_PERMISSIONS = [
  {
    key: 'camera',
    icon: 'camera-outline' as const,
    title: 'Kamera',
    reason: 'QR okutma, barkod tarama ve belge kamera islemleri.',
  },
  {
    key: 'photo_library',
    icon: 'images-outline' as const,
    title: 'Fotograf / Galeri',
    reason: 'Avatar, kapak fotografi ve medya yukleme.',
  },
  {
    key: 'microphone',
    icon: 'mic-outline' as const,
    title: 'Mikrofon',
    reason: 'Sesli mesaj kaydi ve ses tabanli ozellikler.',
  },
  {
    key: 'location',
    icon: 'location-outline' as const,
    title: 'Konum (uygulama acikken)',
    reason: 'Haritada yol tarifi, yakin noktalar ve konumunuzu haritada gostermek icin.',
  },
  {
    key: 'notifications',
    icon: 'notifications-outline' as const,
    title: 'Bildirimler',
    reason: 'Mesaj, rezervasyon ve acil duyuru bildirimleri.',
  },
];

const STAFF_LIVE_LOCATION_PERM = {
  key: 'location_live',
  icon: 'navigate-outline' as const,
  title: 'Canli operasyon konumu',
  reason:
    'Vardiya sirasinda operasyon haritasinda avatarinizin canli gorunmesi (istege bagli). Yalnizca uygulama acikken guncellenir.',
};

const GUEST_LIVE_LOCATION_PERM = {
  key: 'location_live_guest',
  icon: 'navigate-outline' as const,
  title: 'Otel haritasinda canli konum',
  reason:
    'Konum paylasimi acikken resepsiyon haritada sizi gorebilir. Haritadan veya buradan kapatabilirsiniz; yalnizca uygulama acikken guncellenir.',
};

function devicePermissionsForUser(isStaff: boolean) {
  const list = [...BASE_DEVICE_PERMISSIONS];
  const locIdx = list.findIndex((p) => p.key === 'location');
  if (locIdx >= 0) {
    list.splice(locIdx + 1, 0, isStaff ? STAFF_LIVE_LOCATION_PERM : GUEST_LIVE_LOCATION_PERM);
  }
  return list;
}

function isLiveLocationKey(key: string): boolean {
  return key === 'location_live' || key === 'location_live_guest';
}

async function getStatus(key: string): Promise<PermStatus> {
  try {
    switch (key) {
      case 'camera': {
        try {
          const ImagePicker = await import('expo-image-picker');
          const { status } = await ImagePicker.getCameraPermissionsAsync();
          return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
        } catch {
          return 'undetermined';
        }
      }
      case 'photo_library': {
        if (Platform.OS === 'android') return 'granted';
        const ImagePicker = await import('expo-image-picker');
        const { status } = await ImagePicker.getMediaLibraryPermissionsAsync();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'location': {
        const Location = await import('expo-location');
        const { status } = await Location.getForegroundPermissionsAsync();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'location_live': {
        const snap = await getStaffLocationPermissionSnapshot();
        if (snap.foreground === 'unavailable') return 'unavailable';
        if (snap.enabled && snap.foreground === 'granted') return 'granted';
        if (snap.foreground === 'denied') return 'denied';
        return 'undetermined';
      }
      case 'location_live_guest': {
        const snap = await getGuestLocationPermissionSnapshot();
        if (snap.foreground === 'unavailable') return 'unavailable';
        if (snap.enabled && snap.foreground === 'granted') return 'granted';
        if (snap.foreground === 'denied') return 'denied';
        return 'undetermined';
      }
      case 'notifications': {
        const { status } = await ExpoNotifications.getPermissionsAsync();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'microphone': {
        try {
          const { Audio } = await import('expo-av');
          const result = await Audio.getPermissionsAsync();
          const status = (result as unknown as { status?: string; granted?: boolean }).status ?? (result as unknown as { granted?: boolean }).granted;
          if (status === 'granted' || status === true) return 'granted';
          if (status === 'denied' || status === false) return 'denied';
          return 'undetermined';
        } catch {
          return 'undetermined';
        }
      }
      default:
        return 'undetermined';
    }
  } catch {
    return 'unavailable';
  }
}

async function requestPermission(key: string): Promise<PermStatus> {
  try {
    switch (key) {
      case 'camera': {
        try {
          const ImagePicker = await import('expo-image-picker');
          const result = await ImagePicker.requestCameraPermissionsAsync();
          const { status, canAskAgain } = result;
          emitPermissionLiveChange();
          if (status !== 'granted' && canAskAgain === false) {
            Alert.alert(
              'Izin gerekli',
              'Kamera izni kalici olarak kapali. Ayarlardan kamera iznini acabilirsiniz.',
              [
                { text: 'Iptal', style: 'cancel' },
                { text: 'Ayarlari ac', onPress: () => openAppSettings() },
              ]
            );
          }
          return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
        } catch {
          return await getStatus('camera');
        }
      }
      case 'photo_library': {
        if (Platform.OS === 'android') return 'granted';
        const ImagePicker = await import('expo-image-picker');
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        emitPermissionLiveChange();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'location': {
        const Location = await import('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        emitPermissionLiveChange();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'location_live': {
        emitPermissionLiveChange();
        return 'undetermined';
      }
      case 'notifications': {
        const { status } = await ExpoNotifications.requestPermissionsAsync();
        emitPermissionLiveChange();
        return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
      }
      case 'microphone': {
        try {
          const { Audio } = await import('expo-av');
          const result = await Audio.requestPermissionsAsync();
          emitPermissionLiveChange();
          const status = (result as unknown as { status?: string; granted?: boolean }).status ?? (result as unknown as { granted?: boolean }).granted;
          if (status === 'granted' || status === true) return 'granted';
          if (status === 'denied' || status === false) return 'denied';
          return 'undetermined';
        } catch {
          return await getStatus('microphone');
        }
      }
      default:
        return 'undetermined';
    }
  } catch (e) {
    Alert.alert('Hata', (e as Error)?.message ?? 'Izin alinamadi.');
    return await getStatus(key);
  }
}

function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}

export default function PermissionsScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);
  const devicePermissions = useMemo(() => devicePermissionsForUser(!!staff), [staff]);
  const [statuses, setStatuses] = useState<Record<string, PermStatus>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [refreshing, setRefreshing] = useState(false);
  const lastSerializedRef = useRef('');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    const next: Record<string, PermStatus> = {};
    for (const p of devicePermissions) {
      next[p.key] = await getStatus(p.key);
    }
    const serialized = JSON.stringify(next);
    lastSerializedRef.current = serialized;
    setStatuses(next);
  }, [devicePermissions]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
    }, [refreshAll])
  );

  useEffect(() => {
    const unsubLive = onPermissionLiveChange(() => {
      refreshAll();
    });
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshAll();
    });
    return () => {
      unsubLive();
      appStateSub.remove();
    };
  }, [refreshAll]);

  const openPermissionCard = useCallback((key: string) => {
    setActiveKey(key);
  }, []);

  const closePermissionCard = useCallback(() => {
    setActiveKey(null);
  }, []);

  const handleCardPrimaryAction = useCallback(async () => {
    if (!activeKey) return;
    const current = statuses[activeKey] ?? 'undetermined';
    const keyToRequest = activeKey;
    setLoading((prev) => ({ ...prev, [activeKey]: true }));
    const loadingTimeout = setTimeout(() => {
      setLoading((prev) => (prev[keyToRequest] ? { ...prev, [keyToRequest]: false } : prev));
    }, 15000);
    try {
      if (current === 'granted') {
        closePermissionCard();
        if (keyToRequest === 'location_live' && staff) {
          void (async () => {
            setLoading((prev) => ({ ...prev, location_live: true }));
            try {
              await disableStaffLiveLocationFromPermissions();
              emitPermissionLiveChange();
              await refreshAll();
            } finally {
              setLoading((prev) => ({ ...prev, location_live: false }));
            }
          })();
        } else if (keyToRequest === 'location_live_guest' && user && !staff) {
          void (async () => {
            setLoading((prev) => ({ ...prev, location_live_guest: true }));
            try {
              await disableGuestLiveLocationFromPermissions();
              emitPermissionLiveChange();
              await refreshAll();
            } finally {
              setLoading((prev) => ({ ...prev, location_live_guest: false }));
            }
          })();
        } else {
          await openAppSettings();
          setTimeout(refreshAll, 500);
        }
      } else {
        // Modal açıkken sistem izin penceresi arkada kalıp görünmeyebilir (özellikle iOS).
        // Önce modalı kapatıp, animasyon bitince izin isteyerek sistem penceresinin
        // üstte görünmesini sağlıyoruz.
        closePermissionCard();
        const requestAfterClose = () => {
          if (keyToRequest === 'location_live' && staff) {
            void (async () => {
              setLoading((prev) => ({ ...prev, location_live: true }));
              try {
                if (current === 'granted') {
                  await disableStaffLiveLocationFromPermissions();
                } else {
                  await enableStaffLiveLocationFromPermissions({
                    staffId: staff.id,
                    displayName: staff.full_name ?? null,
                    avatarUrl: staff.profile_image ?? null,
                  });
                }
                emitPermissionLiveChange();
                await refreshAll();
              } finally {
                setLoading((prev) => ({ ...prev, location_live: false }));
              }
            })();
            return;
          }
          if (keyToRequest === 'location_live_guest' && user && !staff) {
            void (async () => {
              setLoading((prev) => ({ ...prev, location_live_guest: true }));
              try {
                if (current === 'granted') {
                  await disableGuestLiveLocationFromPermissions();
                } else {
                  const row = await getOrCreateGuestForCaller(user);
                  if (row?.guest_id) {
                    await enableGuestLiveLocationFromPermissions({
                      guestId: row.guest_id,
                      displayName: getGuestFullNameFromUser(user) ?? null,
                      avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
                    });
                  }
                }
                emitPermissionLiveChange();
                await refreshAll();
              } finally {
                setLoading((prev) => ({ ...prev, location_live_guest: false }));
              }
            })();
            return;
          }
          requestPermission(keyToRequest).then(async (next) => {
            setStatuses((prev) => ({ ...prev, [keyToRequest]: next }));
            if (
              next === 'granted' &&
              keyToRequest === 'location' &&
              user &&
              !staff
            ) {
              const row = await getOrCreateGuestForCaller(user);
              if (row?.guest_id) {
                await enableGuestLiveLocationQuiet({
                  guestId: row.guest_id,
                  displayName: getGuestFullNameFromUser(user) ?? null,
                  avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
                });
                emitPermissionLiveChange();
              }
            }
            await refreshAll();
          });
        };
        if (Platform.OS === 'ios') {
          InteractionManager.runAfterInteractions(() => {
            setTimeout(requestAfterClose, 250);
          });
        } else {
          setTimeout(requestAfterClose, 300);
        }
      }
    } finally {
      clearTimeout(loadingTimeout);
      setLoading((prev) => ({ ...prev, [keyToRequest]: false }));
    }
  }, [activeKey, statuses, refreshAll, closePermissionCard, staff, user]);

  const statusLabel = (s: PermStatus) => {
    switch (s) {
      case 'granted':
        return 'Verildi';
      case 'denied':
        return 'Kapali';
      case 'undetermined':
        return 'Istenmedi';
      default:
        return 'Kullanilamiyor';
    }
  };

  const actionHint = (key: string, s: PermStatus) => {
    if (isLiveLocationKey(key) && s === 'granted') return 'Canli paylasimi kapatmak icin dokunun';
    if (s === 'granted') return 'Ayarlar acilir: iptal veya duzenleme yapabilirsiniz';
    if (s === 'unavailable') return 'Bu cihazda desteklenmiyor';
    return 'Izin vermek icin dokunun';
  };

  const grantedCount = devicePermissions.filter((p) => statuses[p.key] === 'granted').length;
  const totalCount = devicePermissions.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
      }
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/');
          }
        }}
        activeOpacity={0.75}
      >
        <Ionicons name="chevron-back" size={18} color={theme.colors.primary} />
        <Text style={styles.backButtonText}>Geri</Text>
      </TouchableOpacity>

      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroTitle}>Izin Merkezi</Text>
            <Text style={styles.heroSubtitle}>Tum izinler tek yerde, canli durum guncellemesiyle.</Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {grantedCount}/{totalCount}
            </Text>
          </View>
        </View>
        <Text style={styles.intro}>
          Not: Uygulamanin herhangi bir yerinde izin verildiginde bu ekran anlik olarak kendini yeniler.
        </Text>
      </View>

      {devicePermissions.map((p) => {
        const status = statuses[p.key] ?? 'undetermined';
        const busy = loading[p.key] || (activeKey === p.key && loading[p.key]);
        const unavailable = status === 'unavailable';
        const canTap = !unavailable;
        return (
          <TouchableOpacity
            key={p.key}
            style={[styles.permRow, unavailable && p.key !== 'camera' && styles.permRowDisabled]}
            onPress={() => !busy && openPermissionCard(p.key)}
            disabled={busy || !canTap}
            activeOpacity={0.72}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <View style={[styles.permIconWrap, status === 'granted' && styles.permIconWrapGranted]}>
              <Ionicons
                name={p.icon}
                size={22}
                color={status === 'granted' ? theme.colors.success : theme.colors.primary}
              />
            </View>
            <View style={styles.permBody}>
              <View style={styles.permTitleRow}>
                <Text style={styles.permTitle}>{p.title}</Text>
                {busy ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <View style={[styles.badge, status === 'granted' && styles.badgeGranted]}>
                    <Text style={[styles.badgeText, status === 'granted' && styles.badgeTextGranted]}>
                      {statusLabel(status)}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.permReason}>{p.reason}</Text>
              {canTap ? <Text style={styles.permHint}>{actionHint(p.key, status)}</Text> : null}
            </View>
            {!busy && <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />}
          </TouchableOpacity>
        );
      })}

      <Modal visible={!!activeKey} transparent animationType="fade" onRequestClose={() => {}}>
        <Pressable style={styles.modalOverlay}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            {(() => {
              const p = devicePermissions.find((x) => x.key === activeKey);
              if (!p) return null;
              const status = statuses[p.key] ?? 'undetermined';
              const busy = loading[p.key] ?? false;
              const primaryLabel = isLiveLocationKey(activeKey ?? '')
                ? status === 'granted'
                  ? 'Canli konumu kapat'
                  : 'Canli konumu ac'
                : status === 'granted'
                  ? 'Ayarları aç'
                  : 'Devam';
              const statusText = statusLabel(status);
              const statusColor =
                status === 'granted' ? theme.colors.success : status === 'denied' ? theme.colors.error : theme.colors.textSecondary;
              return (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={styles.modalIconWrap}>
                      <Ionicons name={p.icon} size={22} color={theme.colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalTitle}>{p.title}</Text>
                      <Text style={styles.modalSubtitle}>{p.reason}</Text>
                    </View>
                    <View style={[styles.modalStatusPill, { borderColor: statusColor + '55', backgroundColor: statusColor + '12' }]}>
                      <Text style={[styles.modalStatusText, { color: statusColor }]}>{statusText}</Text>
                    </View>
                  </View>

                  <View style={styles.modalNotes}>
                    {activeKey === 'location_live' ? (
                      <>
                        <Text style={styles.modalNote}>
                          - Vardiya haritasinda yalnizca yetkili ekip avatarinizi gorur; istediginiz zaman kapatabilirsiniz.
                        </Text>
                        <Text style={styles.modalNote}>
                          - Canli konum yalnizca uygulama acikken paylasilir (Google Play politikasi).
                        </Text>
                      </>
                    ) : activeKey === 'location_live_guest' ? (
                      <>
                        <Text style={styles.modalNote}>
                          - Otel haritasinda yalnizca siz acinca avatariniz gorunur; resepsiyon ve yetkili ekip size yardim icin gorebilir.
                        </Text>
                        <Text style={styles.modalNote}>
                          - Canli konum yalnizca uygulama acikken paylasilir. Kapatmak icin haritadaki dugmeyi veya bu ekrani kullanin.
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.modalNote}>
                          - "Devam" derseniz sistem izin penceresi acilir.
                        </Text>
                        <Text style={styles.modalNote}>
                          - Izin durumu bu sayfada canli guncellenir (uygulamanin diger bolumlerinde izin verilse bile).
                        </Text>
                      </>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[styles.modalPrimaryBtn, busy && { opacity: 0.75 }]}
                    onPress={handleCardPrimaryAction}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    {busy ? (
                      <ActivityIndicator color={theme.colors.white} />
                    ) : (
                      <>
                        <Ionicons name={status === 'granted' ? 'settings-outline' : 'checkmark-circle-outline'} size={20} color={theme.colors.white} />
                        <Text style={styles.modalPrimaryText}>{primaryLabel}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              );
            })()}
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Aciklama: Verilen bir izni geri almak isterseniz ilgili satira dokunarak cihaz ayarlarina gecebilirsiniz.
          Izin isteme penceresi sistem tarafindan yonetilir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    marginBottom: 18,
    ...theme.shadows.sm,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  heroBadge: {
    minWidth: 52,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    backgroundColor: theme.colors.primary + '16',
    borderWidth: 1,
    borderColor: theme.colors.primary + '45',
  },
  heroBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  intro: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 19,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  permRowDisabled: {
    opacity: 0.8,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permIconWrapGranted: {
    backgroundColor: theme.colors.success + '20',
  },
  permBody: { flex: 1, minWidth: 0 },
  permTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  permTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    flex: 1,
  },
  permReason: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  permHint: {
    fontSize: 12,
    color: theme.colors.primary,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: theme.colors.borderLight,
  },
  badgeGranted: {
    backgroundColor: theme.colors.success + '25',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textSecondary,
  },
  badgeTextGranted: {
    color: theme.colors.success,
  },
  footer: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 16,
    ...theme.shadows.md,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  modalIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary + '25',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 3,
  },
  modalSubtitle: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  modalStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  modalStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalNotes: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 14,
  },
  modalNote: {
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 18,
  },
  modalPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    ...theme.shadows.sm,
  },
  modalPrimaryText: {
    color: theme.colors.white,
    fontWeight: '800',
    fontSize: 15,
  },
  modalSecondaryBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
});
