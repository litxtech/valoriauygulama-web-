import { PaymentNewForm } from '@/components/payments/PaymentNewForm';
import { useLocalSearchParams } from 'expo-router';
import { PAYMENT_SERVICE_KINDS, type PaymentServiceKind } from '@/lib/paymentsI18n';

function parseInitialKind(raw?: string): PaymentServiceKind | undefined {
  if (!raw) return undefined;
  return PAYMENT_SERVICE_KINDS.includes(raw as PaymentServiceKind) ? (raw as PaymentServiceKind) : undefined;
}

export default function AdminPaymentNewScreen() {
  const params = useLocalSearchParams<{ mode?: string; kind?: string }>();
  const initialMode =
    params.mode === 'standing'
      ? 'standing'
      : params.mode === 'standing_variable'
        ? 'standing_variable'
        : params.mode === 'single'
          ? 'single'
          : undefined;

  return (
    <PaymentNewForm
      successBasePath="/admin/payments"
      initialMode={initialMode}
      initialServiceKind={parseInitialKind(params.kind)}
    />
  );
}
