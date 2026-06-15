import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export type ChatMessageReaderRow = {
  id: string;
  participant_id: string;
  participant_type: string;
  display_name: string;
  viewer_avatar: string | null;
  verification_badge: 'blue' | 'yellow' | null;
  read_at: string | null;
  has_read: boolean;
  is_guest: boolean;
};

function mapRows(data: unknown[]): ChatMessageReaderRow[] {
  return (data as Record<string, unknown>[]).map((r) => {
    const participantId = String(r.participant_id);
    const participantType = String(r.participant_type ?? 'staff');
    const badge = r.verification_badge;
    return {
      id: `${participantType}:${participantId}`,
      participant_id: participantId,
      participant_type: participantType,
      display_name: String(r.display_name ?? '—').trim() || '—',
      viewer_avatar: (r.avatar as string | null)?.trim() || null,
      verification_badge:
        badge === 'blue' || badge === 'yellow' ? badge : null,
      read_at: r.read_at ? String(r.read_at) : null,
      has_read: !!r.has_read,
      is_guest: participantType === 'guest',
    };
  });
}

/** Grup mesajını kimlerin okuduğunu getirir (gönderen için). */
export async function loadChatMessageReaders(messageId: string): Promise<{
  rows: ChatMessageReaderRow[];
  error: Error | null;
}> {
  const { data, error } = await supabase.rpc('messaging_staff_get_message_readers', {
    p_message_id: messageId,
  });
  if (error) {
    if (error.code === 'PGRST202' || error.message?.includes('messaging_staff_get_message_readers')) {
      log.warn('loadChatMessageReaders', 'RPC missing — migration 339 gerekli', error.code);
    } else {
      log.warn('loadChatMessageReaders', error.message, error.code);
    }
    return { rows: [], error };
  }
  return { rows: mapRows((data ?? []) as unknown[]), error: null };
}
