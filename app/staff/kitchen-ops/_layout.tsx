import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StaffStackBackButton, STAFF_TABS_FALLBACK, buildStaffNestedStackOptions } from '@/lib/staffStackBack';

export default function KitchenOpsLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={buildStaffNestedStackOptions(t)}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Mutfak Operasyon',
          headerLeft: () => <StaffStackBackButton fallback={STAFF_TABS_FALLBACK} />,
        }}
      />
      <Stack.Screen name="stock/entry" options={{ title: 'Stok Ekle' }} />
      <Stack.Screen name="stock/exit" options={{ title: 'Stok Çıkışı' }} />
      <Stack.Screen name="stock/current" options={{ title: 'Mevcut Stok' }} />
      <Stack.Screen name="stock/low" options={{ title: 'Azalan Ürünler' }} />
      <Stack.Screen name="shortages/index" options={{ title: 'Mutfak Eksikleri' }} />
      <Stack.Screen name="shortages/report/[id]" options={{ title: 'Eksik Listesi' }} />
      <Stack.Screen name="stock/scan" options={{ title: 'Barkod Oku', headerShown: false }} />
      <Stack.Screen name="stock/product/[id]" options={{ title: 'Ürün Detayı' }} />
      <Stack.Screen name="revenue/index" options={{ title: 'Hasılat' }} />
      <Stack.Screen name="revenue/new" options={{ title: 'Hasılat Gir' }} />
      <Stack.Screen name="expenses/index" options={{ title: 'Giderler' }} />
      <Stack.Screen name="expenses/new" options={{ title: 'Gider Gir' }} />
      <Stack.Screen name="personnel/index" options={{ title: 'Personel Ödemeleri' }} />
      <Stack.Screen name="personnel/new" options={{ title: 'Ödeme Kaydı' }} />
      <Stack.Screen name="suppliers/index" options={{ title: 'Tedarikçi Borçları' }} />
      <Stack.Screen name="suppliers/new" options={{ title: 'Borç Kaydı' }} />
      <Stack.Screen name="cari/index" options={{ title: 'Otel - Mutfak Cari' }} />
      <Stack.Screen name="pos/index" options={{ title: 'POS İşlemleri' }} />
      <Stack.Screen name="pos/new" options={{ title: 'POS Kaydı' }} />
      <Stack.Screen name="settlements/index" options={{ title: 'Ödeme / Mahsup' }} />
      <Stack.Screen name="settlements/new" options={{ title: 'Yeni Ödeme' }} />
      <Stack.Screen name="handovers/index" options={{ title: 'Mutfak Teslim Kayıtları' }} />
      <Stack.Screen name="handovers/new" options={{ title: 'Teslim Kaydı' }} />
      <Stack.Screen name="handovers/[id]" options={{ title: 'Teslim Detayı' }} />
      <Stack.Screen name="day-close/index" options={{ title: 'Gün Sonu Kapanış' }} />
      <Stack.Screen name="finance/index" options={{ title: 'Finans Özet' }} />
      <Stack.Screen name="reception" options={{ title: 'Reception Muhasebe' }} />
    </Stack>
  );
}
