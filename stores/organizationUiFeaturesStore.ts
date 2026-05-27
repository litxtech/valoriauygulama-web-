import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { AppFeaturePlacement } from '@/lib/appFeatureCatalog';
import {
  isFeatureVisibleInPlacement,
  mergeOrganizationUiFeatures,
  normalizeOrganizationUiFeatures,
  type OrganizationUiFeaturesConfig,
} from '@/lib/organizationUiFeatures';

type State = {
  organizationId: string | null;
  config: OrganizationUiFeaturesConfig | null;
  loading: boolean;
  load: (organizationId?: string | null) => Promise<void>;
  setConfig: (config: OrganizationUiFeaturesConfig) => void;
  isVisible: (featureId: string, placement: AppFeaturePlacement) => boolean;
};

async function resolveOrganizationId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const { data } = await supabase.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

export const useOrganizationUiFeaturesStore = create<State>((set, get) => ({
  organizationId: null,
  config: null,
  loading: false,

  load: async (organizationId) => {
    set({ loading: true });
    try {
      const orgId = await resolveOrganizationId(organizationId);
      if (!orgId) {
        set({ organizationId: null, config: mergeOrganizationUiFeatures(null), loading: false });
        return;
      }
      const { data, error } = await supabase
        .from('organizations')
        .select('ui_features')
        .eq('id', orgId)
        .maybeSingle();
      if (error) throw error;
      const normalized = normalizeOrganizationUiFeatures(data?.ui_features);
      set({
        organizationId: orgId,
        config: mergeOrganizationUiFeatures(normalized),
        loading: false,
      });
    } catch {
      set({
        config: mergeOrganizationUiFeatures(null),
        loading: false,
      });
    }
  },

  setConfig: (config) => set({ config: mergeOrganizationUiFeatures(config) }),

  isVisible: (featureId, placement) => {
    const { config } = get();
    return isFeatureVisibleInPlacement(config, featureId, placement);
  },
}));
