import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, useNavigation, usePathname, useRouter } from 'expo-router';
import { navigateStaffBack, STAFF_TABS_FALLBACK } from '@/lib/staffStackBack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '@/constants/theme';
import { getCamera, insertCameraLog } from '@/lib/cameras';
import { useAuthStore } from '@/stores/authStore';
import { CameraStreamView } from '@/components/CameraStreamView';
import type { Camera } from '@/lib/cameras';

export default function CameraViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  const goBack = useCallback(() => {
    navigateStaffBack(router, navigation, pathname, STAFF_TABS_FALLBACK);
  }, [router, navigation, pathname]);
  const { staff } = useAuthStore();
  const [camera, setCamera] = useState<Camera | null>(null);
  const [recording, setRecording] = useState(false);
  const startTimeRef = useRef<Date>(new Date());

  useEffect(() => {
    if (!id) return;
    getCamera(id).then(setCamera);
  }, [id]);

  const logAction = useCallback(
    async (action: Parameters<typeof insertCameraLog>[0]['action'], extras?: { duration_seconds?: number }) => {
      if (!staff || !camera) return;
      try {
        await insertCameraLog({
          staff_id: staff.id,
          staff_name: staff.full_name ?? 'Personel',
          camera_id: camera.id,
          camera_name: camera.name,
          action,
          start_time: startTimeRef.current.toISOString(),
          end_time: new Date().toISOString(),
          ...extras,
        });
      } catch {
        // Log hatası sessizce
      }
    },
    [staff, camera]
  );

  useEffect(() => {
    if (!staff || !camera) return;
    startTimeRef.current = new Date();
    logAction('izleme_basladi');
    return () => {
      const duration = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000);
      logAction('izleme_bitirdi', { duration_seconds: duration });
    };
  }, [staff?.id, camera?.id]);

  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => handler.remove();
  }, [goBack]);

  const handleScreenshot = async () => {
    if (!camera || !staff) return;
    try {
      const { captureScreen } = await import('react-native-view-shot');
      const uri = await captureScreen({ format: 'png', quality: 0.9 });
      if (!uri) return;
      const filename = `kamera_${camera.name.replace(/\s/g, '_')}_${Date.now()}.png`;
      const dest = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest, {
          mimeType: 'image/png',
          dialogTitle: `${camera.name} - Ekran görüntüsü`,
        });
      }
      await logAction('fotograf_cekti');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ekran görüntüsü alınamadı.');
    }
  };

  const handleRecordToggle = async () => {
    if (!camera || !staff) return;
    if (recording) {
      setRecording(false);
      await logAction('kayit_durdurdu');
      Alert.alert('Bilgi', 'Kayıt durduruldu. Tapo kamera kendi SD/kayıt ayarlarına göre kaydeder.');
    } else {
      setRecording(true);
      await logAction('kayit_baslatti');
      Alert.alert('Bilgi', 'Kayıt başlatıldı (log). Gerçek kayıt kamera ayarlarına bağlıdır.');
    }
  };

  if (!camera) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.streamWrap}>
        <CameraStreamView camera={camera} useSubstream style={styles.stream} />
      </View>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={goBack} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{camera.name}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <TouchableOpacity style={styles.controlBtn} onPress={handleRecordToggle}>
          <View style={[styles.controlBtnInner, recording && styles.controlBtnActiveInner]}>
            <Ionicons
              name={recording ? 'stop-circle' : 'videocam'}
              size={26}
              color={recording ? '#ef4444' : '#fff'}
            />
          </View>
          <Text style={styles.controlLabel}>{recording ? 'Durdur' : 'Kayıt'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlBtn} onPress={handleScreenshot}>
          <View style={styles.controlBtnInner}>
            <Ionicons name="camera" size={26} color="#fff" />
          </View>
          <Text style={styles.controlLabel}>Fotoğraf</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.controlBtn}
          onPress={() => {
            logAction('kayit_indirdi');
            Alert.alert(
              'Kayıt indirme',
              'Tapo kamera kayıtları SD karta veya bulut depolamaya kaydedilir. Kayıtları indirmek için Tapo uygulamasını kullanın.'
            );
          }}
        >
          <View style={styles.controlBtnInner}>
            <Ionicons name="download-outline" size={26} color="#fff" />
          </View>
          <Text style={styles.controlLabel}>İndir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  headerBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  headerRight: { width: 32 },
  streamWrap: {
    flex: 1,
    backgroundColor: '#000',
  },
  stream: {
    flex: 1,
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 24,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  controlBtnActiveInner: {
    backgroundColor: 'rgba(239,68,68,0.4)',
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    marginTop: 6,
  },
});
