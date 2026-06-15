import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import type { Href } from 'expo-router';
import { clearAdminAutoOpenSuppress, isAdminAutoOpenSuppressed } from '@/lib/staffAdminTabNavigation';

/**
 * Admin sekmesi yedek ekranı.
 * Asıl geçiş tabPress / hamburger ile doğrudan /admin push ile yapılır.
 */
export default function StaffAdminTabRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const lastPushAtRef = useRef(0);

  const openAdminPanel = useCallback(() => {
    clearAdminAutoOpenSuppress();
    if (pathnameRef.current?.startsWith('/admin')) return;
    const now = Date.now();
    if (now - lastPushAtRef.current < 300) return;
    lastPushAtRef.current = now;
    router.push('/admin' as Href);
  }, [router]);

  /** Panelden çıkıldıktan sonra bu sekmede takılma */
  useFocusEffect(
    useCallback(() => {
      if (!pathnameRef.current?.startsWith('/admin') && isAdminAutoOpenSuppressed()) {
        router.replace('/staff/(tabs)' as Href);
        return;
      }
      if (pathnameRef.current?.startsWith('/admin')) return;
      if (isAdminAutoOpenSuppressed()) return;
      openAdminPanel();
    }, [router, openAdminPanel])
  );

  return <View style={styles.placeholder} />;
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
