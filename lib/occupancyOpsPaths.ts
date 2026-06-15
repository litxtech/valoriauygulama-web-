/** Doluluk operasyonları — admin paneli veya yetkili personel modülü rotaları. */

export type OccupancyOpsScope = 'admin' | 'staff';

export function getOccupancyScope(pathname?: string | null): OccupancyOpsScope {
  if (pathname?.includes('/staff/occupancy')) return 'staff';
  return 'admin';
}

export type OccupancyOpsPaths = {
  scope: OccupancyOpsScope;
  hub: string;
  rooms: string;
  room: (id: string) => string;
  guest: (id: string) => string;
  checkin: string;
  stays: string;
  guestsList: string;
  contractsAll: string;
};

export function occupancyPaths(scope: OccupancyOpsScope): OccupancyOpsPaths {
  if (scope === 'staff') {
    const base = '/staff/occupancy';
    const ops = `${base}/operations`;
    return {
      scope,
      hub: ops,
      rooms: `${base}/rooms`,
      room: (id) => `${base}/rooms/${id}`,
      guest: (id) => `${base}/guests/${id}`,
      checkin: `${base}/checkin`,
      stays: `${base}/stays`,
      guestsList: `${base}/checkin`,
      contractsAll: '/staff/contracts/all',
    };
  }
  return {
    scope: 'admin',
    hub: '/admin/report/operations',
    rooms: '/admin/rooms',
    room: (id) => `/admin/rooms/${id}`,
    guest: (id) => `/admin/guests/${id}`,
    checkin: '/admin/checkin',
    stays: '/admin/stays',
    guestsList: '/admin/guests',
    contractsAll: '/admin/contracts/all',
  };
}

export function occupancyPathsFromPathname(pathname?: string | null): OccupancyOpsPaths {
  return occupancyPaths(getOccupancyScope(pathname));
}

/** Feed / hamburger — doğrudan konaklama operasyon merkezi. */
export function occupancyHubPathForStaff(
  _staff?: { role?: string | null; app_permissions?: Record<string, boolean> | null } | null
): string {
  return '/staff/occupancy/operations';
}

/** @deprecated occupancyHubPathForStaff ile aynı */
export function occupancyOpsPathForStaff(): string {
  return '/staff/occupancy/operations';
}

export function occupancyAcceptancesPathForStaff(): string {
  return '/staff/occupancy/operations?tab=acceptances';
}

export function occupancyDailyReportPath(scope: OccupancyOpsScope): string {
  return scope === 'staff' ? '/staff/occupancy/daily' : '/admin/report';
}
