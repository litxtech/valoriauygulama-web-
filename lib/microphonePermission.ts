import { Alert, Linking } from 'react-native';
import { Audio } from 'expo-av';

type PermissionCopy = {
  title: string;
  message: string;
  settingsMessage: string;
};

export async function ensureMicrophonePermission(copy?: PermissionCopy): Promise<boolean> {
  const { status: existing } = await Audio.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Audio.requestPermissionsAsync();
  if (status === 'granted') return true;
  if (copy && status !== 'undetermined') {
    Alert.alert(copy.title, copy.settingsMessage, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Ayarları aç',
        onPress: () => Linking.openSettings(),
      },
    ]);
  }
  return false;
}
