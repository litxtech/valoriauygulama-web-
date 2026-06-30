import { useCallback, useEffect, useState } from 'react';
import { fetchBreakfastPartnerProviderOrgId } from '@/lib/breakfastPartner';

/** Partner kahvaltı modülü her zaman tek işletmeye (Valoria) bağlıdır. */
export function useBreakfastPartnerProviderOrgId() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrgId(await fetchBreakfastPartnerProviderOrgId());
    } catch (e) {
      setOrgId(null);
      setError((e as Error)?.message ?? 'İşletme yüklenemedi');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { orgId, loading, error, reload };
}
