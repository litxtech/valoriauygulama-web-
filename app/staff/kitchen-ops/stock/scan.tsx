import { useCallback, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { BarcodeScannerView, type BarcodeScanResult } from '@/components/BarcodeScannerView';
import { fetchKitchenItemByBarcode } from '@/lib/kitchenOps/api';

export default function KitchenStockScanScreen() {
  const router = useRouter();
  const handling = useRef(false);

  const onScan = useCallback(
    async (result: BarcodeScanResult) => {
      if (handling.current) return;
      handling.current = true;
      const code = result.data.trim();
      try {
        const item = await fetchKitchenItemByBarcode(code);
        if (item) {
          router.replace({
            pathname: '/staff/kitchen-ops/stock/entry',
            params: { itemId: item.id, barcode: code },
          } as never);
        } else {
          router.replace({
            pathname: '/staff/kitchen-ops/stock/entry',
            params: { barcode: code },
          } as never);
        }
      } catch (e) {
        Alert.alert('Hata', (e as Error).message);
        handling.current = false;
      }
    },
    [router]
  );

  return (
    <View style={styles.container}>
      <BarcodeScannerView
        onScan={onScan}
        onClose={() => router.back()}
        title="Mutfak Barkod"
        hint="Ürün barkodunu okutun — kayıtlıysa otomatik açılır"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
