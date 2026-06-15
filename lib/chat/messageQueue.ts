import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMention } from '@/lib/chatMentions';

const QUEUE_KEY = 'staff_chat_outbox_v1';

export type QueuedTextMessage = {
  id: string;
  conversationId: string;
  staffId: string;
  staffName: string;
  staffAvatar: string | null;
  text: string;
  replyToId: string | null;
  mentions: ChatMention[];
  createdAt: string;
};

async function readQueue(): Promise<QueuedTextMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueuedTextMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(items: QueuedTextMessage[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function enqueueTextMessage(item: QueuedTextMessage): Promise<void> {
  const q = await readQueue();
  q.push(item);
  await writeQueue(q);
}

export async function dequeueTextMessage(id: string): Promise<void> {
  const q = await readQueue();
  await writeQueue(q.filter((m) => m.id !== id));
}

export async function listQueuedForConversation(conversationId: string): Promise<QueuedTextMessage[]> {
  const q = await readQueue();
  return q.filter((m) => m.conversationId === conversationId);
}

export async function listAllQueued(): Promise<QueuedTextMessage[]> {
  return readQueue();
}
