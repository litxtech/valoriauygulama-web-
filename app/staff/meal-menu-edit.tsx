import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { canManageStaffMealMenu } from '@/lib/staffPermissions';
import { MealMenuEditor } from '@/components/mealMenu/MealMenuEditor';

export default function StaffMealMenuEditScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canManageStaffMealMenu(staff);

  useEffect(() => {
    if (staff && !allowed) {
      Alert.alert(t('staffMealMenuNoPermissionTitle'), t('staffMealMenuNoPermissionMessage'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    }
  }, [staff, allowed, router, t]);

  if (!staff || !allowed) {
    return null;
  }

  return (
    <MealMenuEditor
      effectiveOrgId={staff.organization_id ?? null}
      staffId={staff.id}
      staffRole={staff.role}
      showPdf
      canEditPdfMeta
    />
  );
}
