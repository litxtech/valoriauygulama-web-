import { View, Text, TextInput, StyleSheet } from 'react-native';
import { adminTheme } from '@/constants/adminTheme';

export type PartyFormState = {
  role: string;
  company: string;
  fullName: string;
  authorityTitle: string;
  taxOrId: string;
  phone: string;
  email: string;
  address: string;
};

export const emptyPartyForm = (): PartyFormState => ({
  role: '',
  company: '',
  fullName: '',
  authorityTitle: '',
  taxOrId: '',
  phone: '',
  email: '',
  address: '',
});

export function partyFormToInput(side: 'party_1' | 'party_2', p: PartyFormState) {
  return {
    party_side: side,
    party_role: p.role.trim() || (side === 'party_1' ? 'Taraf 1' : 'Taraf 2'),
    company_name: p.company.trim() || null,
    full_name: p.fullName.trim() || null,
    authority_title: p.authorityTitle.trim() || null,
    tax_number: p.taxOrId.trim() || null,
    id_number: p.taxOrId.trim() || null,
    phone: p.phone.trim() || null,
    email: p.email.trim() || null,
    address: p.address.trim() || null,
    is_authority: !!p.fullName.trim() || !!p.authorityTitle.trim(),
  };
}

export function partyFormFromRow(row: {
  party_role: string;
  company_name?: string | null;
  full_name?: string | null;
  authority_title?: string | null;
  tax_number?: string | null;
  id_number?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}): PartyFormState {
  return {
    role: row.party_role ?? '',
    company: row.company_name ?? '',
    fullName: row.full_name ?? '',
    authorityTitle: row.authority_title ?? '',
    taxOrId: row.tax_number ?? row.id_number ?? '',
    phone: row.phone ?? '',
    email: row.email ?? '',
    address: row.address ?? '',
  };
}

type Props = {
  title: string;
  hint?: string;
  value: PartyFormState;
  onChange: (next: PartyFormState) => void;
};

export function PartyFormFields({ title, hint, value, onChange }: Props) {
  const set = (patch: Partial<PartyFormState>) => onChange({ ...value, ...patch });

  return (
    <View style={styles.block}>
      <Text style={styles.section}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <TextInput
        style={styles.input}
        value={value.role}
        onChangeText={(role) => set({ role })}
        placeholder="Taraf rolü / unvan (örn. İşletmeci, Kiracı, Tedarikçi)"
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.company}
        onChangeText={(company) => set({ company })}
        placeholder="Şirket / kişi / kurum adı"
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.fullName}
        onChangeText={(fullName) => set({ fullName })}
        placeholder="Yetkili ad soyad"
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.authorityTitle}
        onChangeText={(authorityTitle) => set({ authorityTitle })}
        placeholder="Yetkili ünvanı"
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.taxOrId}
        onChangeText={(taxOrId) => set({ taxOrId })}
        placeholder="Vergi no / TC / pasaport"
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <TextInput
        style={styles.input}
        value={value.phone}
        onChangeText={(phone) => set({ phone })}
        placeholder="Telefon"
        placeholderTextColor={adminTheme.colors.textMuted}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        value={value.email}
        onChangeText={(email) => set({ email })}
        placeholder="E-posta"
        placeholderTextColor={adminTheme.colors.textMuted}
        autoCapitalize="none"
      />
      <TextInput
        style={[styles.input, styles.multiline]}
        value={value.address}
        onChangeText={(address) => set({ address })}
        placeholder="Adres"
        placeholderTextColor={adminTheme.colors.textMuted}
        multiline
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: 8 },
  section: { marginTop: 8, marginBottom: 4, fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  hint: { marginBottom: 8, fontSize: 12, color: adminTheme.colors.textMuted, lineHeight: 18 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  multiline: { minHeight: 56 },
});
