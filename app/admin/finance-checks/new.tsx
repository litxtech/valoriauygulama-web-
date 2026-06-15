import { useState, useMemo } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import {
  CHECK_DIRECTION_LABELS,
  CHECK_STATUS_LABELS,
  type FinanceCheckDirection,
  type FinanceCheckStatus,
} from '@/lib/finance';

const STATUSES: FinanceCheckStatus[] = ['draft', 'registered', 'presented', 'partial', 'paid', 'bounced', 'cancelled'];

export default function AdminFinanceCheckNew() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [saving, setSaving] = useState(false);
  const [direction, setDirection] = useState<FinanceCheckDirection>('given');
  const [counterparty, setCounterparty] = useState('');
  const [amount, setAmount] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [purpose, setPurpose] = useState('');
  const [status, setStatus] = useState<FinanceCheckStatus>('registered');
  const [notes, setNotes] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  const addImage = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-checks',
        uri,
        subfolder: 'check',
      });
      setImageUrls((u) => [...u, publicUrl]);
    } catch (e) {
      Alert.alert('Yükleme hatası', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const pickCamera = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Çek görüntüsü için kamera gerekli.',
      settingsMessage: 'Ayarlardan kamera iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
    if (!r.canceled && r.assets[0]?.uri) await addImage(r.assets[0].uri);
  };

  const pickLib = async () => {
    const uris = await pickGalleryImages({ quality: 0.75, selectionLimit: 8 });
    for (const uri of uris) await addImage(uri);
  };

  const save = async () => {
    if (!me?.id) {
      Alert.alert('Oturum', 'Personel kaydı gerekli.');
      return;
    }
    if (!orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Üstte işletme seçin (veya kendi oteliniz).');
      return;
    }
    const a = parseFloat(amount.replace(',', '.'));
    if (!counterparty.trim() || Number.isNaN(a) || a < 0) {
      Alert.alert('Form', 'Karşı taraf ve geçerli tutar girin.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('finance_checks')
      .insert({
        organization_id: orgId,
        direction,
        counterparty_name: counterparty.trim(),
        amount: a,
        currency: 'TRY',
        check_number: checkNumber.trim() || null,
        bank_name: bankName.trim() || null,
        branch_name: branchName.trim() || null,
        issue_date: issueDate || null,
        due_date: dueDate.trim() || null,
        purpose: purpose.trim() || null,
        status,
        image_urls: imageUrls,
        notes: notes.trim() || null,
        created_by_staff_id: me.id,
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    router.replace({ pathname: '/admin/finance-checks/[id]', params: { id: (data as { id: string }).id } } as never);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <AdminOrganizationPicker
        canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
        ownOrganizationId={me?.organization_id}
      />
      <AdminCard>
        <Text style={styles.label}>Yön</Text>
        <View style={styles.row}>
          {(['given', 'received'] as FinanceCheckDirection[]).map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.opt, direction === d && styles.optOn]}
              onPress={() => setDirection(d)}
            >
              <Text style={[styles.optText, direction === d && styles.optTextOn]}>{CHECK_DIRECTION_LABELS[d]}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Karşı taraf (kimden / kime)</Text>
        <TextInput
          style={styles.input}
          value={counterparty}
          onChangeText={setCounterparty}
          placeholder="Örn. Tedarikçi adı, banka…"
        />
        <Text style={styles.label}>Tutar (₺)</Text>
        <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
        <Text style={styles.label}>Durum</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          {STATUSES.map((s) => (
            <TouchableOpacity key={s} style={[styles.tag, status === s && styles.tagOn]} onPress={() => setStatus(s)}>
              <Text style={[styles.tagText, status === s && styles.tagTextOn]}>{CHECK_STATUS_LABELS[s]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>Çek no</Text>
        <TextInput style={styles.input} value={checkNumber} onChangeText={setCheckNumber} />
        <Text style={styles.label}>Banka / Şube</Text>
        <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="Banka" />
        <TextInput style={[styles.input, { marginTop: 8 }]} value={branchName} onChangeText={setBranchName} placeholder="Şube" />
        <Text style={styles.label}>Düzenleme tarihi</Text>
        <TextInput style={styles.input} value={issueDate} onChangeText={setIssueDate} placeholder="YYYY-MM-DD" />
        <Text style={styles.label}>Vade tarihi</Text>
        <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />
        <Text style={styles.label}>Amaç / açıklama</Text>
        <TextInput style={[styles.input, styles.multiline]} value={purpose} onChangeText={setPurpose} multiline />
        <Text style={styles.label}>Notlar</Text>
        <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} multiline />
      </AdminCard>

      <AdminCard>
        <Text style={styles.label}>Çek görüntüsü</Text>
        <View style={styles.imgActions}>
          <TouchableOpacity style={styles.imgBtn} onPress={pickCamera} disabled={uploading}>
            <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Çek</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.imgBtn} onPress={pickLib} disabled={uploading}>
            <Ionicons name="images-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.imgBtnText}>Galeri</Text>
          </TouchableOpacity>
        </View>
        {uploading ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
        <View style={styles.thumbs}>
          {imageUrls.map((u) => (
            <Image key={u} source={{ uri: u }} style={styles.thumb} />
          ))}
        </View>
      </AdminCard>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Kaydet</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6 },
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
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  opt: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
  },
  optOn: { borderColor: adminTheme.colors.info, backgroundColor: adminTheme.colors.infoLight },
  optText: { fontSize: 14, color: adminTheme.colors.textSecondary },
  optTextOn: { fontWeight: '700', color: adminTheme.colors.info },
  hScroll: { marginBottom: 12 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  tagOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  tagText: { fontSize: 12, color: adminTheme.colors.textSecondary },
  tagTextOn: { color: '#fff', fontWeight: '600' },
  imgActions: { flexDirection: 'row', gap: 12 },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  imgBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
