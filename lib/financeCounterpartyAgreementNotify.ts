import { sendNotification } from '@/lib/notificationService';
import { fmtMoneyTry } from '@/lib/financeLedger';
import type { AgreementMovementKind } from '@/lib/financeCounterpartyAgreements';

export const FINANCE_COUNTERPARTY_AGREEMENT_NOTIF_TYPE = 'finance_counterparty_agreement';

export type CounterpartyAgreementNotifSnapshot = {
  agreementId: string;
  counterpartyId: string;
  counterpartyName: string;
  title: string;
  amount: number;
  movementKind: AgreementMovementKind;
  notes: string | null;
  recordedByName: string | null;
  startedOn: string;
};

function pickStr(data: Record<string, unknown>, key: string): string {
  const raw = data[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

function pickNum(data: Record<string, unknown>, key: string): number {
  const raw = data[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = parseFloat(raw.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

export function isCounterpartyAgreementNotification(notificationType: string | null | undefined): boolean {
  return notificationType === FINANCE_COUNTERPARTY_AGREEMENT_NOTIF_TYPE;
}

export function counterpartyAgreementNotifFromData(
  data: Record<string, unknown> | null | undefined
): CounterpartyAgreementNotifSnapshot | null {
  if (!data || typeof data !== 'object') return null;
  const agreementId = pickStr(data, 'agreementId') || pickStr(data, 'agreement_id');
  const counterpartyId = pickStr(data, 'counterpartyId') || pickStr(data, 'counterparty_id');
  const title = pickStr(data, 'agreementTitle') || pickStr(data, 'title');
  if (!agreementId || !title) return null;
  const rawKind = pickStr(data, 'movementKind') || pickStr(data, 'movement_kind');
  const movementKind: AgreementMovementKind = rawKind === 'income' ? 'income' : 'expense';
  return {
    agreementId,
    counterpartyId,
    counterpartyName: pickStr(data, 'counterpartyName') || pickStr(data, 'counterparty_name'),
    title,
    amount: pickNum(data, 'amount') || pickNum(data, 'targetAmount') || pickNum(data, 'target_amount'),
    movementKind,
    notes: pickStr(data, 'notes') || null,
    recordedByName: pickStr(data, 'recordedByName') || pickStr(data, 'recorded_by_name') || null,
    startedOn: pickStr(data, 'startedOn') || pickStr(data, 'started_on'),
  };
}

function agreementNotifyCopy(
  movementKind: AgreementMovementKind,
  amountLabel: string,
  title: string
): { title: string; body: string } {
  if (movementKind === 'income') {
    return {
      title: 'Alacak kaydı',
      body: `${amountLabel} tutarında borcunuz kaydedildi — ${title}`,
    };
  }
  return {
    title: 'Borç kaydı',
    body: `Size ${amountLabel} borcumuz kaydedildi — ${title}`,
  };
}

export async function notifyCounterpartyAgreementCreated(params: {
  agreementId: string;
  counterpartyId: string;
  counterpartyName: string;
  linkedStaffId: string | null;
  title: string;
  targetAmount: number;
  movementKind: AgreementMovementKind;
  notes?: string | null;
  startedOn: string;
  createdByStaffId: string;
  createdByStaffName?: string | null;
  notifyPerson: boolean;
}): Promise<{ sent: boolean; reason?: 'disabled' | 'no_linked_staff' }> {
  if (!params.notifyPerson) return { sent: false, reason: 'disabled' };
  if (!params.linkedStaffId) return { sent: false, reason: 'no_linked_staff' };

  const amountLabel = fmtMoneyTry(params.targetAmount);
  const copy = agreementNotifyCopy(params.movementKind, amountLabel, params.title.trim());
  const snapshot: CounterpartyAgreementNotifSnapshot = {
    agreementId: params.agreementId,
    counterpartyId: params.counterpartyId,
    counterpartyName: params.counterpartyName,
    title: params.title.trim(),
    amount: params.targetAmount,
    movementKind: params.movementKind,
    notes: params.notes?.trim() || null,
    recordedByName: params.createdByStaffName?.trim() || null,
    startedOn: params.startedOn,
  };

  const pushData = {
    url: '/staff/notifications',
    screen: 'staff_notifications',
    notificationType: FINANCE_COUNTERPARTY_AGREEMENT_NOTIF_TYPE,
    feature_key: 'accounting_document',
    agreementId: params.agreementId,
    counterpartyId: params.counterpartyId,
    counterpartyName: params.counterpartyName,
    agreementTitle: snapshot.title,
    amount: params.targetAmount,
    movementKind: params.movementKind,
    notes: snapshot.notes,
    recordedByName: snapshot.recordedByName,
    startedOn: params.startedOn,
  };

  await sendNotification({
    staffId: params.linkedStaffId,
    title: copy.title,
    body: copy.body,
    notificationType: FINANCE_COUNTERPARTY_AGREEMENT_NOTIF_TYPE,
    category: 'staff',
    data: pushData,
    createdByStaffId: params.createdByStaffId,
  });

  return { sent: true };
}
