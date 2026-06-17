import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { fetchKitchenFinanceStaffIds } from '@/lib/kitchenOps/financeAccessSettings';
import {
  canAccessKitchenFinance,
  canAccessKitchenReceptionAccounting,
  canAccessKitchenOps,
} from '@/lib/staffPermissions';

export function useKitchenFinanceAccess() {
  const staff = useAuthStore((s) => s.staff);
  const [financeStaffIds, setFinanceStaffIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!staff?.organization_id) {
      setFinanceStaffIds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const ids = await fetchKitchenFinanceStaffIds(staff.organization_id);
      setFinanceStaffIds(ids);
    } finally {
      setLoading(false);
    }
  }, [staff?.organization_id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const allowed = canAccessKitchenFinance(staff, financeStaffIds);
  const isReception = canAccessKitchenReceptionAccounting(staff);
  const hasKitchenOps = canAccessKitchenOps(staff);

  return {
    staff,
    loading,
    allowed,
    isReception,
    hasKitchenOps,
    financeStaffIds,
    reload,
    canEnterRevenue: allowed,
    canEnterExpense: allowed || isReception,
    canMatchPos: isReception || allowed,
  };
}
