import { create } from 'zustand';
import type { GuestScanItem, GuestScanSession, GuestScanSessionType } from '@/lib/guestScan/types';
import { fingerprintFromMrzQueued, type MrzQueuedFingerprint } from '@/stores/kbsMrzBatchStore';
import { createGuestScanSessionDb, persistGuestScanItemDb } from '@/lib/guestScan/guestScanSessionDb';
import type { SubmitOneResult } from '@/lib/guestScan/submitGroupToKbs';
import { supabase } from '@/lib/supabase';

type State = {
  session: GuestScanSession | null;
  pendingConfirmItem: GuestScanItem | null;
  lastSubmitResults: SubmitOneResult[] | null;
  fingerprints: MrzQueuedFingerprint[];
  loading: boolean;
  setPendingConfirmItem: (item: GuestScanItem | null) => void;
  startSession: (type: GuestScanSessionType) => Promise<void>;
  addItem: (item: GuestScanItem) => Promise<void>;
  updateItem: (id: string, patch: Partial<GuestScanItem>) => void;
  removeItem: (id: string) => void;
  setStayInfo: (info: { roomNo?: string | null; checkinAt?: string | null; checkoutAt?: string | null }) => void;
  setLastSubmitResults: (results: SubmitOneResult[] | null) => void;
  hasDuplicate: (fp: MrzQueuedFingerprint) => boolean;
  reset: () => void;
};

export const useGuestScanSessionStore = create<State>((set, get) => ({
  session: null,
  pendingConfirmItem: null,
  lastSubmitResults: null,
  fingerprints: [],
  loading: false,

  setPendingConfirmItem: (item) => set({ pendingConfirmItem: item }),

  startSession: async (type) => {
    const optimisticId = `local-${Date.now()}`;
    const optimistic: GuestScanSession = {
      id: optimisticId,
      sessionType: type,
      status: 'draft',
      roomNo: null,
      checkinAt: new Date().toISOString(),
      checkoutAt: null,
      items: [],
    };
    set({ session: optimistic, fingerprints: [], loading: true });

    const res = await createGuestScanSessionDb(type);
    if (res.ok) {
      set({ session: res.session, fingerprints: [], loading: false });
      return;
    }
    set({ loading: false });
  },

  addItem: async (item) => {
    const s = get().session;
    if (!s) return;
    if (s.items.some((x) => x.id === item.id)) return;
    const next = { ...s, items: [...s.items, item] };
    set({ session: next });
    set({ pendingConfirmItem: null });

    const fp = fingerprintFromMrzQueued({
      mrzLine: item.rawMrz ?? `${item.identityNo ?? ''}|${item.passportNo ?? ''}`,
      documentNumber: item.passportNo ?? item.identityNo,
      birthDate: item.birthDate,
      nationalityCode: item.nationality,
      firstName: item.firstName,
      lastName: item.lastName,
    });
    set((st) => ({ fingerprints: [...st.fingerprints, fp] }));

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (uid && !s.id.startsWith('local-')) {
      const { data: au } = await supabase.schema('ops').from('app_users').select('hotel_id').eq('id', uid).maybeSingle();
      if (au?.hotel_id) void persistGuestScanItemDb(item, au.hotel_id);
    }
  },

  updateItem: (id, patch) => {
    const s = get().session;
    if (!s) return;
    set({
      session: {
        ...s,
        items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    });
  },

  removeItem: (id) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, items: s.items.filter((it) => it.id !== id) } });
  },

  setStayInfo: (info) => {
    const s = get().session;
    if (!s) return;
    set({
      session: {
        ...s,
        roomNo: info.roomNo !== undefined ? info.roomNo : s.roomNo,
        checkinAt: info.checkinAt !== undefined ? info.checkinAt : s.checkinAt,
        checkoutAt: info.checkoutAt !== undefined ? info.checkoutAt : s.checkoutAt,
      },
    });
  },

  setLastSubmitResults: (results) => set({ lastSubmitResults: results }),

  hasDuplicate: (fp) => get().fingerprints.some((x) => {
    if (x.mrzHash === fp.mrzHash) return true;
    return (
      !!x.documentNumber &&
      x.documentNumber === fp.documentNumber &&
      x.birthDate === fp.birthDate &&
      x.lastName === fp.lastName
    );
  }),

  reset: () =>
    set({ session: null, fingerprints: [], pendingConfirmItem: null, lastSubmitResults: null }),
}));
