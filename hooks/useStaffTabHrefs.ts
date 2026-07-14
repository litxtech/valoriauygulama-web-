import { useMemo } from 'react';
import { staffTabFeatureId } from '@/lib/appFeatureCatalog';
import { isFeatureVisibleInPlacement } from '@/lib/organizationUiFeatures';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

const STAFF_TAB_ROUTES = [
  'index',
  'tasks',
  'messages',
  'emergency',
  'acceptances',
  'admin',
  'profile',
] as const;

export type StaffTabRouteName = (typeof STAFF_TAB_ROUTES)[number];

/** Tek store aboneliği — sekme href’leri (8× useStaffTabHref yerine). undefined = görünür, null = gizli. */
export function useStaffTabHrefs(): Record<StaffTabRouteName, null | undefined> {
  const config = useOrganizationUiFeaturesStore((s) => s.config);
  return useMemo(() => {
    const out = {} as Record<StaffTabRouteName, null | undefined>;
    for (const route of STAFF_TAB_ROUTES) {
      const featureId = staffTabFeatureId(route);
      if (!featureId) {
        out[route] = undefined;
        continue;
      }
      out[route] = isFeatureVisibleInPlacement(config, featureId, 'tab') ? undefined : null;
    }
    return out;
  }, [config]);
}
