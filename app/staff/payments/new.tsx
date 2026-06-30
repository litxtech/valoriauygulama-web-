import { PaymentNewForm } from '@/components/payments/PaymentNewForm';
import { useLocalSearchParams } from 'expo-router';
import { parsePaymentNewKind, parsePaymentNewMode } from '@/lib/paymentNewRoute';

export default function StaffPaymentNewScreen() {
  const params = useLocalSearchParams<{ mode?: string | string[]; kind?: string | string[] }>();

  return (
    <PaymentNewForm
      successBasePath="/staff/payments"
      initialMode={parsePaymentNewMode(params.mode)}
      initialServiceKind={parsePaymentNewKind(params.kind)}
    />
  );
}
