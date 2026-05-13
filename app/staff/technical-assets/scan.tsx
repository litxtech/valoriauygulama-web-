import { useEffect } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { BarcodeScannerView } from '@/components/BarcodeScannerView';
import { parseTechnicalAssetIdFromScan } from '@/lib/technicalAssets';
import { hasTechnicalAssetsStaffAccess } from '@/lib/staffPermissions';
import { useAuthStore } from '@/stores/authStore';

export default function TechnicalAssetScanScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const allowed = hasTechnicalAssetsStaffAccess(staff);

  useEffect(() => {
    if (!allowed) router.replace('/staff/technical-assets');
  }, [allowed, router]);

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BarcodeScannerView
        title="Teknik varlık QR"
        hint="Etiketteki QR kodu çerçeve içine alın"
        continuous={false}
        showCloseButton
        onClose={() => router.back()}
        onScan={({ data }) => {
          const id = parseTechnicalAssetIdFromScan(String(data));
          if (!id) {
            Alert.alert(
              'Geçersiz QR',
              'Bu kod teknik varlık etiketi değil. valoria:///staff/technical-assets/… veya valoria://tech-asset/… (eski) formatındaki etiketi okutun.'
            );
            return;
          }
          router.replace({ pathname: '/staff/technical-assets/[id]', params: { id } } as never);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
});
