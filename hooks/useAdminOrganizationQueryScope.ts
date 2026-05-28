import { useEffect, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { resolveAdminListOrganizationId } from '@/lib/organizationScope';

/** Admin liste ekranları için işletme seçimi + sorgu org id'si. */
export function useAdminOrganizationQueryScope() {
  const staff = useAuthStore((s) => s.staff);
  const {
    selectedOrganizationId,
    organizations,
    hydrateSelectedOrganization,
    orgHydrated,
  } = useAdminOrgStore();

  const canUseAll =
    staff?.app_permissions?.super_admin === true || staff?.role === 'admin';

  useEffect(() => {
    if (orgHydrated) return;
    void hydrateSelectedOrganization({
      canUseAll,
      ownOrganizationId: staff?.organization_id,
    });
  }, [canUseAll, hydrateSelectedOrganization, orgHydrated, staff?.organization_id]);

  const orgScoped = useMemo(
    () =>
      resolveAdminListOrganizationId({
        canUseAll,
        selectedOrganizationId,
        ownOrganizationId: staff?.organization_id,
        fallbackOrganizationId: organizations[0]?.id,
      }),
    [canUseAll, organizations, selectedOrganizationId, staff?.organization_id]
  );

  const canQuery = canUseAll || !!orgScoped;

  return {
    staff,
    canUseAll,
    selectedOrganizationId,
    orgScoped,
    canQuery,
  };
}
