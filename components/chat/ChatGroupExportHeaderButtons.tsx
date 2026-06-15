import { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { runChatGroupExportAction } from '@/lib/chatConversationExport';

type Props = {
  conversationId: string;
  staffId: string;
  conversationName: string;
  iconColor: string;
  compact?: boolean;
};

export function ChatGroupExportHeaderButtons({
  conversationId,
  staffId,
  conversationName,
  iconColor,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState<'print' | 'whatsapp' | null>(null);

  const run = async (action: 'print' | 'whatsapp') => {
    if (busy) return;
    setBusy(action);
    try {
      await runChatGroupExportAction(action, conversationId, staffId, conversationName);
    } catch {
      /* runChatGroupExportAction alerts */
    } finally {
      setBusy(null);
    }
  };

  const onPrint = () => {
    Alert.alert(
      'Sohbeti yazdır',
      'Tüm grup görüşme kayıtları PDF olarak hazırlanacak. Devam edilsin mi?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Yazdır', onPress: () => void run('print') },
      ]
    );
  };

  const onWhatsApp = () => {
    Alert.alert(
      'WhatsApp ile paylaş',
      'Tüm grup görüşme kayıtları paylaşım için hazırlanacak. Devam edilsin mi?',
      [
        { text: 'İptal', style: 'cancel' },
        { text: 'Paylaş', onPress: () => void run('whatsapp') },
      ]
    );
  };

  return (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <TouchableOpacity
        onPress={onPrint}
        disabled={busy !== null}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.btn}
        accessibilityLabel="Sohbeti yazdır"
      >
        {busy === 'print' ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Ionicons name="print-outline" size={compact ? 21 : 23} color={iconColor} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onWhatsApp}
        disabled={busy !== null}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={styles.btn}
        accessibilityLabel="WhatsApp ile paylaş"
      >
        {busy === 'whatsapp' ? (
          <ActivityIndicator size="small" color="#16a34a" />
        ) : (
          <Ionicons name="logo-whatsapp" size={compact ? 22 : 24} color="#16a34a" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  rowCompact: {
    marginRight: 0,
  },
  btn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
});
