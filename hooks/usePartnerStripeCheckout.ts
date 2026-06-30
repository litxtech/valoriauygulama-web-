import { useCallback, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  createPartnerStripePayment,
  type PartnerStripePaymentResult,
} from '@/lib/breakfastPartner';

type StartParams = {
  amount?: number;
  agreementId?: string;
};

export type PartnerCheckoutSettledResult = {
  status: 'success' | 'cancel';
  paymentRequestId: string;
};

export function usePartnerStripeCheckout(
  onSettled?: (result: PartnerCheckoutSettledResult) => void | Promise<void>
) {
  const [checkout, setCheckout] = useState<PartnerStripePaymentResult | null>(null);
  const [startingKey, setStartingKey] = useState<string | null>(null);

  const dismissCheckout = useCallback(() => {
    setCheckout(null);
  }, []);

  const finishCheckout = useCallback(
    (result: PartnerCheckoutSettledResult) => {
      setCheckout(null);
      void onSettled?.(result);
    },
    [onSettled]
  );

  const startPayment = useCallback(
    async (params?: StartParams, busyKey = 'pay') => {
      if (startingKey) return;
      setStartingKey(busyKey);
      try {
        const payment = await createPartnerStripePayment(params);
        if (!payment?.payUrl) {
          throw new Error('Ödeme oturumu alınamadı');
        }

        if (Platform.OS === 'web') {
          const canOpen = await Linking.canOpenURL(payment.payUrl);
          if (!canOpen) {
            Alert.alert('Hata', 'Ödeme sayfası açılamadı.');
            return;
          }
          await Linking.openURL(payment.payUrl);
          return;
        }

        setCheckout(payment);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : typeof e === 'object' && e != null && 'message' in e
              ? String((e as { message: unknown }).message)
              : 'Ödeme başlatılamadı';
        Alert.alert('Hata', msg.trim() || 'Ödeme başlatılamadı');
      } finally {
        setStartingKey(null);
      }
    },
    [startingKey]
  );

  return {
    startPayment,
    payingKey: startingKey,
    checkout,
    dismissCheckout,
    finishCheckout,
  };
}
