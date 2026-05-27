import {
  APP_FEATURE_BY_ID,
  APP_FEATURE_CATALOG,
  type AppFeatureAudience,
  type AppFeaturePlacement,
} from '@/lib/appFeatureCatalog';

export type FeatureOverride = {
  enabled?: boolean;
  placements?: AppFeaturePlacement[];
};

export type OrganizationUiFeaturesConfig = {
  v: 1;
  features: Record<string, FeatureOverride>;
};

export const EMPTY_UI_FEATURES: OrganizationUiFeaturesConfig = { v: 1, features: {} };

export function normalizeOrganizationUiFeatures(raw: unknown): OrganizationUiFeaturesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY_UI_FEATURES };
  }
  const o = raw as Record<string, unknown>;
  const featuresRaw = o.features;
  const features: Record<string, FeatureOverride> = {};
  if (featuresRaw && typeof featuresRaw === 'object' && !Array.isArray(featuresRaw)) {
    for (const [key, val] of Object.entries(featuresRaw)) {
      const def = APP_FEATURE_BY_ID.get(key);
      if (!def) continue;
      if (!val || typeof val !== 'object' || Array.isArray(val)) continue;
      const v = val as FeatureOverride;
      const placements = Array.isArray(v.placements)
        ? v.placements.filter((p): p is AppFeaturePlacement =>
            typeof p === 'string' && def.defaultPlacements.includes(p as AppFeaturePlacement)
          )
        : undefined;
      features[key] = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : undefined,
        placements: placements?.length ? placements : undefined,
      };
    }
  }
  return { v: 1, features };
}

export function resolveFeatureEnabled(config: OrganizationUiFeaturesConfig | null | undefined, featureId: string): boolean {
  const def = APP_FEATURE_BY_ID.get(featureId);
  if (!def) return false;
  if (def.locked) return true;
  const override = config?.features?.[featureId];
  if (override?.enabled === false) return false;
  if (override?.enabled === true) return true;
  return def.defaultEnabled;
}

export function resolveFeaturePlacements(
  config: OrganizationUiFeaturesConfig | null | undefined,
  featureId: string
): AppFeaturePlacement[] {
  const def = APP_FEATURE_BY_ID.get(featureId);
  if (!def) return [];
  const override = config?.features?.[featureId];
  if (override?.placements?.length) return override.placements;
  return [...def.defaultPlacements];
}

export function isFeatureVisibleInPlacement(
  config: OrganizationUiFeaturesConfig | null | undefined,
  featureId: string,
  placement: AppFeaturePlacement
): boolean {
  if (!resolveFeatureEnabled(config, featureId)) return false;
  return resolveFeaturePlacements(config, featureId).includes(placement);
}

export function buildDefaultOrganizationUiFeatures(): OrganizationUiFeaturesConfig {
  const features: Record<string, FeatureOverride> = {};
  for (const entry of APP_FEATURE_CATALOG) {
    features[entry.id] = {
      enabled: entry.defaultEnabled,
      placements: [...entry.defaultPlacements],
    };
  }
  return { v: 1, features };
}

export function mergeOrganizationUiFeatures(
  stored: OrganizationUiFeaturesConfig | null | undefined
): OrganizationUiFeaturesConfig {
  const defaults = buildDefaultOrganizationUiFeatures();
  if (!stored?.features) return defaults;
  const merged: Record<string, FeatureOverride> = { ...defaults.features };
  for (const [id, override] of Object.entries(stored.features)) {
    if (!APP_FEATURE_BY_ID.has(id)) continue;
    merged[id] = {
      enabled: override.enabled ?? merged[id]?.enabled,
      placements: override.placements?.length ? override.placements : merged[id]?.placements,
    };
  }
  return { v: 1, features: merged };
}

export function catalogGroupedByAudience(): Record<AppFeatureAudience, typeof APP_FEATURE_CATALOG> {
  return {
    staff: APP_FEATURE_CATALOG.filter((e) => e.audience === 'staff'),
    customer: APP_FEATURE_CATALOG.filter((e) => e.audience === 'customer'),
  };
}
