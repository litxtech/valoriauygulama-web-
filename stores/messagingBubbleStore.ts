/**
 * Mesaj balon rengi: kullanıcının kendi balon rengi (admin/staff/guest).
 * AsyncStorage ile kalıcı. Grupta diğer katılımcılar için palet renkleri kullanılır.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'valoria_messaging_my_bubble_color';
const DEFAULT_MY_COLOR = '#C5A059';

/** Grupta "diğer" mesajlar için her gönderene özgü renk paleti */
export const BUBBLE_PALETTE_OTHER = [
  '#3B82F6', '#10B981', '#8B5CF6', '#EC4899',
  '#F59E0B', '#06B6D4', '#6366F1', '#84CC16',
];

/** Direct sohbette karşı tarafın balon rengi (tek renk) */
export const BUBBLE_OTHER_DIRECT = '#FFFFFF';

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Grupta sender_id'ye göre tutarlı renk döner */
export function getBubbleColorForSender(senderId: string): string {
  return BUBBLE_PALETTE_OTHER[hashString(senderId) % BUBBLE_PALETTE_OTHER.length];
}

/** Balon rengine göre okunabilir metin rengi (beyaz veya koyu) */
export function getContrastTextColor(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? '#1F2937' : '#FFFFFF';
}

interface MessagingBubbleState {
  myBubbleColor: string;
  setMyBubbleColor: (color: string) => Promise<void>;
  loadStored: () => Promise<void>;
}

export const useMessagingBubbleStore = create<MessagingBubbleState>((set, get) => ({
  myBubbleColor: DEFAULT_MY_COLOR,

  setMyBubbleColor: async (color) => {
    await AsyncStorage.setItem(STORAGE_KEY, color);
    set({ myBubbleColor: color });
  },

  loadStored: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    set({ myBubbleColor: stored || DEFAULT_MY_COLOR });
  },
}));

/** Kullanıcının seçebileceği kendi balon renkleri */
export const BUBBLE_COLOR_OPTIONS = [
  '#C5A059',
  '#D4AF37',
  '#B8860B',
  '#F59E0B',
  '#EA580C',
  '#EF4444',
  '#F43F5E',
  '#EC4899',
  '#DB2777',
  '#A855F7',
  '#8B5CF6',
  '#7C3AED',
  '#6366F1',
  '#4F46E5',
  '#3B82F6',
  '#2563EB',
  '#0EA5E9',
  '#06B6D4',
  '#14B8A6',
  '#10B981',
  '#059669',
  '#84CC16',
  '#65A30D',
  '#78716C',
  '#57534E',
  '#1F2937',
  '#1a365d',
  '#0F172A',
];
