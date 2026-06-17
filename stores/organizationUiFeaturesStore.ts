import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
  teardown: () => void;
};

async function resolveOrganizationId(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const { data } = await supabase.from('organizations').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle();
  return data?.id ?? null;
}

let uiFeaturesChannel: RealtimeChannel | null = null;

function teardownUiFeaturesChannel() {
  if (uiFeaturesChannel) {
    void supabase.removeChannel(uiFeaturesChannel);
    uiFeaturesChannel = null;
  }
}

function subscribeUiFeatures(orgId: string, onUpdate: (config: OrganizationUiFeaturesConfig) => void) {
  teardownUiFeaturesChannel();
  uiFeaturesChannel = supabase
    .channel(`org-ui-features-${orgId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'organizations', filter: `id=eq.${orgId}` },
      (payload) => {
        const row = payload.new as { ui_features?: unknown };
        const normalized = normalizeOrganizationUiFeatures(row?.ui_features);
        onUpdate(mergeOrganizationUiFeatures(normalized));
      }
    )
    .subscribe();
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
        teardownUiFeaturesChannel();
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
      const merged = mergeOrganizationUiFeatures(normalized);
      set({
        organizationId: orgId,
        config: merged,
        loading: false,
      });
      subscribeUiFeatures(orgId, (config) => {
        const current = get().organizationId;
        if (current === orgId) set({ config });
      });
    } catch {
      teardownUiFeaturesChannel();
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

  teardown: () => {
    teardownUiFeaturesChannel();
    set({ organizationId: null, config: null, loading: false });
  },
}));
