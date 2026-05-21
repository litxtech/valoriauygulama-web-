import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { sendBulkToStaff } from '@/lib/notificationService';

type TargetType = 'all' | 'guests' | 'staff';
const TARGET_OPTIONS: { value: TargetType; label: string }[] = [
  { value: 'all', label: 'Tüm kullanıcılar (misafir + personel)' },
  { value: 'guests', label: 'Sadece misafirler' },
  { value: 'staff', label: 'Sadece personel' },
];

export default function AdminBulkMessageScreen() {
  const { staff } = useAuthStore();
  const [target, setTarget] = useState<TargetType>('all');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!staff || !title.trim() || !content.trim()) {
      Alert.alert('Hata', 'Başlık ve mesaj girin.');
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from('announcements').insert({
        title: title.trim(),
        content: content.trim(),
        priority,
        target_type: target,
        created_by: staff.id,
        created_by_type: staff.role === 'admin' ? 'admin' : 'staff',
      });
      if (error) throw error;

      if (target === 'staff' || target === 'all') {
        await sendBulkToStaff({
          target: 'all_staff',
          organizationId: staff.organization_id ?? null,
          title: title.trim(),
          body: content.trim(),
          createdByStaffId: staff.id,
          notificationType: 'staff_board_announcement',
          data: { screen: '/staff/board' },
        }).catch(() => {});
      }

      Alert.alert('Gönderildi', 'Duyuru panoya eklendi; personel header göz ikonundan görebilir.');
      setTitle('');
      setContent('');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Gönderilemedi.');
    }
    setSending(false);
  };

  if (!staff) return null;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.label}>Kime</Text>
      {TARGET_OPTIONS.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.radioRow, target === opt.value && styles.radioRowActive]}
          onPress={() => setTarget(opt.value)}
        >
          <Text style={styles.radioLabel}>{opt.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Öncelik</Text>
      <View style={styles.priorityRow}>
        {(['normal', 'high', 'urgent'] as const).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.priorityBtn, priority === p && styles.priorityBtnActive]}
            onPress={() => setPriority(p)}
          >
            <Text style={[styles.priorityBtnText, priority === p && styles.priorityBtnTextActive]}>{p === 'normal' ? 'Normal' : p === 'high' ? 'Yüksek' : 'Acil'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Başlık</Text>
      <TextInput
        style={styles.input}
        placeholder="Duyuru başlığı"
        placeholderTextColor={MESSAGING_COLORS.textSecondary}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>Mesaj</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="İçerik..."
        placeholderTextColor={MESSAGING_COLORS.textSecondary}
        value={content}
        onChangeText={setContent}
        multiline
        numberOfLines={5}
      />

      <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={sending}>
        {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendBtnText}>Gönder</Text>}
      </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', color: MESSAGING_COLORS.text, marginTop: 16, marginBottom: 8 },
  radioRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    marginBottom: 8,
  },
  radioRowActive: { backgroundColor: MESSAGING_COLORS.primary + '22', borderWidth: 1, borderColor: MESSAGING_COLORS.primary },
  radioLabel: { fontSize: 15, color: MESSAGING_COLORS.text },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  priorityBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#f3f4f6', alignItems: 'center' },
  priorityBtnActive: { backgroundColor: MESSAGING_COLORS.primary, borderWidth: 1, borderColor: MESSAGING_COLORS.primary },
  priorityBtnText: { fontSize: 14, color: MESSAGING_COLORS.text },
  priorityBtnTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  sendBtn: {
    marginTop: 24,
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
