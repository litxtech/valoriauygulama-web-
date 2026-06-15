import { useCallback } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { FinanceMovementReceiptActions } from '@/components/admin/FinanceMovementReceiptActions';
import { loadFinanceMovementReceiptInput } from '@/lib/financeMovementReceiptPdf';

type Props = {
  movementId: string;
  compact?: boolean;
};

/** Gider/gelir hareketi için fiş: PDF, yazdır, yazıcı mail, WhatsApp */
export function FinanceMovementReceiptActionsById({ movementId, compact = true }: Props) {
  const me = useAuthStore((s) => s.staff);
  const selectedOrg = useAdminOrgStore((s) =>
    s.organizations.find((o) => o.id === (s.selectedOrganizationId !== 'all' ? s.selectedOrganizationId : me?.organization_id))
  );

  const loadInput = useCallback(
    () => loadFinanceMovementReceiptInput(movementId, selectedOrg),
    [movementId, selectedOrg?.name, selectedOrg?.finance_report_brand]
  );

  return <FinanceMovementReceiptActions loadInput={loadInput} compact={compact} />;
}
