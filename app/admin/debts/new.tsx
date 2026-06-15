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
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { DEBT_CATEGORY_META, debtRowPerspective, type DebtListRow } from '@/lib/debtUi';
import { notifyDebtEntryCreated, type DebtCategory } from '@/lib/finance';
import { fmtMoneyTry } from '@/lib/financeLedger';

type StaffOpt = { id: string; full_name: string | null };

function PartyCard({
  title,
  subtitle,
  isOrg,
  onToggleOrg,
  staffLabel,
  onPickStaff,
  icon,
}: {
  title: string;
  subtitle: string;
  isOrg: boolean;
  onToggleOrg: (org: boolean) => void;
  staffLabel: string;
  onPickStaff: () => void;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={partyStyles.card}>
      <View style={partyStyles.head}>
        <View style={partyStyles.iconWrap}>
          <Ionicons name={icon} size={20} color={adminTheme.colors.primary} />
        </View>
        <View style={partyStyles.headText}>
          <Text style={partyStyles.title}>{title}</Text>
          <Text style={partyStyles.sub}>{subtitle}</Text>
        </View>
      </View>
      <View style={partyStyles.seg}>
        <TouchableOpacity
          style={[partyStyles.segBtn, !isOrg && partyStyles.segBtnOn]}
          onPress={() => onToggleOrg(false)}
          activeOpacity={0.85}
        >
          <Ionicons name="person-outline" size={16} color={!isOrg ? '#fff' : adminTheme.colors.textMuted} />
          <Text style={[partyStyles.segText, !isOrg && partyStyles.segTextOn]}>Personel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[partyStyles.segBtn, isOrg && partyStyles.segBtnOn]}
          onPress={() => onToggleOrg(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="business-outline" size={16} color={isOrg ? '#fff' : adminTheme.colors.textMuted} />
          <Text style={[partyStyles.segText, isOrg && partyStyles.segTextOn]}>Şirket / Otel</Text>
        </TouchableOpacity>
      </View>
      {!isOrg ? (
        <TouchableOpacity style={partyStyles.pickRow} onPress={onPickStaff} activeOpacity={0.85}>
          <Text style={partyStyles.pickValue} numberOfLines={1}>
            {staffLabel}
          </Text>
          <Ionicons name="chevron-down" size={20} color={adminTheme.colors.textMuted} />
        </TouchableOpacity>
      ) : (
        <Text style={partyStyles.orgNote}>İşletme tarafı olarak kaydedilir</Text>
      )}
    </View>
  );
}

const partyStyles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  sub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  seg: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  segBtnOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  segText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  segTextOn: { color: '#fff' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  pickValue: { flex: 1, fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  orgNote: { fontSize: 13, color: adminTheme.colors.info, fontWeight: '600' },
});

const WINDOW_H = Dimensions.get('window').height;

export default function AdminDebtNew() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [staffList, setStaffList] = useState<StaffOpt[]>([]);
  const [category, setCategory] = useState<DebtCategory>('personal');
  const [borrowerIsOrg, setBorrowerIsOrg] = useState(false);
  const [lenderIsOrg, setLenderIsOrg] = useState(true);
  const [borrowerStaffId, setBorrowerStaffId] = useState<string | null>(null);
  const [lenderStaffId, setLenderStaffId] = useState<string | null>(null);
  const [pickModal, setPickModal] = useState<'borrower' | 'lender' | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
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
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!pickModal) setKeyboardHeight(0);
  }, [pickModal]);

  const staffListMaxHeight = useMemo(() => {
    const reserved = 200 + insets.bottom + keyboardHeight;
    return Math.max(140, WINDOW_H * 0.52 - reserved);
  }, [keyboardHeight, insets.bottom]);

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

  const previewLine = useMemo(() => {
    const a = parseFloat(amount.replace(',', '.'));
    if (!a || a <= 0) return null;
    const fake: DebtListRow = {
      id: 'preview',
      organization_id: orgId ?? '',
      category,
      borrower_staff_id: borrowerStaffId,
      borrower_is_organization: borrowerIsOrg,
      lender_staff_id: lenderStaffId,
      lender_is_organization: lenderIsOrg,
      description: description.trim() || 'Borç kaydı',
      amount_principal: a,
      amount_remaining: a,
      status: 'open',
      due_date: dueDate.trim() || null,
      created_at: new Date().toISOString(),
      borrower: borrowerStaffId
        ? { full_name: staffList.find((s) => s.id === borrowerStaffId)?.full_name ?? null }
        : null,
      lender: lenderStaffId
        ? { full_name: staffList.find((s) => s.id === lenderStaffId)?.full_name ?? null }
        : null,
    };
    return debtRowPerspective(fake);
  }, [
    amount,
    category,
    borrowerIsOrg,
    lenderIsOrg,
    borrowerStaffId,
    lenderStaffId,
    description,
    dueDate,
    staffList,
    orgId,
  ]);

  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffList;
    return staffList.filter((s) => (s.full_name ?? '').toLowerCase().includes(q));
  }, [staffList, staffSearch]);

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
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <Text style={styles.pageTitle}>Yeni borç kaydı</Text>
        <Text style={styles.pageSub}>Kim kime ne kadar borçlu — kayıt sonrası ödeme ekleyebilirsiniz.</Text>

        {previewLine ? (
          <View
            style={[
              styles.preview,
              previewLine.tone === 'receivable' && styles.previewRec,
              previewLine.tone === 'payable' && styles.previewPay,
            ]}
          >
            <Ionicons
              name={
                previewLine.tone === 'receivable'
                  ? 'arrow-down-circle'
                  : previewLine.tone === 'payable'
                    ? 'arrow-up-circle'
                    : 'swap-horizontal'
              }
              size={22}
              color={
                previewLine.tone === 'receivable'
                  ? '#15803d'
                  : previewLine.tone === 'payable'
                    ? '#c2410c'
                    : '#64748b'
              }
            />
            <Text style={styles.previewText}>{previewLine.line}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLbl}>Kategori</Text>
        <View style={styles.catRow}>
          {(['personal', 'hotel_expense', 'company_flow'] as DebtCategory[]).map((c) => {
            const meta = DEBT_CATEGORY_META[c];
            const on = category === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.catChip, on && { borderColor: meta.color, backgroundColor: meta.bg }]}
                onPress={() => setCategory(c)}
                activeOpacity={0.85}
              >
                <Ionicons name={meta.icon} size={18} color={on ? meta.color : adminTheme.colors.textMuted} />
                <Text style={[styles.catChipText, on && { color: meta.color, fontWeight: '800' }]}>
                  {meta.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <PartyCard
          title="Borçlu"
          subtitle="Parayı ödeyecek taraf"
          icon="arrow-up-circle-outline"
          isOrg={borrowerIsOrg}
          onToggleOrg={setBorrowerIsOrg}
          staffLabel={borrowerLabel()}
          onPickStaff={() => {
            setStaffSearch('');
            setPickModal('borrower');
          }}
        />

        <PartyCard
          title="Alacaklı"
          subtitle="Parayı tahsil edecek taraf"
          icon="arrow-down-circle-outline"
          isOrg={lenderIsOrg}
          onToggleOrg={setLenderIsOrg}
          staffLabel={lenderLabel()}
          onPickStaff={() => {
            setStaffSearch('');
            setPickModal('lender');
          }}
        />

        <View style={styles.amountCard}>
          <Text style={styles.amountLbl}>Ana tutar (₺)</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#94a3b8"
          />
          {amount ? (
            <Text style={styles.amountHint}>{fmtMoneyTry(parseFloat(amount.replace(',', '.')) || 0)}</Text>
          ) : null}
        </View>

        <View style={styles.fieldCard}>
          <Text style={styles.fieldLbl}>Açıklama</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldArea]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Ne için, hangi iş…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <Text style={styles.fieldLbl}>Vade (isteğe bağlı)</Text>
          <TextInput
            style={styles.fieldInput}
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </View>

        <View style={{ height: 88 }} />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving} activeOpacity={0.9}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.saveText}>Kaydet ve bildir</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={pickModal != null} transparent animationType="slide">
        <Pressable style={styles.modalBackdrop} onPress={() => setPickModal(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>
              {pickModal === 'borrower' ? 'Borçlu personel' : 'Alacaklı personel'}
            </Text>
            <View style={styles.modalSearch}>
              <Ionicons name="search" size={18} color={adminTheme.colors.textMuted} />
              <TextInput
                style={styles.modalSearchInput}
                value={staffSearch}
                onChangeText={setStaffSearch}
                placeholder="İsim ara…"
                placeholderTextColor={adminTheme.colors.textMuted}
                autoFocus
              />
            </View>
            <FlatList
              data={filteredStaff}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalRow}
                  onPress={() => {
                    if (pickModal === 'borrower') setBorrowerStaffId(item.id);
                    else setLenderStaffId(item.id);
                    setPickModal(null);
                  }}
                >
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>
                      {(item.full_name?.trim() || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.modalRowText}>{item.full_name?.trim() || item.id.slice(0, 8)}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Personel bulunamadı.</Text>}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickModal(null)}>
              <Text style={styles.modalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 24 },
  pageTitle: { fontSize: 22, fontWeight: '800', color: adminTheme.colors.text },
  pageSub: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 14, lineHeight: 18 },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  previewRec: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  previewPay: { borderColor: '#fcd34d', backgroundColor: '#fffbeb' },
  previewText: { flex: 1, fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  sectionLbl: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  catRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  catChip: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  catChipText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted },
  amountCard: {
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
  },
  amountLbl: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  amountInput: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginTop: 8,
    padding: 0,
  },
  amountHint: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 6 },
  fieldCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  fieldLbl: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 6, marginTop: 8 },
  fieldInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  fieldArea: { minHeight: 80, textAlignVertical: 'top' },
  footer: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: adminTheme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '82%',
    paddingTop: 4,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', paddingHorizontal: 16, color: adminTheme.colors.text },
  modalSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  modalSearchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text },
  modalList: { flexGrow: 0 },
  modalListContent: { paddingBottom: 8 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  modalAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  modalRowText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  empty: { padding: 24, textAlign: 'center', color: adminTheme.colors.textMuted },
  modalClose: { padding: 16, alignItems: 'center' },
  modalCloseText: { fontSize: 16, color: adminTheme.colors.primary, fontWeight: '700' },
});
