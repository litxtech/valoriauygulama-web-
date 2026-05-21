import { useState, useMemo, useRef, useEffect } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { COUNTERPARTY_TYPE_META } from '@/lib/financeCounterpartyUi';
import type { FinanceCounterpartyType } from '@/lib/financeLedger';

const TYPES = Object.keys(COUNTERPARTY_TYPE_META) as FinanceCounterpartyType[];

export default function CounterpartyNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fieldY = useRef<Record<string, number>>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [partyType, setPartyType] = useState<FinanceCounterpartyType>('supplier');
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
        phone: phone.trim() || null,
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
        Müşteri, tedarikçi veya taşeron… Kaydettikten sonra gelir ve gider girerken listeden seçersiniz.
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
      <View style={styles.typeGrid}>
        {TYPES.map((t) => {
          const m = COUNTERPARTY_TYPE_META[t];
          const on = partyType === t;
          return (
            <TouchableOpacity
              key={t}
              style={[styles.typeCard, on && { borderColor: m.color, backgroundColor: m.bg }]}
              onPress={() => setPartyType(t)}
              activeOpacity={0.85}
            >
              <Ionicons name={m.icon} size={22} color={m.color} />
              <Text style={[styles.typeLabel, on && { color: m.color }]}>{m.label}</Text>
              <Text style={styles.typeHint}>{m.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View onLayout={(e) => { fieldY.current.phone = e.nativeEvent.layout.y; }}>
        <Text style={styles.label}>Telefon (isteğe bağlı)</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          onFocus={() => focusField('phone')}
          keyboardType="phone-pad"
          placeholder="05xx…"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </View>

      <View onLayout={(e) => { fieldY.current.notes = e.nativeEvent.layout.y; }}>
        <Text style={styles.label}>Not (isteğe bağlı)</Text>
        <TextInput
          style={[styles.input, styles.area]}
          value={notes}
          onChangeText={setNotes}
          onFocus={() => focusField('notes')}
          multiline
          placeholder="Kısa not"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
      </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16 },
  lead: { fontSize: 14, color: adminTheme.colors.textMuted, lineHeight: 20, marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: adminTheme.colors.text,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 20,
  },
  area: { minHeight: 80, textAlignVertical: 'top' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  typeCard: {
    width: '47%',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surface,
  },
  typeLabel: { fontSize: 14, fontWeight: '700', marginTop: 8, color: adminTheme.colors.text },
  typeHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
