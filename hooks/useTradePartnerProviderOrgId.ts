import { useEffect, useState } from 'react';
import { fetchTradePartnerProviderOrgId } from '@/lib/tradePartner';

export function useTradePartnerProviderOrgId() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const id = await fetchTradePartnerProviderOrgId();
        if (!cancelled) {
          setOrgId(id);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setOrgId(null);
          setError((e as Error)?.message ?? 'İşletme bulunamadı');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { orgId, loading, error };
}
