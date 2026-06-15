import { create } from 'zustand';

type State = {
  visible: boolean;
  show: () => void;
  dismiss: () => void;
};

export const useAppScreenshotWarningStore = create<State>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  dismiss: () => set({ visible: false }),
}));
