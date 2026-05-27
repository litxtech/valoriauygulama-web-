import { useMemo } from 'react';
import type { AppFeaturePlacement } from '@/lib/appFeatureCatalog';
import { customerTabFeatureId, staffTabFeatureId } from '@/lib/appFeatureCatalog';
import { isFeatureVisibleInPlacement } from '@/lib/organizationUiFeatures';
import { useOrganizationUiFeaturesStore } from '@/stores/organizationUiFeaturesStore';

export function useAppFeatureVisible(featureId: string, placement: AppFeaturePlacement): boolean {
  const config = useOrganizationUiFeaturesStore((s) => s.config);
  return useMemo(
    () => isFeatureVisibleInPlacement(config, featureId, placement),
    [config, featureId, placement]
  );
}

/** Expo tab: görünür mü (href null = gizli) */
export function useStaffTabHref(routeName: string): string | null | undefined {
  const config = useOrganizationUiFeaturesStore((s) => s.config);
  const featureId = staffTabFeatureId(routeName);
  if (!featureId) return undefined;
  return isFeatureVisibleInPlacement(config, featureId, 'tab') ? undefined : null;
}

export function useCustomerTabHref(routeName: string): string | null | undefined {
  const config = useOrganizationUiFeaturesStore((s) => s.config);
  const featureId = customerTabFeatureId(routeName);
  if (!featureId) return undefined;
  return isFeatureVisibleInPlacement(config, featureId, 'tab') ? undefined : null;
}
