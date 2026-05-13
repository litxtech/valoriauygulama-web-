import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  CHECK_STATUS_LABELS,
  fmtMoneyTry,
  CHECK_DIRECTION_LABELS,
  type FinanceCheckStatus,
  type FinanceCheckDirection,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';

type Row = {
  id: string;
  direction: FinanceCheckDirection;
  counterparty_name: string;
  amount: number;
  status: FinanceCheckStatus;
  check_number: string | null;
  bank_name: string | null;
  branch_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  purpose: string | null;
  notes: string | null;
  image_urls: string[] | unknown;
};

const STATUSES: FinanceCheckStatus[] = ['draft', 'registered', 'presented', 'paid', 'bounced', 'cancelled'];

export default function AdminFinanceCheckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<FinanceCheckStatus>('registered');
  const [notes, setNotes] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.from('finance_checks').select('*').eq('id', id).single();
    setLoading(false);
    if (error || !data) {
      Alert.alert('Hata', error?.message ?? 'Bulunamadı');
      setRow(null);
      return;
    }
    const r = data as Row;
    setRow(r);
    setStatus(r.status);
    setNotes(r.notes ?? '');
    setCounterparty(r.counterparty_name);
    setPurpose(r.purpose ?? '');
    const imgs = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
    setImageUrls(imgs);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (patch: Record<string, unknown>) => {
    if (!id || !me?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('finance_checks')
      .update({ ...patch, updated_by_staff_id: me.id })
      .eq('id', id);
    setSaving(false);
    if (error) Alert.alert('Kayıt', error.message);
    else load();
  };

  const addImage = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-checks',
        uri,
        subfolder: 'check',
      });
      const next = [...imageUrls, publicUrl];
      setImageUrls(next);
      await persist({ image_urls: next });
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeAdmin = () => {
    Alert.alert('Sil', 'Çek kaydı silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await supabase.from('finance_checks').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else router.back();
        },
      },
    ]);
  };

  if (loading || !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <AdminCard>
        <Text style={styles.title}>{CHECK_DIRECTION_LABELS[row.direction]}</Text>
        <Text style={styles.sub}>{fmtMoneyTry(Number(row.amount))}</Text>
        <Text style={styles.meta}>Kayıt: {formatDateShort(row.issue_date)} · Vade: {row.due_date ? formatDateShort(row.due_date) : '—'}</Text>
      </AdminCard>

      <AdminCard>
        <Text style={styles.label}>Karşı taraf</Text>
        <TextInput style={styles.input} value={counterparty} onChangeText={setCounterparty} onBlur={() => persist({ counterparty_name: counterparty.trim() })} />
        <Text style={styles.label}>Amaç</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={purpose}
          onChangeText={setPurpose}
          multiline
          onBlur={() => persist({ purpose: purpose.trim() || null })}
        />
        <Text style={styles.label}>Durum</Text>
        <View style={styles.tags}>
          {STATUSES.map((s) => (
            <TouchableOpacity key={s} style={[styles.tag, status === s && styles.tagOn]} onPress={() => { setStatus(s); void persist({ status: s }); }}>
              <Text style={[styles.tagText, status === s && styles.tagTextOn]}>{CHECK_STATUS_LABELS[s]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Notlar</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          multiline
          onBlur={() => persist({ notes: notes.trim() || null })}
        />
      </AdminCard>

      <AdminCard>
        <Text style={styles.label}>Görseller</Text>
        <View style={styles.imgRow}>
          <TouchableOpacity style={styles.imgBtn} onPress={async () => {
            const ok = await ensureCameraPermission({ title: 'Kamera', message: '', settingsMessage: '' });
            if (!ok) return;
            const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
            if (!r.canceled && r.assets[0]?.uri) await addImage(r.assets[0].uri);
          }} disabled={uploading}>
            <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.imgBtn} onPress={async () => {
            const ok = await ensureMediaLibraryPermission();
            if (!ok) return;
            const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
            if (!r.canceled && r.assets[0]?.uri) await addImage(r.assets[0].uri);
          }} disabled={uploading}>
            <Ionicons name="images-outline" size={20} color={adminTheme.colors.primary} />
          </TouchableOpacity>
        </View>
        {uploading ? <ActivityIndicator /> : null}
        <View style={styles.thumbs}>
          {imageUrls.map((u) => (
            <TouchableOpacity key={u} onPress={() => Linking.openURL(u)}>
              <Image source={{ uri: u }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </View>
      </AdminCard>

      {me?.role === 'admin' ? (
        <TouchableOpacity style={styles.delBtn} onPress={removeAdmin} disabled={saving}>
          <Text style={styles.delText}>Kaydı sil (yönetici)</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.accent, marginTop: 4 },
  meta: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: adminTheme.colors.surfaceTertiary },
  tagOn: { backgroundColor: adminTheme.colors.primary },
  tagText: { fontSize: 12, color: adminTheme.colors.textSecondary },
  tagTextOn: { color: '#fff', fontWeight: '600' },
  imgRow: { flexDirection: 'row', gap: 12 },
  imgBtn: { padding: 10, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 10 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumb: { width: 88, height: 88, borderRadius: 8 },
  delBtn: { marginTop: 16, padding: 14, alignItems: 'center' },
  delText: { color: adminTheme.colors.error, fontWeight: '600' },
});
