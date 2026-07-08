/** Personel/admin sohbet listesi bayrağı — sohbet okunduğunda liste (okunmadı rozeti) yenilensin. */
let staffConversationListDirty = false;

export function markStaffConversationListDirty(): void {
  staffConversationListDirty = true;
}

export function consumeStaffConversationListDirty(): boolean {
  const dirty = staffConversationListDirty;
  staffConversationListDirty = false;
  return dirty;
}

export function isStaffConversationListDirty(): boolean {
  return staffConversationListDirty;
}
