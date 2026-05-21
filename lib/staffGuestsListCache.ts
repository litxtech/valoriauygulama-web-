import AsyncStorage from '@react-native-async-storage/async-storage';

export type StaffGuestListItem = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
  phone: string | null;
  email: string | null;
  room_number: string | null;
};

const STORAGE_KEY = 'staff_guests_list_v2';
let memory: StaffGuestListItem[] | null = null;

export function peekStaffGuestsListMemory(): StaffGuestListItem[] | null {
  return memory?.length ? memory : null;
}

export function setStaffGuestsListMemory(items: StaffGuestListItem[]): void {
  memory = items;
}

export async function readStaffGuestsListCache(): Promise<StaffGuestListItem[] | null> {
  if (memory?.length) return memory;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StaffGuestListItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    memory = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStaffGuestsListCache(items: StaffGuestListItem[]): Promise<void> {
  memory = items;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // önbellek yazımı sessiz
  }
}
