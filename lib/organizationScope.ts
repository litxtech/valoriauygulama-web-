const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** PostgREST `.eq('organization_id', …)` için geçerli UUID döner; `all` veya bozuksa null. */
export function resolveOrganizationScopeId(
  orgId: string | 'all' | null | undefined
): string | null {
  if (!orgId || orgId === 'all') return null;
  const trimmed = String(orgId).trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed;
}

export function isValidUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function resolveStaffOrganizationScope(opts: {
  canUseAll: boolean;
  selectedOrganizationId: string | 'all';
  ownOrganizationId?: string | null;
}): string | null {
  const raw = opts.canUseAll ? opts.selectedOrganizationId : opts.ownOrganizationId;
  return resolveOrganizationScopeId(raw);
}

export function filterValidUuids(values: Array<string | null | undefined>): string[] {
  return values.filter(isValidUuid);
}
