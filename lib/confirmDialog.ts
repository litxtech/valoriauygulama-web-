import { Alert, Platform } from 'react-native';

type ConfirmDialogOptions = {
  title: string;
  message: string;
  cancelText: string;
  confirmText: string;
  destructive?: boolean;
};

/**
 * Native: Alert.alert — Web: window.confirm
 * (RN Alert web'de no-op; çıkış gibi onaylar sessizce başarısız oluyordu.)
 */
export function confirmDialog(opts: ConfirmDialogOptions): Promise<boolean> {
  if (Platform.OS === 'web') {
    const text = [opts.title, opts.message].filter(Boolean).join('\n\n');
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(opts.title, opts.message, [
      { text: opts.cancelText, style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmText,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]);
  });
}
