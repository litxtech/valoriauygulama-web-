import { useFocusEffect } from 'expo-router';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, InteractionManager } from 'react-native';
import { onStaffExitedAdminPanelFromRoot } from '@/lib/staffAdminTabNavigation';

/**
 * Admin yetkili personel bu sekmeye tıkladığında doğrudan yönetim paneline gider.
 * Tab bar'da sadece role === 'admin' iken görünür.
 */
export default function StaffAdminTabRedirect() {
  const router = useRouter();
  const navigatedRef = useRef(false);

  useEffect(
    () =>
      onStaffExitedAdminPanelFromRoot(() => {
        navigatedRef.current = false;
      }),
    []
  );

  useFocusEffect(
    useCallback(() => {
      // Tab focus anında anında replace bazı Android/Fabric sürümlerinde mount yarışına düşürebiliyor.
      // Bir sonraki interaction frame'e ertelemek genelde stabil.
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      const task = InteractionManager.runAfterInteractions(() => {
        // push: tab navigator ağacını korur; replace ile tab ekranı "koparılıp" yeniden eklenirken oluşan
        // native mount hatalarını azaltır.
        router.push('/admin');
      });
      return () => {
        // navigatedRef burada sıfırlanmamalı: /admin açılırken tab blur olur; sıfırlanırsa geri dönüşte
        // aynı odakta /admin yeniden push edilir (Android'de geri tuşu zorlanır).
        (task as { cancel?: () => void })?.cancel?.();
      };
    }, [router])
  );

  return (
    <View style={styles.placeholder}>
      <ActivityIndicator size="large" color="#b8860b" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
});
