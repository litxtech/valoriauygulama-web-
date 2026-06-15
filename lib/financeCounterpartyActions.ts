import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';

export async function deactivateFinanceCounterparty(
  counterpartyId: string,
  organizationId: string
): Promise<string | null> {
  const { error } = await supabase
    .from('finance_counterparties')
    .update({ is_active: false })
    .eq('id', counterpartyId);
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
