import { PaymentWebBridgeRedirect } from '@/components/PaymentWebBridgeRedirect';

export default function OdemeQrBridgeScreen() {
  return <PaymentWebBridgeRedirect edgeFunction="open-payment-qr" />;
}
