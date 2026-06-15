import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Modal,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { COUNTERPARTY_TYPE_META, resolveCounterpartyTypeMeta } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

const TYPES = Object.keys(COUNTERPARTY_TYPE_META) as FinanceCounterpartyType[];

export default function CounterpartyNewScreen() {
  const { scope: scopeParam } = useLocalSearchParams<{ scope?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxOffice, setTaxOffice] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [notes, setNotes] = useState('');
  const initialType: FinanceCounterpartyType =
    scopeParam === 'personal' ? 'private_person' : scopeParam === 'hotel' ? 'subcontractor' : 'subcontractor';
  const [partyType, setPartyType] = useState<FinanceCounterpartyType>(initialType);
  const [customTypeLabel, setCustomTypeLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const focusField = (key: string) => {
    requestAnimationFrame(() => {
      const y = fieldY.current[key];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: true });
    });
  };

  const orgId = useMemo(() => {
    if (me?.app_permissions?.super_admin === true || me?.role === 'admin') {
      return selectedOrganizationId !== 'all' ? selectedOrganizationId : me?.organization_id;
    }
    return me?.organization_id;
  }, [me, selectedOrganizationId]);

  const typeMeta = resolveCounterpartyTypeMeta(partyType, customTypeLabel);
  const displayTypeLabel = typeMeta.label;

  const pickType = (t: FinanceCounterpartyType) => {
    setPartyType(t);
    setTypeDrawerOpen(false);
  };

  const pickCustomType = () => {
    setPartyType('other');
    setTypeDrawerOpen(false);
    focusField('customType');
  };

  const save = async () => {
    if (!me?.id || !orgId || orgId === 'all') {
      Alert.alert('İşletme', 'Önce işletme seçin.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Ad gerekli', 'Firma veya kişi adını yazın.');
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from('finance_counterparties')
      .insert({
        organization_id: orgId,
        name: name.trim(),
        party_type: partyType,
        party_type_label: customTypeLabel.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        tax_id: taxId.trim() || null,
        tax_office: taxOffice.trim() || null,
        extra_info: extraInfo.trim() || null,
        notes: notes.trim() || null,
        created_by_staff_id: me.id,
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      Alert.alert('Kaydedilemedi', error.message);
      return;
    }
    router.replace({
      pathname: '/admin/accounting/counterparties/[id]',
      params: { id: (data as { id: string }).id },
    } as never);
  };

  const contentPadBottom =
    Math.max(insets.bottom, 16) + 48 + (Platform.OS === 'android' ? keyboardHeight : 0);

  const fieldWrap = (key: string, label: string, children: ReactNode, optional = true) => (
    <View onLayout={(e) => { fieldY.current[key] = e.nativeEvent.layout.y; }}>
      <Text style={styles.label}>
        {label}
        {optional ? <Text style={styles.optional}> (isteğe bağlı)</Text> : null}
      </Text>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: contentPadBottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          Müşteri, tedarikçi, taşeron veya başka bir cari… Kaydettikten sonra ödeme ve tahsilatta listeden
          seçersiniz.
        </Text>

        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />

        <Text style={styles.label}>Ad *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Örn. Ahmet Usta, ABC Market"
          placeholderTextColor={adminTheme.colors.textMuted}
          autoFocus
        />

        <Text style={styles.label}>Bu kim?</Text>
        <TouchableOpacity
          style={[styles.typePicked, { borderColor: typeMeta.color, backgroundColor: typeMeta.bg }]}
          onPress={() => setTypeDrawerOpen(true)}
          activeOpacity={0.88}
        >
          <View style={[styles.typePickedIcon, { backgroundColor: adminTheme.colors.surface }]}>
            <Ionicons name={typeMeta.icon} size={22} color={typeMeta.color} />
          </View>
          <View style={styles.typePickedBody}>
            <Text style={[styles.typePickedName, { color: typeMeta.color }]}>{displayTypeLabel}</Text>
            <Text style={styles.typePickedHint}>{typeMeta.hint}</Text>
          </View>
          <Ionicons name="chevron-down" size={20} color={typeMeta.color} />
        </TouchableOpacity>

        {fieldWrap(
          'customType',
          'Özel tür adı',
          <TextInput
            style={styles.input}
            value={customTypeLabel}
            onChangeText={setCustomTypeLabel}
            onFocus={() => focusField('customType')}
            placeholder="Örn. Komşu, Bahçıvan, Eski ortak"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        <Text style={styles.sectionTitle}>İletişim</Text>

        {fieldWrap(
          'phone',
          'Telefon',
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            onFocus={() => focusField('phone')}
            keyboardType="phone-pad"
            placeholder="05xx…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        {fieldWrap(
          'address',
          'Adres',
          <TextInput
            style={[styles.input, styles.areaSm]}
            value={address}
            onChangeText={setAddress}
            onFocus={() => focusField('address')}
            multiline
            placeholder="Mahalle, sokak, ilçe…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        <Text style={styles.sectionTitle}>Resmi bilgiler</Text>

        {fieldWrap(
          'taxId',
          'Vergi / T.C. kimlik no',
          <TextInput
            style={styles.input}
            value={taxId}
            onChangeText={setTaxId}
            onFocus={() => focusField('taxId')}
            keyboardType="number-pad"
            placeholder="VKN veya TCKN"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        {fieldWrap(
          'taxOffice',
          'Vergi dairesi',
          <TextInput
            style={styles.input}
            value={taxOffice}
            onChangeText={setTaxOffice}
            onFocus={() => focusField('taxOffice')}
            placeholder="Örn. Kadıköy VD"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        <Text style={styles.sectionTitle}>Ek bilgiler</Text>

        {fieldWrap(
          'extraInfo',
          'Diğer bilgiler',
          <TextInput
            style={[styles.input, styles.area]}
            value={extraInfo}
            onChangeText={setExtraInfo}
            onFocus={() => focusField('extraInfo')}
            multiline
            placeholder="IBAN, yetkili kişi, e-posta, sözleşme notu…"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        {fieldWrap(
          'notes',
          'Kısa not',
          <TextInput
            style={[styles.input, styles.areaSm]}
            value={notes}
            onChangeText={setNotes}
            onFocus={() => focusField('notes')}
            multiline
            placeholder="İç kullanım için kısa not"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        )}

        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={typeDrawerOpen} transparent animationType="slide" onRequestClose={() => setTypeDrawerOpen(false)}>
        <Pressable style={styles.drawerOverlay} onPress={() => setTypeDrawerOpen(false)}>
          <Pressable
            style={[styles.drawerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Bu kim?</Text>
            <Text style={styles.drawerSub}>Cari türünü seçin — ödeme raporlarında görünür</Text>
            <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
              {TYPES.map((t) => {
                const m = COUNTERPARTY_TYPE_META[t];
                const on = partyType === t && !customTypeLabel.trim();
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.drawerCard, on && { borderColor: m.color, backgroundColor: m.bg }]}
                    onPress={() => {
                      setCustomTypeLabel('');
                      pickType(t);
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.drawerCardIcon, { backgroundColor: on ? adminTheme.colors.surface : m.bg }]}>
                      <Ionicons name={m.icon} size={22} color={m.color} />
                    </View>
                    <View style={styles.drawerCardBody}>
                      <Text style={[styles.drawerCardLabel, on && { color: m.color }]}>{m.label}</Text>
                      <Text style={styles.drawerCardHint}>{m.hint}</Text>
                    </View>
                    {on ? <Ionicons name="checkmark-circle" size={22} color={m.color} /> : null}
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[
                  styles.drawerCard,
                  styles.drawerCardCustom,
                  !!customTypeLabel.trim() && styles.drawerCardCustomOn,
                ]}
                onPress={pickCustomType}
                activeOpacity={0.85}
              >
                <View style={[styles.drawerCardIcon, { backgroundColor: '#f1f5f9' }]}>
                  <Ionicons name="create-outline" size={22} color="#64748b" />
                </View>
                <View style={styles.drawerCardBody}>
                  <Text style={styles.drawerCardLabel}>Özel kategori yaz</Text>
                  <Text style={styles.drawerCardHint}>Listede kendi tür adınız görünür</Text>
                </View>
                {customTypeLabel.trim() ? (
                  <Ionicons name="checkmark-circle" size={22} color="#64748b" />
                ) : null}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16 },
  lead: { fontSize: 14, color: adminTheme.colors.textMuted, lineHeight: 20, marginBottom: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 8 },
  optional: { fontWeight: '500', color: adminTheme.colors.textMuted },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 16,
  },
  area: { minHeight: 96, textAlignVertical: 'top' },
  areaSm: { minHeight: 72, textAlignVertical: 'top' },
  typePicked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 20,
  },
  typePickedIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typePickedBody: { flex: 1, minWidth: 0 },
  typePickedName: { fontSize: 15, fontWeight: '800' },
  typePickedHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  drawerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  drawerSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    maxHeight: '78%',
  },
  drawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    alignSelf: 'center',
    marginBottom: 10,
  },
  drawerTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  drawerSub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  drawerScroll: { maxHeight: 480 },
  drawerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
    marginBottom: 8,
  },
  drawerCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerCardBody: { flex: 1, minWidth: 0 },
  drawerCardLabel: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  drawerCardHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 2 },
  drawerCardCustom: {
    borderStyle: 'dashed',
    marginTop: 4,
    marginBottom: 4,
  },
  drawerCardCustomOn: {
    borderColor: '#64748b',
    backgroundColor: '#f8fafc',
  },
});
