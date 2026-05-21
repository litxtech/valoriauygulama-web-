import { useState, useEffect, useMemo, useRef } from 'react';
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
  Modal,
  FlatList,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  MOVEMENT_KIND_LABELS,
  PAYMENT_METHOD_LABELS,
  type FinanceMovementKind,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';
import { loadMovementCategories } from '@/lib/financeCategoriesApi';
import { CounterpartyPickerSheet } from '@/components/admin/CounterpartyPickerSheet';
import { COUNTERPARTY_TYPE_META, counterpartyInitials } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

type CpOpt = { id: string; name: string; party_type: FinanceCounterpartyType };
type ProjOpt = { id: string; name: string };

const PAY_METHODS: MovementPaymentMethod[] = ['cash', 'transfer', 'card', 'check', 'other'];

export default function AccountingMovementNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const counterpartyFreeWrapRef = useRef<View>(null);
  const counterpartyFreeInputRef = useRef<TextInput>(null);
  const descriptionWrapRef = useRef<View>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { kind: kindParam, counterpartyId: counterpartyIdParam } = useLocalSearchParams<{
    kind?: string;
    counterpartyId?: string;
  }>();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);

  const initialKind: FinanceMovementKind = kindParam === 'income' ? 'income' : 'expense';
  const [kind, setKind] = useState<FinanceMovementKind>(initialKind);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [amount, setAmount] = useState('');
  const [movementDate, setMovementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<MovementPaymentMethod>('cash');
  const [category, setCategory] = useState<string>(initialKind === 'income' ? 'sales' : 'other');
  const [counterpartyId, setCounterpartyId] = useState<string | null>(null);
  const [counterpartyFree, setCounterpartyFree] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [counterparties, setCounterparties] = useState<CpOpt[]>([]);
  const [projects, setProjects] = useState<ProjOpt[]>([]);
  const [pickCp, setPickCp] = useState(false);
  const [pickProj, setPickProj] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<{ code: string; label: string }[]>([]);

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const scrollFieldIntoView = (target: React.RefObject<View | null>) => {
    const content = contentRef.current;
    const field = target.current;
    if (!content || !field) return;
    requestAnimationFrame(() => {
      field.measureLayout(
        content,
        (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 88), animated: true }),
        () => {}
      );
    });
  };

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setCategoryOptions([]);
      setCounterparties([]);
      setProjects([]);
      return;
    }
    loadMovementCategories(orgId, kind).then((opts) => {
      setCategoryOptions(opts);
      if (opts.length && !opts.some((o) => o.code === category)) {
        setCategory(opts[0].code);
      }
    });
  }, [orgId, kind]);

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setCounterparties([]);
      setProjects([]);
      return;
    }
    (async () => {
      const [cp, pr] = await Promise.all([
        supabase
          .from('finance_counterparties')
          .select('id, name, party_type')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('finance_projects')
          .select('id, name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order')
          .order('name'),
      ]);
      const list = ((cp.data ?? []) as CpOpt[]) ?? [];
      setCounterparties(list);
      setProjects(((pr.data ?? []) as ProjOpt[]) ?? []);
      if (counterpartyIdParam && list.some((c) => c.id === counterpartyIdParam)) {
        setCounterpartyId(counterpartyIdParam);
        setCounterpartyFree('');
      }
    })();
  }, [orgId, counterpartyIdParam]);

  const cpLabel = () => {
    if (counterpartyId) {
      return counterparties.find((c) => c.id === counterpartyId)?.name ?? 'Seçildi';
    }
    return counterpartyFree.trim() || 'Listeden seç veya ad yaz';
  };

  const selectedCp = useMemo(
    () => counterparties.find((c) => c.id === counterpartyId) ?? null,
    [counterparties, counterpartyId]
  );

  const projLabel = () => {
    if (!projectId) return 'Proje yok';
    return projects.find((p) => p.id === projectId)?.name ?? 'Proje';
  };

  const addReceipt = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-receipts',
        uri,
        subfolder: 'receipt',
      });
      setReceiptUrls((u) => [...u, publicUrl]);
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const pickCamera = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Fiş fotoğrafı için kamera gerekli.',
      settingsMessage: 'Ayarlardan kamera iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (!r.canceled && r.assets[0]?.uri) await addReceipt(r.assets[0].uri);
  };

  const pickLib = async () => {
    const ok = await ensureMediaLibraryPermission();
    if (!ok) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (!r.canceled && r.assets[0]?.uri) await addReceipt(r.assets[0].uri);
  };

  const save = async () => {
    if (!me?.id) {
      Alert.alert('Oturum', 'Personel kaydı gerekli.');
      return;
    }
    if (!orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Üstten işletme seçin.');
      return;
    }
    const a = parseFloat(amount.replace(',', '.'));
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Form', 'Geçerli tutar girin.');
      return;
    }
    const cpName =
      counterpartyId != null
        ? counterparties.find((c) => c.id === counterpartyId)?.name?.trim()
        : counterpartyFree.trim();
    if (!cpName) {
      Alert.alert('Form', 'Cari adı girin veya listeden seçin.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('finance_movements')
      .insert({
        organization_id: orgId,
        kind,
        amount: a,
        currency: 'TRY',
        movement_date: movementDate,
        payment_method: paymentMethod,
        category,
        counterparty_id: counterpartyId,
        counterparty_name: counterpartyId ? null : cpName,
        project_id: projectId,
        description: description.trim(),
        receipt_urls: receiptUrls,
        created_by_staff_id: me.id,
      })
      .select('id')
      .single();
    setSaving(false);

    if (error) {
      Alert.alert('Kayıt hatası', error.message);
      return;
    }
    router.replace({
      pathname: '/admin/accounting/movements/[id]',
      params: { id: (data as { id: string }).id },
    } as never);
  };

  const contentPadBottom =
    Math.max(insets.bottom, 16) + 56 + (Platform.OS === 'android' ? keyboardHeight : 0);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={{ paddingBottom: contentPadBottom }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      showsVerticalScrollIndicator={false}
    >
      <View ref={contentRef} style={styles.content} collapsable={false}>
      <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
        <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
        <Text style={styles.backHubText}>Muhasebe</Text>
      </TouchableOpacity>

      <AdminOrganizationPicker
        canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
        ownOrganizationId={me?.organization_id}
      />

      <AdminCard>
        <Text style={styles.label}>Tür</Text>
        <View style={styles.row}>
          {(['expense', 'income'] as FinanceMovementKind[]).map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.opt, kind === k && (k === 'income' ? styles.optIncome : styles.optExpense)]}
              onPress={() => setKind(k)}
            >
              <Text style={[styles.optText, kind === k && styles.optTextOn]}>{MOVEMENT_KIND_LABELS[k]}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Tutar (₺) *</Text>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0,00"
        />

        <Text style={styles.label}>Tarih</Text>
        <TextInput style={styles.input} value={movementDate} onChangeText={setMovementDate} placeholder="YYYY-MM-DD" />

        <Text style={styles.label}>Ödeme şekli</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          {PAY_METHODS.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.tag, paymentMethod === m && styles.tagOn]}
              onPress={() => setPaymentMethod(m)}
            >
              <Text style={[styles.tagText, paymentMethod === m && styles.tagTextOn]}>
                {PAYMENT_METHOD_LABELS[m]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>Kategori</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.hScroll}>
          {categoryOptions.map((c) => (
            <TouchableOpacity
              key={c.code}
              style={[styles.tag, category === c.code && styles.tagOn]}
              onPress={() => setCategory(c.code)}
            >
              <Text style={[styles.tagText, category === c.code && styles.tagTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.label}>{kind === 'income' ? 'Kimden aldınız? *' : 'Kime ödediniz? *'}</Text>
        {selectedCp ? (
          <TouchableOpacity style={styles.cpSelected} onPress={() => setPickCp(true)} activeOpacity={0.9}>
            <View
              style={[
                styles.cpSelectedAvatar,
                { backgroundColor: COUNTERPARTY_TYPE_META[selectedCp.party_type].bg },
              ]}
            >
              <Text
                style={[
                  styles.cpSelectedInitials,
                  { color: COUNTERPARTY_TYPE_META[selectedCp.party_type].color },
                ]}
              >
                {counterpartyInitials(selectedCp.name)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cpSelectedName}>{selectedCp.name}</Text>
              <Text style={styles.cpSelectedType}>{COUNTERPARTY_TYPE_META[selectedCp.party_type].label}</Text>
            </View>
            <Text style={styles.cpChange}>Değiştir</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.pickBtn} onPress={() => setPickCp(true)}>
              <Ionicons name="person-outline" size={20} color={adminTheme.colors.primary} />
              <Text style={[styles.pickBtnText, { flex: 1 }]} numberOfLines={1}>
                {cpLabel()}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
            <View ref={counterpartyFreeWrapRef} collapsable={false}>
              <TextInput
                ref={counterpartyFreeInputRef}
                style={[styles.input, { marginTop: 8 }]}
                value={counterpartyFree}
                onChangeText={setCounterpartyFree}
                onFocus={() => scrollFieldIntoView(counterpartyFreeWrapRef)}
                placeholder="Listede yoksa adı buraya yazın"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
            </View>
          </>
        )}

        <Text style={styles.label}>Proje (opsiyonel)</Text>
        <TouchableOpacity style={styles.pickBtn} onPress={() => setPickProj(true)}>
          <Text style={styles.pickBtnText}>{projLabel()}</Text>
          <Ionicons name="chevron-down" size={18} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>

        <View ref={descriptionWrapRef} collapsable={false}>
          <Text style={styles.label}>Açıklama</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            onFocus={() => scrollFieldIntoView(descriptionWrapRef)}
            multiline
            placeholder="Ne için, hangi iş…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>
      </AdminCard>

      <AdminCard>
        <Text style={styles.label}>Fiş / belge (opsiyonel)</Text>
        <Text style={styles.optionalHint}>Eklemek zorunlu değil; sonra da eklenebilir.</Text>
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
        {uploading ? <ActivityIndicator style={{ marginTop: 8 }} color={adminTheme.colors.accent} /> : null}
        <View style={styles.thumbs}>
          {receiptUrls.map((url, i) => (
            <View key={url} style={styles.thumbWrap}>
              <Image source={{ uri: url }} style={styles.thumb} />
              <TouchableOpacity style={styles.thumbDel} onPress={() => setReceiptUrls((u) => u.filter((_, j) => j !== i))}>
                <Ionicons name="close-circle" size={22} color="#dc2626" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </AdminCard>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.9}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Kaydet</Text>
        )}
      </TouchableOpacity>
      </View>
    </ScrollView>

      <CounterpartyPickerSheet
        visible={pickCp}
        onClose={() => setPickCp(false)}
        items={counterparties}
        selectedId={counterpartyId}
        onSelect={(id) => {
          setCounterpartyId(id);
          if (id) setCounterpartyFree('');
        }}
        onFreeText={() => {
          setCounterpartyFree('');
          setTimeout(() => {
            counterpartyFreeInputRef.current?.focus();
            scrollFieldIntoView(counterpartyFreeWrapRef);
          }, 320);
        }}
        title={kind === 'income' ? 'Parayı kimden aldınız?' : 'Parayı kime ödediniz?'}
      />

      <Modal visible={pickProj} transparent animationType="slide">
        <Pressable style={styles.modalBg} onPress={() => setPickProj(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Proje</Text>
          <TouchableOpacity
            style={styles.modalRow}
            onPress={() => {
              setProjectId(null);
              setPickProj(false);
            }}
          >
            <Text>Proje yok</Text>
          </TouchableOpacity>
          <FlatList
            data={projects}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.modalRow}
                onPress={() => {
                  setProjectId(item.id);
                  setPickProj(false);
                }}
              >
                <Text>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.modalEmpty}>Proje tanımlı değil. Cariler ekranından proje ekleyebilirsiniz.</Text>
            }
          />
          <TouchableOpacity style={styles.modalClose} onPress={() => setPickProj(false)}>
            <Text style={styles.modalCloseText}>Kapat</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16 },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginTop: 12, marginBottom: 6 },
  optionalHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 10 },
  opt: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  optExpense: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  optIncome: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  optText: { fontWeight: '600', color: adminTheme.colors.text },
  optTextOn: { color: '#fff' },
  hScroll: { marginBottom: 4 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tagOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  tagText: { fontSize: 12, color: adminTheme.colors.text },
  tagTextOn: { color: '#fff', fontWeight: '600' },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  pickBtnText: { fontSize: 15, color: adminTheme.colors.text, fontWeight: '500' },
  cpSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: adminTheme.colors.primary,
    backgroundColor: '#f0f9ff',
    marginBottom: 4,
  },
  cpSelectedAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  cpSelectedInitials: { fontSize: 15, fontWeight: '800' },
  cpSelectedName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  cpSelectedType: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  cpChange: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.primary },
  imgActions: { flexDirection: 'row', gap: 12 },
  imgBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  imgBtnText: { color: adminTheme.colors.primary, fontWeight: '600' },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  thumbDel: { position: 'absolute', top: -6, right: -6 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    maxHeight: '55%',
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  modalSearch: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    color: adminTheme.colors.text,
  },
  modalAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    marginBottom: 4,
  },
  modalAddText: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.primary },
  modalRowPlain: { paddingVertical: 10, marginBottom: 8 },
  modalRowPlainText: { fontSize: 14, color: adminTheme.colors.textMuted },
  modalCpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  modalCpRowOn: { backgroundColor: '#f0f9ff' },
  modalCpAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  modalCpAvatarText: { fontSize: 14, fontWeight: '800' },
  modalCpName: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  modalCpType: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  modalEmpty: { padding: 16, color: adminTheme.colors.textMuted, textAlign: 'center' },
  modalClose: { marginTop: 12, alignItems: 'center', padding: 12 },
  modalCloseText: { color: adminTheme.colors.primary, fontWeight: '600' },
});
