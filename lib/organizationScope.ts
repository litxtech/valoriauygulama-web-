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

/** Admin liste ekranları: seçili işletme → kendi işletmesi → yedek işletme sırasıyla org id çözümler. */
export function resolveAdminListOrganizationId(opts: {
  canUseAll: boolean;
  selectedOrganizationId: string | 'all';
  ownOrganizationId?: string | null;
  fallbackOrganizationId?: string | null;
}): string | null {
  if (opts.canUseAll) {
    const fromPicker = resolveOrganizationScopeId(opts.selectedOrganizationId);
    if (fromPicker) return fromPicker;
    if (opts.selectedOrganizationId === 'all') return null;
    const own = resolveOrganizationScopeId(opts.ownOrganizationId);
    if (own) return own;
    return resolveOrganizationScopeId(opts.fallbackOrganizationId);
  }
  return resolveOrganizationScopeId(opts.ownOrganizationId);
}

export function shouldApplyOrganizationFilter(
  canUseAll: boolean,
  selectedOrganizationId: string | 'all'
): boolean {
  if (!canUseAll) return true;
  return selectedOrganizationId !== 'all';
}

export function filterValidUuids(values: Array<string | null | undefined>): string[] {
  return values.filter(isValidUuid);
}
