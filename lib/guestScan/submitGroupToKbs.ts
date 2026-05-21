import { submitGuestCheckin } from '@/lib/kbsService';
import type { GuestScanItem } from '@/lib/guestScan/types';

export type SubmitOneResult = {
  itemId: string;
  ok: boolean;
  guestDocumentId?: string;
  guestStayId?: string;
  errorMessage?: string;
};

export type GuestGroupSubmitProgress = {
  index: number;
  total: number;
  itemId: string;
  guestLabel: string;
};

/** Tek / grup: kbsService üzerinden giriş + guest_stays kaydı. */
export async function submitGuestScanItemToKbs(args: {
  item: GuestScanItem;
  roomId: string;
  roomNo: string;
  sessionId: string;
}): Promise<SubmitOneResult> {
  const res = await submitGuestCheckin({
    item: args.item,
    roomId: args.roomId,
    roomNo: args.roomNo,
    sessionId: args.sessionId,
  });
  if (!res.ok) {
    return { itemId: args.item.id, ok: false, errorMessage: res.userMessage };
  }
  return {
    itemId: args.item.id,
    ok: true,
    guestDocumentId: res.data.guestDocumentId,
    guestStayId: res.data.guestStayId,
  };
}

function guestLabel(item: GuestScanItem): string {
  const name = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  return name || item.passportNo || item.identityNo || item.id.slice(0, 8);
}

export async function submitGuestGroupToKbs(args: {
  items: GuestScanItem[];
  roomId: string;
  roomNo: string;
  sessionId: string;
  onProgress?: (p: GuestGroupSubmitProgress) => void;
}): Promise<SubmitOneResult[]> {
  const results: SubmitOneResult[] = [];
  const total = args.items.length;
  for (let index = 0; index < total; index++) {
    const item = args.items[index]!;
    args.onProgress?.({
      index: index + 1,
      total,
      itemId: item.id,
      guestLabel: guestLabel(item),
    });
    results.push(
      await submitGuestScanItemToKbs({
        item,
        roomId: args.roomId,
        roomNo: args.roomNo,
        sessionId: args.sessionId,
      })
    );
  }
  return results;
}
