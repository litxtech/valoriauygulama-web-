/** Misafir sohbet listesi önbelleği — sohbetten dönünce liste yenilensin. */
let guestConversationListDirty = false;

export function markGuestConversationListDirty(): void {
  guestConversationListDirty = true;
}

export function consumeGuestConversationListDirty(): boolean {
  const dirty = guestConversationListDirty;
  guestConversationListDirty = false;
  return dirty;
}

export function isGuestConversationListDirty(): boolean {
  return guestConversationListDirty;
}

export function clearGuestConversationListDirty(): void {
  guestConversationListDirty = false;
}
