import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { OnlineBookingPartyGuest } from '@/lib/onlineBooking';
import type { BookingGuestMode } from '@/components/booking/BookingGuestModePicker';

type Props = {
  mode: BookingGuestMode;
  members: OnlineBookingPartyGuest[];
  onChange: (next: OnlineBookingPartyGuest[]) => void;
  /** Grup rezervasyonunda: grubun öğrenci olup olmadığı */
  groupIsStudent: boolean;
  onGroupIsStudentChange: (v: boolean) => void;
};

/** Grup üyeleri — öğrenci modu ayrı; karışıklık yok */
export function BookingGroupMembersForm({
  mode,
  members,
  onChange,
  groupIsStudent,
  onGroupIsStudentChange,
}: Props) {
  const isStudentFlow = mode === 'student' || (mode === 'group' && groupIsStudent);
  const showForm = mode === 'group' || mode === 'student';

  const update = (idx: number, patch: Partial<OnlineBookingPartyGuest>) => {
    onChange(members.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const add = () => {
    if (members.length >= 12) return;
    onChange([
      ...members,
      {
        full_name: '',
        id_number: '',
        phone: '',
        university: '',
        is_student: isStudentFlow,
      },
    ]);
  };

  const remove = (idx: number) => {
    onChange(members.filter((_, i) => i !== idx));
  };

  if (!showForm) return null;

  return (
    <View style={styles.wrap}>
      {mode === 'student' ? (
        <>
          <Text style={styles.title}>Arkadaş öğrenci ekle</Text>
          <Text style={styles.hint}>
            İsteğe bağlı. Yanınızda başka öğrenci varsa ad, TC ve üniversite yeterli.
          </Text>
          <View style={styles.infoNote}>
            <Ionicons name="id-card-outline" size={18} color="#b45309" />
            <Text style={styles.infoNoteAmber}>
              Check-in’de resepsiyon öğrenci kartı ister. Kartı yanınızda getirin.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.title}>Grup rezervasyonu</Text>
          <Text style={styles.hint}>Grup üyelerini ekleyin. Telefon isteğe bağlıdır. Grup indirimi %3.</Text>

          <View style={styles.studentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.studentTitle}>Grup öğrencilerden mi oluşuyor?</Text>
              <Text style={styles.studentHint}>Evet derseniz öğrenci %10 indirimi uygulanır (grup %3 yerine)</Text>
            </View>
            <Switch
              value={groupIsStudent}
              onValueChange={(v) => {
                onGroupIsStudentChange(v);
                onChange(members.map((m) => ({ ...m, is_student: v, phone: v ? '' : m.phone })));
              }}
              trackColor={{ false: '#e5e7eb', true: '#99f6e4' }}
              thumbColor={groupIsStudent ? '#0f766e' : '#f9fafb'}
            />
          </View>

          {groupIsStudent ? (
            <View style={styles.infoNote}>
              <Ionicons name="id-card-outline" size={18} color="#b45309" />
              <Text style={styles.infoNoteAmber}>
                Her öğrenci için üniversite yazın. Resepsiyon check-in’de öğrenci kartı isteyecektir.
              </Text>
            </View>
          ) : null}
        </>
      )}

      {members.map((m, idx) => (
        <View key={`m-${idx}`} style={styles.memberCard}>
          <View style={styles.memberHead}>
            <Text style={styles.memberTitle}>
              {isStudentFlow ? `Öğrenci ${idx + 1}` : `Üye ${idx + 1}`}
            </Text>
            <TouchableOpacity onPress={() => remove(idx)} hitSlop={10}>
              <Ionicons name="trash-outline" size={18} color="#b42318" />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={m.full_name ?? ''}
            onChangeText={(v) => update(idx, { full_name: v })}
            placeholder="Ad soyad"
            placeholderTextColor="#98a2b3"
          />
          <TextInput
            style={styles.input}
            value={m.id_number ?? ''}
            onChangeText={(v) => update(idx, { id_number: v.replace(/\D/g, '').slice(0, 11) })}
            placeholder="TC kimlik no"
            keyboardType="number-pad"
            maxLength={11}
            placeholderTextColor="#98a2b3"
          />
          {isStudentFlow ? (
            <TextInput
              style={styles.input}
              value={m.university ?? ''}
              onChangeText={(v) => update(idx, { university: v })}
              placeholder="Üniversite"
              autoCapitalize="words"
              placeholderTextColor="#98a2b3"
            />
          ) : (
            <>
              <TextInput
                style={styles.input}
                value={m.phone ?? ''}
                onChangeText={(v) => update(idx, { phone: v })}
                placeholder="Telefon (isteğe bağlı)"
                keyboardType="phone-pad"
                placeholderTextColor="#98a2b3"
              />
              <View style={styles.studentRow}>
                <Text style={styles.studentTitle}>Bu üye öğrenci mi?</Text>
                <Switch
                  value={!!m.is_student}
                  onValueChange={(v) =>
                    update(idx, { is_student: v, university: v ? m.university ?? '' : '' })
                  }
                  trackColor={{ false: '#e5e7eb', true: '#99f6e4' }}
                  thumbColor={m.is_student ? '#0f766e' : '#f9fafb'}
                />
              </View>
              {m.is_student ? (
                <TextInput
                  style={styles.input}
                  value={m.university ?? ''}
                  onChangeText={(v) => update(idx, { university: v })}
                  placeholder="Üniversite"
                  autoCapitalize="words"
                  placeholderTextColor="#98a2b3"
                />
              ) : null}
            </>
          )}
        </View>
      ))}

      <TouchableOpacity style={styles.addBtn} onPress={add} activeOpacity={0.88}>
        <Ionicons name="person-add-outline" size={18} color="#0f766e" />
        <Text style={styles.addBtnText}>
          {isStudentFlow ? 'Öğrenci ekle' : 'Grup üyesi ekle'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: '#0b1220' },
  hint: { fontSize: 13, fontWeight: '500', color: '#64748b', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(11,18,32,0.08)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 15,
    fontWeight: '600',
    color: '#0b1220',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
  },
  infoNoteAmber: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#92400e',
    lineHeight: 18,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 4,
  },
  studentTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  studentHint: { fontSize: 11, fontWeight: '600', color: '#64748b', marginTop: 2 },
  memberCard: {
    borderWidth: 1,
    borderColor: 'rgba(11,18,32,0.08)',
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#f8faf9',
    gap: 2,
  },
  memberHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  memberTitle: { fontSize: 13, fontWeight: '800', color: '#0f766e' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,118,110,0.25)',
    backgroundColor: '#ecfdf5',
    borderRadius: 14,
    paddingVertical: 12,
  },
  addBtnText: { fontSize: 14, fontWeight: '800', color: '#0f766e' },
});
