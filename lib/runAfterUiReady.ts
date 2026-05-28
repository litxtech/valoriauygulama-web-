import { InteractionManager, Platform } from 'react-native';

type Cancelable = { cancel: () => void };

/** Android: ağır işleri ilk kare / animasyon sonrasına ertele. iOS’ta hemen çalıştır. */
export function runAfterUiReady(fn: () => void, opts?: { androidOnly?: boolean; delayMs?: number }): Cancelable {
  const androidOnly = opts?.androidOnly !== false;
  const delayMs = opts?.delayMs ?? 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;

  const invoke = () => {
    if (cancelled) return;
    if (delayMs > 0) {
      timeoutId = setTimeout(() => {
        if (!cancelled) fn();
      }, delayMs);
      return;
    }
    fn();
  };

  const cancel = () => {
    cancelled = true;
    if (timeoutId) clearTimeout(timeoutId);
  };

  if (androidOnly && Platform.OS !== 'android') {
    invoke();
    return { cancel };
  }

  const task = InteractionManager.runAfterInteractions(invoke);
  return {
    cancel: () => {
      cancel();
      task.cancel();
    },
  };
}

export function isAndroid(): boolean {
  return Platform.OS === 'android';
}
