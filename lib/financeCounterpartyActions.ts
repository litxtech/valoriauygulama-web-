import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';

export async function deactivateFinanceCounterparty(
  counterpartyId: string,
  organizationId: string
): Promise<string | null> {
  const { error } = await supabase.rpc('finance_deactivate_counterparties', {
    p_organization_id: organizationId,
    p_ids: [counterpartyId],
  });
  if (error) return error.message;
  invalidateCounterpartyBalanceCache(organizationId);
  return null;
}

export function confirmDeactivateCounterparty(
  name: string,
  onConfirm: () => void | Promise<void>
): void {
  Alert.alert(
    'Kişiyi kaldır',
    `"${name}" listeden kaldırılsın mı?\n\nGeçmiş ödeme kayıtları silinmez.`,
    [
      { text: 'İptal', style: 'cancel' },
      { text: 'Kaldır', style: 'destructive', onPress: () => void onConfirm() },
    ]
  );
}

export async function bulkDeactivateFinanceCounterparties(
  items: { id: string; organization_id: string }[]
): Promise<{ ok: number; failed: number; lastError: string | null }> {
  const byOrg = new Map<string, string[]>();
  for (const item of items) {
    const list = byOrg.get(item.organization_id) ?? [];
    list.push(item.id);
    byOrg.set(item.organization_id, list);
  }

  let ok = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const [orgId, ids] of byOrg.entries()) {
    const { error } = await supabase.rpc('finance_deactivate_counterparties', {
      p_organization_id: orgId,
      p_ids: ids,
    });
    if (error) {
      failed += ids.length;
      lastError = error.message;
    } else {
      ok += ids.length;
      invalidateCounterpartyBalanceCache(orgId);
    }
  }

  return { ok, failed, lastError };
}

export function confirmBulkDeactivateCounterparties(
  count: number,
  onConfirm: () => void | Promise<void>
): void {
  Alert.alert(
    'Seçilenleri kaldır',
    `${count} kişi listeden kaldırılsın mı?\n\nGeçmiş ödeme kayıtları silinmez.`,
    [
      { text: 'İptal', style: 'cancel' },
      {
        text: `${count} kaldır`,
        style: 'destructive',
        onPress: () => void onConfirm(),
      },
    ]
  );
}
