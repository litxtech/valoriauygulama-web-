import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { getOrCreateGuestForCaller, getGuestFullNameFromUser } from '@/lib/getOrCreateGuestForCaller';
import { isAdminMapViewer } from '@/lib/map/mapLiveLocationPolicy';
import {
  disableGuestLiveLocationFromPermissions,
  enableGuestLiveLocationQuiet,
  getGuestLocationPermissionSnapshot,
} from '@/lib/map/guestLocationSharing';
import {
  disableStaffLiveLocationFromPermissions,
  enableStaffLiveLocationQuiet,
  getStaffLocationPermissionSnapshot,
} from '@/lib/map/staffLocationSharing';

const TOAST_MS = 2800;

type Props = {
  embedded?: boolean;
  /** staff yolu: personel; aksi halde misafir */
  variant: 'staff' | 'guest';
};

export function MapLiveLocationToggle({ embedded = false, variant }: Props) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const [liveOn, setLiveOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: 'on' | 'off' | 'denied' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (variant === 'staff') {
      const snap = await getStaffLocationPermissionSnapshot();
      setLiveOn(snap.enabled && snap.foreground === 'granted');
    } else {
      const snap = await getGuestLocationPermissionSnapshot();
      setLiveOn(snap.enabled && snap.foreground === 'granted');
    }
  }, [variant]);

  useEffect(() => {
    void refresh().catch(() => {});
  }, [refresh]);

  const showToast = useCallback(
    (message: string, kind: 'on' | 'off' | 'denied') => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ text: message, kind });
      toastOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(toastOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.delay(TOAST_MS - 440),
        Animated.timing(toastOpacity, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) setToast(null);
      });
    },
    [toastOpacity]
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  if (variant === 'staff') {
    if (!staff || isAdminMapViewer(staff)) return null;
  } else {
    if (!user || staff) return null;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (liveOn) {
        if (variant === 'staff') {
          await disableStaffLiveLocationFromPermissions();
        } else {
          await disableGuestLiveLocationFromPermissions();
        }
        showToast(t('mapLiveSharingToastOff', { defaultValue: 'Canlı konum paylaşımı kapalı' }), 'off');
      } else {
        let ok = false;
        if (variant === 'staff' && staff) {
          ok = await enableStaffLiveLocationQuiet({
            staffId: staff.id,
            displayName: staff.full_name ?? null,
            avatarUrl: staff.profile_image ?? null,
          });
        } else if (user) {
          const row = await getOrCreateGuestForCaller(user);
          if (row?.guest_id) {
            ok = await enableGuestLiveLocationQuiet({
              guestId: row.guest_id,
              displayName: getGuestFullNameFromUser(user) ?? null,
              avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
            });
          }
        }
        showToast(
          ok
            ? t('mapLiveSharingToastOn', { defaultValue: 'Canlı konum paylaşımı açık' })
            : t('mapLiveSharingToastDenied', { defaultValue: 'Konum izni verilmedi' }),
          ok ? 'on' : 'denied'
        );
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={embedded ? styles.embeddedWrap : styles.wrap} pointerEvents="box-none">
      {toast ? (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
          <Ionicons
            name={
              toast.kind === 'on'
                ? 'checkmark-circle'
                : toast.kind === 'denied'
                  ? 'alert-circle'
                  : 'close-circle'
            }
            size={16}
            color={toast.kind === 'on' ? '#4ade80' : toast.kind === 'denied' ? '#fbbf24' : '#f87171'}
          />
          <Text style={styles.toastText} numberOfLines={2}>
            {toast.text}
          </Text>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={() => void toggle()}
        disabled={busy}
        style={({ pressed }) => [
          styles.btn,
          liveOn ? styles.btnOn : styles.btnOff,
          pressed && styles.btnPressed,
        ]}
        accessibilityRole="switch"
        accessibilityState={{ checked: liveOn }}
        accessibilityLabel={
          liveOn
            ? t('mapLiveSharingA11yOn', { defaultValue: 'Canlı konum açık, kapatmak için dokunun' })
            : t('mapLiveSharingA11yOff', { defaultValue: 'Canlı konumu açmak için dokunun' })
        }
      >
        {busy ? (
          <ActivityIndicator size="small" color={liveOn ? '#059669' : '#fff'} />
        ) : (
          <>
            <Ionicons name={liveOn ? 'locate' : 'locate-outline'} size={22} color={liveOn ? '#059669' : '#fff'} />
            <Text style={[styles.btnLabel, liveOn && styles.btnLabelOn]} numberOfLines={1}>
              {liveOn
                ? t('mapLiveSharingBtnOn', { defaultValue: 'Canlı' })
                : t('mapLiveSharingBtnOff', { defaultValue: 'Kapalı' })}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 14,
    top: 8,
    zIndex: 42,
    alignItems: 'flex-end',
  },
  embeddedWrap: {
    marginTop: 8,
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 280,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  toastText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    lineHeight: 18,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    minHeight: 42,
  },
  btnOff: {
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  btnOn: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: '#34d399',
  },
  btnPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.97 }],
  },
  btnLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  btnLabelOn: {
    color: '#047857',
  },
});
