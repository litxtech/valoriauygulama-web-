import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

/** Admin panellerinde (denetim, stok, onay…) son seçilen işletme */
const ADMIN_ORG_STORAGE_KEY = 'admin_selected_org_v1';
const ACCOUNTING_ORG_STORAGE_KEY = 'admin_accounting_org_v1';

export type AdminOrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
  kind: string | null;
  /** PDF / yazdır üst başlık; boşsa name */
  finance_report_brand: string | null;
};

type AdminOrgState = {
  organizations: AdminOrganizationOption[];
  selectedOrganizationId: string | 'all';
  loading: boolean;
  loadError: string | null;
  loadedAt: number | null;
  accountingScopeActive: boolean;
  accountingCanUseAll: boolean;
  orgHydrated: boolean;
  setSelectedOrganizationId: (id: string | 'all') => void;
  hydrateSelectedOrganization: (opts: {
    canUseAll: boolean;
    ownOrganizationId?: string | null;
  }) => Promise<void>;
  enterAccountingScope: (opts: {
    canUseAll: boolean;
    ownOrganizationId?: string | null;
  }) => Promise<void>;
  leaveAccountingScope: () => void;
  loadOrganizations: (force?: boolean) => Promise<void>;
};

function isValidSelection(
  id: string | 'all',
  organizations: AdminOrganizationOption[],
  canUseAll: boolean
): boolean {
  if (id === 'all') return canUseAll;
  if (!organizations.length) return false;
  return organizations.some((o) => o.id === id);
}

async function readPersistedOrg(): Promise<string | 'all' | null> {
  try {
    const admin = await AsyncStorage.getItem(ADMIN_ORG_STORAGE_KEY);
    if (admin === 'all' || (admin && admin.length > 0)) return admin as string | 'all';
    const accounting = await AsyncStorage.getItem(ACCOUNTING_ORG_STORAGE_KEY);
    if (accounting === 'all' || (accounting && accounting.length > 0)) {
      return accounting as string | 'all';
    }
  } catch {
    // ignore
  }
  return null;
}

async function persistOrg(id: string | 'all', accountingToo: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ADMIN_ORG_STORAGE_KEY, id);
    if (accountingToo) {
      await AsyncStorage.setItem(ACCOUNTING_ORG_STORAGE_KEY, id);
    }
  } catch {
    // ignore
  }
}

let loadInflight: Promise<void> | null = null;

export const useAdminOrgStore = create<AdminOrgState>((set, get) => ({
  organizations: [],
  selectedOrganizationId: 'all',
  loading: false,
  loadError: null,
  loadedAt: null,
  accountingScopeActive: false,
  accountingCanUseAll: false,
  orgHydrated: false,

  setSelectedOrganizationId: (id) => {
    set({ selectedOrganizationId: id, orgHydrated: true });
    void persistOrg(id, get().accountingScopeActive);
  },

  hydrateSelectedOrganization: async ({ canUseAll, ownOrganizationId }) => {
    await get().loadOrganizations();
    const { organizations, selectedOrganizationId } = get();

    if (!canUseAll) {
      if (ownOrganizationId) {
        set({ selectedOrganizationId: ownOrganizationId, orgHydrated: true });
        void persistOrg(ownOrganizationId, get().accountingScopeActive);
      } else {
        set({ orgHydrated: true });
      }
      return;
    }

    // Manuel seçim zaten geçerliyse koru
    if (isValidSelection(selectedOrganizationId, organizations, true)) {
      set({ orgHydrated: true });
      void persistOrg(selectedOrganizationId, get().accountingScopeActive);
      return;
    }

    const saved = await readPersistedOrg();
    if (saved && isValidSelection(saved, organizations, true)) {
      set({ selectedOrganizationId: saved, orgHydrated: true });
      return;
    }

    // Son çare: ilk işletme veya tümü — ama boş listede seçimi bozma
    if (!organizations.length) {
      set({ orgHydrated: true });
      return;
    }

    set({
      selectedOrganizationId: organizations[0]?.id ?? 'all',
      orgHydrated: true,
    });
  },

  enterAccountingScope: async ({ canUseAll, ownOrganizationId }) => {
    set({ accountingScopeActive: true, accountingCanUseAll: canUseAll });
    await get().loadOrganizations();

    const { organizations, selectedOrganizationId } = get();

    if (!canUseAll && ownOrganizationId) {
      set({ selectedOrganizationId: ownOrganizationId, orgHydrated: true });
      void persistOrg(ownOrganizationId, true);
      return;
    }

    // Geçerli mevcut seçimi bozma
    if (isValidSelection(selectedOrganizationId, organizations, canUseAll)) {
      set({ orgHydrated: true });
      void persistOrg(selectedOrganizationId, true);
      return;
    }

    const saved = await readPersistedOrg();
    if (saved && isValidSelection(saved, organizations, canUseAll)) {
      set({ selectedOrganizationId: saved, orgHydrated: true });
      void persistOrg(saved, true);
      return;
    }

    if (!organizations.length) {
      set({ orgHydrated: true });
      return;
    }

    const fallback: string | 'all' = canUseAll ? 'all' : organizations[0].id;
    set({ selectedOrganizationId: fallback, orgHydrated: true });
    void persistOrg(fallback, true);
  },

  leaveAccountingScope: () => {
    set({ accountingScopeActive: false, accountingCanUseAll: false });
  },

  loadOrganizations: async (force = false) => {
    const state = get();
    if (
      !force &&
      state.organizations.length > 0 &&
      state.loadedAt &&
      Date.now() - state.loadedAt < 120_000
    ) {
      return;
    }

    if (loadInflight) {
      if (!force) return loadInflight;
      // force: in-flight bitsin, sonra yeniden çek
      await loadInflight;
    }

    const run = (async () => {
      set({ loading: true, loadError: null });
      try {
        const { data, error } = await supabase
          .from('organizations')
          .select('id,name,slug,kind,finance_report_brand')
          .order('name');

        if (error) {
          set({
            loading: false,
            loadError: error.message || 'İşletmeler yüklenemedi',
            // Boş başarı önbelleği yazma — tekrar denenebilsin
            loadedAt: get().organizations.length > 0 ? get().loadedAt : null,
          });
          return;
        }

        const organizations = (
          (data ?? []) as {
            id: string;
            name: string;
            slug: string | null;
            kind: string | null;
            finance_report_brand: string | null;
          }[]
        ).map((o) => ({
          id: o.id,
          name: o.name,
          slug: o.slug,
          kind: o.kind,
          finance_report_brand: o.finance_report_brand ?? null,
        }));

        // Geçici boş cevap önceki listeyi silmesin
        if (!organizations.length && get().organizations.length > 0) {
          set({
            loading: false,
            loadError: 'İşletme listesi boş döndü — önceki liste korundu',
            loadedAt: get().loadedAt,
          });
          return;
        }

        set(() => ({
          organizations,
          loading: false,
          loadError: null,
          loadedAt: Date.now(),
        }));

        // Geçersiz seçim kaldıysa (ör. silinmiş işletme) kayıtlı / ilk geçerliye düş
        const after = get();
        const canUseAll = after.accountingScopeActive ? after.accountingCanUseAll : true;
        if (!isValidSelection(after.selectedOrganizationId, after.organizations, canUseAll)) {
          const saved = await readPersistedOrg();
          if (saved && isValidSelection(saved, after.organizations, canUseAll)) {
            set({ selectedOrganizationId: saved });
          } else if (canUseAll) {
            // Yetki varsa "tümü"; yoksa ilk işletme — geçerli seçimi bozmadan
            set({ selectedOrganizationId: 'all' });
          } else if (after.organizations[0]) {
            set({ selectedOrganizationId: after.organizations[0].id });
          }
        }
      } catch (e) {
        set({
          loading: false,
          loadError: e instanceof Error ? e.message : 'İşletmeler yüklenemedi',
          loadedAt: get().organizations.length > 0 ? get().loadedAt : null,
        });
      }
    })();

    loadInflight = run;
    try {
      await run;
    } finally {
      if (loadInflight === run) loadInflight = null;
    }
  },
}));
