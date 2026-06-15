import { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
  title?: string;
  hint?: string;
};

export function ReceiptPhotoCameraModal({
  visible,
  onClose,
  onCaptured,
  title = 'Fiş fotoğrafı',
  hint = 'Fişi net çekin — tam ekran önizleme',
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const handleClose = useCallback(() => {
    if (capturing) return;
    setReady(false);
    onClose();
  }, [capturing, onClose]);

  const handleCapture = useCallback(async () => {
    if (capturing || !ready || !cameraRef.current) return;
    setCapturing(true);
    try {
      const shot = await cameraRef.current.takePictureAsync({
        quality: Platform.OS === 'android' ? 0.9 : 0.85,
        skipProcessing: false,
        shutterSound: true,
      });
      if (shot?.uri) {
        onCaptured(shot.uri);
        setReady(false);
        onClose();
      }
    } finally {
      setCapturing(false);
    }
  }, [capturing, ready, onCaptured, onClose]);

  const granted = permission?.granted === true;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.root}>
        {granted ? (
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFillObject}
            facing="back"
            mode="picture"
            autofocus="on"
            animateShutter={false}
            onCameraReady={() => setReady(true)}
          />
        ) : (
          <View style={styles.permissionBlock}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text style={styles.permissionTitle}>Kamera izni gerekli</Text>
            <Text style={styles.permissionBody}>Fiş fotoğrafı çekmek için kameraya erişim verin.</Text>
            <Pressable style={styles.permissionBtn} onPress={() => void requestPermission()}>
              <Text style={styles.permissionBtnText}>İzin ver</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
            <Pressable
              style={styles.iconBtn}
              onPress={handleClose}
              accessibilityLabel="Kapat"
              disabled={capturing}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
            <Text style={styles.title}>{title}</Text>
            <View style={styles.topBarSpacer} />
          </View>

          {granted && !ready ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#fff" size="large" />
            </View>
          ) : null}

          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
            <Text style={styles.hint}>{hint}</Text>
            <Pressable
              style={[styles.shutterOuter, (!ready || capturing) && styles.shutterDisabled]}
              onPress={() => void handleCapture()}
              disabled={!granted || !ready || capturing}
              accessibilityLabel="Fotoğraf çek"
            >
              {capturing ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
  topBarSpacer: {
    width: 44,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomBar: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  hint: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#fff',
  },
  permissionBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  permissionBody: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  permissionBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
