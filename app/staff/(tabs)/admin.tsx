import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, InteractionManager, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Href } from 'expo-router';
import { clearAdminAutoOpenSuppress, isAdminAutoOpenSuppressed } from '@/lib/staffAdminTabNavigation';

/**
 * Admin sekmesi: bilinçli girişte /admin açılır.
 * Panelden geri çıkıldıktan sonra otomatik yeniden açılmaz (suppress).
 */
export default function StaffAdminTabRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const isInAdminStack = Boolean(pathname?.startsWith('/admin'));
  const lastPushAtRef = useRef(0);

  const openAdminPanel = useCallback(() => {
    clearAdminAutoOpenSuppress();
    if (pathnameRef.current?.startsWith('/admin')) return;
    const now = Date.now();
    if (now - lastPushAtRef.current < 500) return;
    lastPushAtRef.current = now;
    router.push('/admin');
  }, [router]);

  /** Panelden çıkıldıktan sonra (native pop vb.) bu sekmede “Yönetim Paneli” ekranında takılma */
  useFocusEffect(
    useCallback(() => {
      if (!pathnameRef.current?.startsWith('/admin') && isAdminAutoOpenSuppressed()) {
        router.replace('/staff/(tabs)' as Href);
        return;
      }
    }, [router])
  );

  useFocusEffect(
    useCallback(() => {
      if (pathnameRef.current?.startsWith('/admin')) return;
      if (isAdminAutoOpenSuppressed()) return;

      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        if (pathnameRef.current?.startsWith('/admin')) return;
        if (isAdminAutoOpenSuppressed()) return;
        const now = Date.now();
        if (now - lastPushAtRef.current < 500) return;
        lastPushAtRef.current = now;
        router.push('/admin');
      });

      return () => {
        cancelled = true;
        (task as { cancel?: () => void })?.cancel?.();
      };
    }, [router])
  );

  if (isInAdminStack) {
    return <View style={styles.placeholder} />;
  }

  return (
    <View style={styles.placeholder}>
      <ActivityIndicator size="large" color="#b8860b" />
      <Text style={styles.hint}>{t('managementPanel')}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={openAdminPanel} activeOpacity={0.85}>
        <Text style={styles.retryText}>Panele git</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    gap: 12,
    padding: 24,
  },
  hint: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#b8860b',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
