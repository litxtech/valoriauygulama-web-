import { create } from 'zustand';

type PendingExternalPay = {
  tipId: string;
  staffName: string;
  amount: number;
};

type StaffTipPaymentState = {
  externalPayActive: boolean;
  pending: PendingExternalPay | null;
  /** Parent ekranlar bahşiş sheet'ini kapatmak için dinler */
  sheetDismissNonce: number;
  paymentWatchCancel: (() => void) | null;
  beginExternalPay: (pending: PendingExternalPay) => void;
  finishExternalPay: () => void;
  setPaymentWatchCancel: (cancel: (() => void) | null) => void;
  bumpSheetDismiss: () => void;
};

function clearPaymentWatch(get: () => StaffTipPaymentState): void {
  get().paymentWatchCancel?.();
}

export const useStaffTipPaymentStore = create<StaffTipPaymentState>((set, get) => ({
  externalPayActive: false,
  pending: null,
  sheetDismissNonce: 0,
  paymentWatchCancel: null,
  beginExternalPay: (pending) =>
    set({ externalPayActive: true, pending, sheetDismissNonce: Date.now() }),
  finishExternalPay: () => {
    clearPaymentWatch(get);
    set({ externalPayActive: false, pending: null, paymentWatchCancel: null });
  },
  setPaymentWatchCancel: (cancel) => set({ paymentWatchCancel: cancel }),
  bumpSheetDismiss: () => set((s) => ({ sheetDismissNonce: s.sheetDismissNonce + 1 })),
}));

export function dismissTipSheetsForPaymentReturn(): void {
  const s = useStaffTipPaymentStore.getState();
  s.finishExternalPay();
  s.bumpSheetDismiss();
}
