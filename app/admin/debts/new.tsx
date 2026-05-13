import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { DEBT_CATEGORY_LABELS, notifyDebtEntryCreated, type DebtCategory } from '@/lib/finance';

type StaffOpt = { id: string; full_name: string | null };

export default function AdminDebtNew() {
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [saving, setSaving] = useState(false);
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [category, setCategory] = useState<DebtCategory>('personal');
  const [borrowerIsOrg, setBorrowerIsOrg] = useState(false);
  const [lenderIsOrg, setLenderIsOrg] = useState(false);
  const [borrowerStaffId, setBorrowerStaffId] = useState<string | null>(null);
  const [lenderStaffId, setLenderStaffId] = useState<string | null>(null);
  const [pickModal, setPickModal] = useState<'borrower' | 'lender' | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  useEffect(() => {
    if (!orgId || orgId === 'all') {
      setStaffList([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('full_name');
      setStaffList(((data ?? []) as StaffOpt[]) ?? []);
    })();
  }, [orgId]);

  const borrowerLabel = () => {
    if (borrowerIsOrg) return 'Şirket / Otel';
    const s = staffList.find((x) => x.id === borrowerStaffId);
    return s?.full_name?.trim() || 'Personel seçin';
  };
  const lenderLabel = () => {
    if (lenderIsOrg) return 'Şirket / Otel';
    const s = staffList.find((x) => x.id === lenderStaffId);
    return s?.full_name?.trim() || 'Personel seçin';
  };

  const save = async () => {
    if (!me?.id) {
      Alert.alert('Oturum', 'Personel gerekli.');
      return;
    }
    if (!orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Üstten işletme seçin.');
      return;
    }
    if (borrowerIsOrg && lenderIsOrg) {
      Alert.alert('Form', 'Taraflardan biri mutlaka personel olmalı.');
      return;
    }
    if (!borrowerIsOrg && !borrowerStaffId) {
      Alert.alert('Form', 'Borçlu personeli seçin veya Şirket seçin.');
      return;
    }
    if (!lenderIsOrg && !lenderStaffId) {
      Alert.alert('Form', 'Alacaklı personeli seçin veya Şirket seçin.');
      return;
    }
    const a = parseFloat(amount.replace(',', '.'));
    if (Number.isNaN(a) || a <= 0) {
      Alert.alert('Form', 'Geçerli tutar girin.');
      return;
    }

    setSaving(true);
    const { data, error } = await supabase
      .from('staff_debt_entries')
      .insert({
        organization_id: orgId,
        category,
        borrower_staff_id: borrowerIsOrg ? null : borrowerStaffId,
        borrower_is_organization: borrowerIsOrg,
        lender_staff_id: lenderIsOrg ? null : lenderStaffId,
        lender_is_organization: lenderIsOrg,
        description: description.trim() || 'Borç kaydı',
        amount_principal: a,
        currency: 'TRY',
        due_date: dueDate.trim() || null,
        created_by_staff_id: me.id,
      })
      .select(
        'id, borrower_staff_id, lender_staff_id, borrower_is_organization, lender_is_organization, amount_principal, currency, description'
      )
      .single();

    setSaving(false);
    if (error) {
      Alert.alert('Kayıt', error.message);
      return;
    }

    const row = data as {
      id: string;
      borrower_staff_id: string | null;
      lender_staff_id: string | null;
      borrower_is_organization: boolean;
      lender_is_organization: boolean;
      amount_principal: number;
      currency: string;
      description: string;
    };

    await notifyDebtEntryCreated(row, me.id);

    router.replace({ pathname: '/admin/debts/[id]', params: { id: row.id } } as never);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard>
          <Text style={styles.label}>Kategori</Text>
          {(['personal', 'hotel_expense', 'company_flow'] as DebtCategory[]).map((c) => (
            <TouchableOpacity key={c} style={[styles.catRow, category === c && styles.catRowOn]} onPress={() => setCategory(c)}>
              <Text style={[styles.catText, category === c && styles.catTextOn]}>{DEBT_CATEGORY_LABELS[c]}</Text>
            </TouchableOpacity>
          ))}
        </AdminCard>

        <AdminCard>
          <Text style={styles.label}>Borçlu (ödeyecek)</Text>
          <TouchableOpacity style={styles.pick} onPress={() => setBorrowerIsOrg((v) => !v)}>
            <Text style={styles.pickHint}>{borrowerIsOrg ? 'Şirket borçlu' : 'Personel borçlu'}</Text>
            <Ionicons name={borrowerIsOrg ? 'checkbox' : 'square-outline'} size={22} color={adminTheme.colors.primary} />
          </TouchableOpacity>
          {!borrowerIsOrg ? (
            <TouchableOpacity style={styles.pick} onPress={() => setPickModal('borrower')}>
              <Text style={styles.pickMain}>{borrowerLabel()}</Text>
              <Ionicons name="chevron-down" size={20} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.label, { marginTop: 14 }]}>Alacaklı (tahsil edecek)</Text>
          <TouchableOpacity style={styles.pick} onPress={() => setLenderIsOrg((v) => !v)}>
            <Text style={styles.pickHint}>{lenderIsOrg ? 'Şirket alacaklı' : 'Personel alacaklı'}</Text>
            <Ionicons name={lenderIsOrg ? 'checkbox' : 'square-outline'} size={22} color={adminTheme.colors.primary} />
          </TouchableOpacity>
          {!lenderIsOrg ? (
            <TouchableOpacity style={styles.pick} onPress={() => setPickModal('lender')}>
              <Text style={styles.pickMain}>{lenderLabel()}</Text>
              <Ionicons name="chevron-down" size={20} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </AdminCard>

        <AdminCard>
          <Text style={styles.label}>Ana para (₺)</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0,00" />
          <Text style={styles.label}>Açıklama</Text>
          <TextInput style={[styles.input, styles.ta]} value={description} onChangeText={setDescription} multiline placeholder="Ne için…" />
          <Text style={styles.label}>Vade (isteğe bağlı)</Text>
          <TextInput style={styles.input} value={dueDate} onChangeText={setDueDate} placeholder="YYYY-MM-DD" />
        </AdminCard>

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Kaydet ve bildir</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={pickModal != null} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setPickModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>{pickModal === 'borrower' ? 'Borçlu personel' : 'Alacaklı personel'}</Text>
            <FlatList
              data={staffList}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    if (pickModal === 'borrower') setBorrowerStaffId(item.id);
                    else setLenderStaffId(item.id);
                    setPickModal(null);
                  }}
                >
                  <Text style={styles.modalRowText}>{item.full_name?.trim() || item.id.slice(0, 8)}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Personel listesi boş.</Text>}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickModal(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
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
  ta: { minHeight: 88, textAlignVertical: 'top' },
  catRow: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  catRowOn: { borderColor: adminTheme.colors.info, backgroundColor: adminTheme.colors.infoLight },
  catText: { fontSize: 14, color: adminTheme.colors.text },
  catTextOn: { fontWeight: '700', color: adminTheme.colors.info },
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  pickHint: { fontSize: 14, color: adminTheme.colors.textSecondary },
  pickMain: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    paddingBottom: 24,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', padding: 16, color: adminTheme.colors.text },
  modalRow: { paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.border },
  modalRowText: { fontSize: 16, color: adminTheme.colors.text },
  empty: { padding: 24, textAlign: 'center', color: adminTheme.colors.textMuted },
  modalClose: { padding: 16, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: adminTheme.colors.info, fontWeight: '600' },
});
