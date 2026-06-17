import { PaymentWebBridgeRedirect } from '@/components/PaymentWebBridgeRedirect';

export default function PaymentQrBridgeScreen() {
  return <PaymentWebBridgeRedirect edgeFunction="open-payment-qr" />;
}
