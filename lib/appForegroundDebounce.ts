import { AppState, type AppStateStatus } from 'react-native';

/**
 * Uygulama ön plana gelince tek seferde çalıştır (Android'de ardışık AppState + layout
 * olaylarında aynı anda birden fazla ağır refresh tetiklenmesin).
 */
export function subscribeAppForegroundDebounced(
  callback: () => void,
  debounceMs = 450
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const onChange = (state: AppStateStatus) => {
    if (state !== 'active') return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      callback();
    }, debounceMs);
  };

  const sub = AppState.addEventListener('change', onChange);
  return () => {
    if (timer) clearTimeout(timer);
    sub.remove();
  };
}
