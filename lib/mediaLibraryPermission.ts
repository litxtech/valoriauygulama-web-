import { Alert, Linking, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { emitPermissionLiveChange } from '@/lib/permissionLive';

export type EnsureMediaLibraryPermissionOptions = {
  title?: string;
  message?: string;
  settingsMessage?: string;
};

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

/**
 * Galeriyi gecikmesiz açar: önce izin diyaloğu göstermez (iOS’ta sistem picker ile birlikte istenir).
 * Kalıcı red durumunda ayarlara yönlendirir.
 */
export async function launchImageLibraryFast(
  pickerOptions: ImagePicker.ImagePickerOptions,
  settingsMessage?: string
): Promise<ImagePicker.ImagePickerResult | null> {
  if (Platform.OS === 'android') {
    return ImagePicker.launchImageLibraryAsync(pickerOptions);
  }

  const settingsMsg =
    settingsMessage ??
    'Galeri izni kapalı. Devam etmek için ayarlardan galeri iznini açın.';

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.status === 'granted') {
    emitPermissionLiveChange();
    return ImagePicker.launchImageLibraryAsync(pickerOptions);
  }
  if (current.canAskAgain === false) {
    await askOpenSettings(settingsMsg);
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);
  emitPermissionLiveChange();
  return result;
}

export async function ensureMediaLibraryPermission(
  options?: EnsureMediaLibraryPermissionOptions
): Promise<boolean> {
  // Android 13+: sistem Photo Picker; READ_MEDIA_IMAGES gerekmez (Play politikası).
  if (Platform.OS === 'android') {
    return true;
  }

  const settingsMessage =
    options?.settingsMessage ??
    'Galeri izni kapalı. Devam etmek için ayarlardan galeri iznini açın.';

  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.status === 'granted') {
    emitPermissionLiveChange();
    return true;
  }

  if (current.canAskAgain === false) {
    await askOpenSettings(settingsMessage);
    return false;
  }

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
