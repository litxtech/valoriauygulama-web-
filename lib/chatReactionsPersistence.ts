import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'valoria_chat_reactions_v1:';

export type ConversationReactions = Record<string, Record<string, number>>;

export async function loadConversationReactions(conversationId: string): Promise<ConversationReactions> {
  if (!conversationId) return {};
  try {
    const raw = await AsyncStorage.getItem(PREFIX + conversationId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ConversationReactions;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveConversationReactions(
  conversationId: string,
  reactions: ConversationReactions
): Promise<void> {
  if (!conversationId) return;
  try {
    await AsyncStorage.setItem(PREFIX + conversationId, JSON.stringify(reactions));
  } catch {
    /* ignore */
  }
}

export function toggleReactionInMap(
  map: ConversationReactions,
  messageId: string,
  emoji: string
): ConversationReactions {
  const cur = { ...(map[messageId] ?? {}) };
  const n = (cur[emoji] ?? 0) + 1;
  if (n <= 1 && cur[emoji]) delete cur[emoji];
  else cur[emoji] = n;
  const next = { ...map, [messageId]: cur };
  if (Object.keys(cur).length === 0) delete next[messageId];
  return next;
}
