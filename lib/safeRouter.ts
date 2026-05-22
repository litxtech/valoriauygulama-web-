import { Platform } from 'react-native';
import type { Href, Router } from 'expo-router';

/** Web / soğuk açılış: Root Layout mount olmadan router.replace hatasını önler */
export function safeRouterReplace(router: Pick<Router, 'replace'>, href: Href | string): void {
  const run = () => {
    try {
      router.replace(href as Href);
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (/before initialization|before mounting/i.test(msg)) {
        setTimeout(() => {
          try {
            router.replace(href as Href);
          } catch {
            /* ignore */
          }
        }, 50);
      }
    }
  };
  if (Platform.OS === 'web') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    run();
  }
}

export function safeRouterPush(router: Pick<Router, 'push'>, href: Href | string): void {
  const run = () => {
    try {
      router.push(href as Href);
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (/before initialization|before mounting/i.test(msg)) {
        setTimeout(() => {
          try {
            router.push(href as Href);
          } catch {
            /* ignore */
          }
        }, 50);
      }
    }
  };
  if (Platform.OS === 'web') {
    requestAnimationFrame(() => requestAnimationFrame(run));
  } else {
    run();
  }
}
