import type { AdminOrganizationOption } from '@/stores/adminOrgStore';

export function accountingCanUseAllOrg(me?: {
  role?: string | null;
  app_permissions?: { super_admin?: boolean } | null;
} | null): boolean {
  return me?.app_permissions?.super_admin === true || me?.role === 'admin';
}

/** Muhasebe listelerinde hangi işletme(ler) yüklenecek */
export function resolveAccountingOrgScope(
  me?: { organization_id?: string | null; role?: string | null; app_permissions?: { super_admin?: boolean } | null } | null,
  selectedOrganizationId?: string | 'all'
): string | 'all' | undefined {
  const canUseAll = accountingCanUseAllOrg(me);
  if (canUseAll) {
    if (selectedOrganizationId && selectedOrganizationId !== 'all') return selectedOrganizationId;
    if (selectedOrganizationId === 'all') return 'all';
    return me?.organization_id ?? undefined;
  }
  return me?.organization_id ?? undefined;
}

export function organizationNameById(
  organizationId: string | null | undefined,
  organizations: AdminOrganizationOption[]
): string | null {
  if (!organizationId) return null;
  return organizations.find((o) => o.id === organizationId)?.name?.trim() || null;
}

export async function mergeCounterpartyBalancesForOrgs(
  organizationIds: string[],
  fetchMap: (
    organizationId: string
  ) => Promise<Map<string, { income: number; expense: number; net: number }>>
): Promise<Map<string, { income: number; expense: number; net: number }>> {
  const merged = new Map<string, { income: number; expense: number; net: number }>();
  const ids = [...new Set(organizationIds.filter(Boolean))];
  const maps = await Promise.all(ids.map((id) => fetchMap(id)));
  for (const m of maps) {
    for (const [cpId, bal] of m) merged.set(cpId, bal);
  }
  return merged;
}
