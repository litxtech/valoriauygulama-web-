import { PaymentNewForm } from '@/components/payments/PaymentNewForm';

export default function AdminPaymentNewScreen() {
  return <PaymentNewForm successBasePath="/admin/payments" />;
}
