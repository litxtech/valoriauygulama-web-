import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

const ACCOUNTING_ORG_STORAGE_KEY = 'admin_accounting_org_v1';

export type AdminOrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
  kind: string | null;
};

type AdminOrgState = {
  organizations: AdminOrganizationOption[];
  selectedOrganizationId: string | 'all';
  loading: boolean;
  loadedAt: number | null;
  accountingScopeActive: boolean;
  accountingCanUseAll: boolean;
  setSelectedOrganizationId: (id: string | 'all') => void;
  enterAccountingScope: (opts: { canUseAll: boolean; ownOrganizationId?: string | null }) => Promise<void>;
  leaveAccountingScope: () => void;
  loadOrganizations: (force?: boolean) => Promise<void>;
};

function isValidSelection(
  id: string | 'all',
  organizations: AdminOrganizationOption[],
  canUseAll: boolean
): boolean {
  if (id === 'all') return canUseAll;
  return organizations.some((o) => o.id === id);
}

async function readPersistedAccountingOrg(): Promise<string | 'all' | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTING_ORG_STORAGE_KEY);
    if (raw === 'all' || (raw && raw.length > 0)) return raw as string | 'all';
  } catch {
    // ignore
  }
  return null;
}

async function persistAccountingOrg(id: string | 'all'): Promise<void> {
  try {
    await AsyncStorage.setItem(ACCOUNTING_ORG_STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

export const useAdminOrgStore = create<AdminOrgState>((set, get) => ({
  organizations: [],
  selectedOrganizationId: 'all',
  loading: false,
  loadedAt: null,
  accountingScopeActive: false,
  accountingCanUseAll: false,

  setSelectedOrganizationId: (id) => {
    set({ selectedOrganizationId: id });
    if (get().accountingScopeActive) {
      void persistAccountingOrg(id);
    }
  },

  enterAccountingScope: async ({ canUseAll, ownOrganizationId }) => {
    set({ accountingScopeActive: true, accountingCanUseAll: canUseAll });
    await get().loadOrganizations();

    const { organizations } = get();
    const saved = await readPersistedAccountingOrg();

    if (saved && isValidSelection(saved, organizations, canUseAll)) {
      set({ selectedOrganizationId: saved });
      return;
    }

    if (!canUseAll && ownOrganizationId) {
      set({ selectedOrganizationId: ownOrganizationId });
      void persistAccountingOrg(ownOrganizationId);
      return;
    }

    const current = get().selectedOrganizationId;
    if (isValidSelection(current, organizations, canUseAll)) {
      void persistAccountingOrg(current);
    }
  },

  leaveAccountingScope: () => {
    set({ accountingScopeActive: false, accountingCanUseAll: false });
  },

  loadOrganizations: async (force = false) => {
    const state = get();
    if (state.loading) return;
    if (
      !force &&
      state.organizations.length > 0 &&
      state.loadedAt &&
      Date.now() - state.loadedAt < 120_000
    ) {
      return;
    }
    set({ loading: true });
    const { data } = await supabase.from('organizations').select('id,name,slug,kind').order('name');
    const organizations = ((data ?? []) as { id: string; name: string; slug: string | null; kind: string | null }[]).map(
      (o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        kind: o.kind,
      })
    );
    set((s) => {
      if (s.accountingScopeActive) {
        const exists = isValidSelection(s.selectedOrganizationId, organizations, s.accountingCanUseAll);
        const fallback: string | 'all' = s.accountingCanUseAll
          ? 'all'
          : organizations[0]?.id ?? 'all';
        return {
          organizations,
          selectedOrganizationId: exists ? s.selectedOrganizationId : fallback,
          loading: false,
          loadedAt: Date.now(),
        };
      }
      const exists =
        s.selectedOrganizationId === 'all' ||
        organizations.some((o) => o.id === s.selectedOrganizationId);
      return {
        organizations,
        selectedOrganizationId: exists ? s.selectedOrganizationId : 'all',
        loading: false,
        loadedAt: Date.now(),
      };
    });

    if (get().accountingScopeActive) {
      const { organizations, accountingCanUseAll } = get();
      const saved = await readPersistedAccountingOrg();
      if (saved && isValidSelection(saved, organizations, accountingCanUseAll)) {
        set({ selectedOrganizationId: saved });
      }
    }
  },
}));
