import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { MealMenuEditor } from '@/components/mealMenu/MealMenuEditor';

export default function AdminMealMenuScreen() {
  const staff = useAuthStore((s) => s.staff);
  const { selectedOrganizationId } = useAdminOrgStore();

  const effectiveOrgId = useMemo(() => {
    if (staff?.role === 'admin') {
      if (selectedOrganizationId === 'all') return null;
      return selectedOrganizationId;
    }
    return staff?.organization_id ?? null;
  }, [staff?.role, staff?.organization_id, selectedOrganizationId]);

  return (
    <MealMenuEditor
      effectiveOrgId={effectiveOrgId}
      staffId={staff?.id}
      staffRole={staff?.role}
      showPdf
      headerSlot={
        <View style={styles.orgRow}>
          <AdminOrganizationPicker canUseAll={staff?.role === 'admin'} ownOrganizationId={staff?.organization_id} />
        </View>
      }
      noOrgTitle="Otel seçin"
      noOrgMessage={
        staff?.role === 'admin'
          ? 'Menüyü düzenlemek için üstten tek bir otel seçin. “Tüm oteller” ile kayıt yapılamaz.'
          : 'Hesabınıza organizasyon atanmış olmalı.'
      }
    />
  );
}

const styles = StyleSheet.create({
  orgRow: { marginBottom: 4 },
});
