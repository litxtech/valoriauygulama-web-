import { create } from 'zustand';
import { supabase } from '@/lib/supabase';

export type AdminOrganizationOption = {
  id: string;
  name: string;
  slug: string | null;
};

type AdminOrgState = {
  organizations: AdminOrganizationOption[];
  selectedOrganizationId: string | 'all';
  loading: boolean;
  setSelectedOrganizationId: (id: string | 'all') => void;
  loadOrganizations: () => Promise<void>;
};

export const useAdminOrgStore = create<AdminOrgState>((set, get) => ({
  organizations: [],
  selectedOrganizationId: 'all',
  loading: false,
  setSelectedOrganizationId: (id) => set({ selectedOrganizationId: id }),
  loadOrganizations: async () => {
    if (get().loading) return;
    set({ loading: true });
    const { data } = await supabase.from('organizations').select('id,name,slug').order('name');
    const organizations = ((data ?? []) as { id: string; name: string; slug: string | null }[]).map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
    }));
    set((state) => {
      const exists =
        state.selectedOrganizationId === 'all' ||
        organizations.some((o) => o.id === state.selectedOrganizationId);
      return {
        organizations,
        selectedOrganizationId: exists ? state.selectedOrganizationId : 'all',
        loading: false,
      };
    });
  },
}));

