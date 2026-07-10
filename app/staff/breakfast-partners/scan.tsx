import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BarcodeScannerView } from '@/components/BarcodeScannerView';
import {
  canRedeemBreakfastGuestPass,
  parseBreakfastGuestPassTokenFromScan,
  redeemBreakfastGuestPass,
} from '@/lib/breakfastGuestPass';
import { useAuthStore } from '@/stores/authStore';

export default function BreakfastGuestPassScanScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canRedeemBreakfastGuestPass(staff);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) router.replace('/staff/breakfast-partners');
  }, [allowed, router]);

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const handleScan = async (data: string) => {
    if (busyRef.current) return;
    const token = parseBreakfastGuestPassTokenFromScan(data);
    if (!token) {
      Alert.alert(
        'Geçersiz QR',
        'Bu kod kahvaltı misafir bileti değil. Partner otelin verdiği QR kodu okutun.'
      );
      return;
    }

    busyRef.current = true;
    setBusy(true);
    const result = await redeemBreakfastGuestPass(token);
    busyRef.current = false;
    setBusy(false);

    if ('error' in result) {
      Alert.alert('Onaylanamadı', result.error);
      return;
    }

    const pass = result.pass;
    Alert.alert(
      'Kahvaltı onaylandı',
      `${pass.guestName}${pass.roomNumber ? ` · Oda ${pass.roomNumber}` : ''}\n${pass.partnerHotelName ?? 'Partner otel'}`,
      [
        { text: 'Tamam', onPress: () => router.back() },
        { text: 'Yeni okut', style: 'cancel' },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <BarcodeScannerView
        title="Kahvaltı QR okut"
        hint="Partner otelin misafir QR kodunu çerçeve içine alın"
        continuous={false}
        showCloseButton
        onClose={() => router.back()}
        onScan={({ data }) => {
          void handleScan(String(data));
        }}
      />
      {busy ? (
        <View style={styles.overlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
