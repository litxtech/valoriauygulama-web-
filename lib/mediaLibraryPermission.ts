import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { emitPermissionLiveChange } from '@/lib/permissionLive';

type EnsureMediaLibraryPermissionOptions = {
  title?: string;
  message?: string;
  settingsMessage?: string;
};

function askDisclosure(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(false) },
      { text: 'İzin ver', onPress: () => resolve(true) },
    ]);
  });
}

/** iOS'ta Alert kapandıktan sonra sistem izin penceresinin düzgün görünmesi için kısa gecikme */
function deferOnIos<T>(fn: () => Promise<T>): Promise<T> {
  if (Platform.OS === 'ios') {
    return new Promise((resolve, reject) => {
      setTimeout(() => fn().then(resolve).catch(reject), 200);
    });
  }
  return fn();
}

function askOpenSettings(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert('İzin gerekli', message, [
      { text: 'İptal', style: 'cancel', onPress: () => resolve(false) },
      {
        text: 'Ayarları aç',
        onPress: async () => {
          await Linking.openSettings().catch(() => {});
          resolve(false);
        },
      },
    ]);
  });
}

export async function ensureMediaLibraryPermission(
  options?: EnsureMediaLibraryPermissionOptions
): Promise<boolean> {
  // Android 13+: sistem Photo Picker; READ_MEDIA_IMAGES gerekmez (Play politikası).
  if (Platform.OS === 'android') {
    return true;
  }

  const title = options?.title ?? 'Galeri izni';
  const message =
    options?.message ??
    'Galeri iznini, uygulamada fotoğraf secip paylasmak/yuklemek icin istiyoruz.';
  const settingsMessage =
    options?.settingsMessage ??
    'Galeri izni kapali. Devam etmek icin ayarlardan galeri iznini acin.';

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.status === 'granted') {
    emitPermissionLiveChange();
    return true;
  }

  // canAskAgain false ise OS izin penceresi bir daha gösterilmez – ayarlara yönlendir
  if (current.canAskAgain === false) {
    await askOpenSettings(settingsMessage);
    return false;
  }

  // Uygulama içinde doğrudan sistem izin penceresini göster (Ara Alert atlanır)
  const requested = await deferOnIos(() =>
    ImagePicker.requestMediaLibraryPermissionsAsync()
  );
  emitPermissionLiveChange();
  if (requested.status === 'granted') return true;

  if (!requested.canAskAgain) {
    await askOpenSettings(settingsMessage);
  }
  return false;
}
