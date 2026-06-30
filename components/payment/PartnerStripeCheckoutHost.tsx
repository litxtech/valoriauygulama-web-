import { StripeCheckoutModal } from '@/components/payment/StripeCheckoutModal';
import type { PartnerStripePaymentResult } from '@/lib/breakfastPartner';
import type { PartnerCheckoutSettledResult } from '@/hooks/usePartnerStripeCheckout';

type Props = {
  checkout: PartnerStripePaymentResult | null;
  onClose: () => void;
  onFinished: (result: PartnerCheckoutSettledResult) => void;
  title?: string;
};

export function PartnerStripeCheckoutHost({
  checkout,
  onClose,
  onFinished,
  title = 'Partner cari ödemesi',
}: Props) {
  if (!checkout) return null;

  return (
    <StripeCheckoutModal
      visible
      payUrl={checkout.payUrl}
      paymentRequestId={checkout.paymentRequestId}
      title={title}
      onClose={onClose}
      onFinished={onFinished}
    />
  );
}
