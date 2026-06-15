import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import {
  createIncidentReport,
  listIncidentReportTypes,
  notifyIncidentReportRecipients,
  syncIncidentReportRecipients,
  type IncidentReportTypeRow,
} from '@/lib/incidentReports';
import { IncidentStaffPicker } from '@/components/incident/IncidentStaffPicker';

function makeReportNo() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `TUTANAK-${y}${m}${day}-${hh}${mm}`;
}

export default function AdminIncidentReportNewScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const isStaffRoute = pathname.startsWith('/staff');
  const basePath = isStaffRoute ? '/staff/incident-reports' : '/admin/incident-reports';
  const { staff } = useAuthStore();
  const [types, setTypes] = useState<IncidentReportTypeRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [reportNo, setReportNo] = useState(makeReportNo());
  const [typeId, setTypeId] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().slice(0, 16));
  const [locationLabel, setLocationLabel] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [relatedGuestName, setRelatedGuestName] = useState('');
  const [description, setDescription] = useState('');
  const [actionTaken, setActionTaken] = useState('');
  const [recipientStaffIds, setRecipientStaffIds] = useState<string[]>([]);
  const [notifyOnCreate, setNotifyOnCreate] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await listIncidentReportTypes();
      const rows = (data ?? []) as IncidentReportTypeRow[];
      setTypes(rows);
      if (rows[0]?.id) setTypeId(rows[0].id);
    })();
  }, []);

  const canSave = useMemo(
    () =>
      !!staff?.id &&
      !!staff.organization_id &&
      !!typeId &&
      locationLabel.trim().length > 0 &&
      description.trim().length > 0 &&
      reportNo.trim().length > 0,
    [staff?.id, staff?.organization_id, typeId, locationLabel, description, reportNo]
  );

  const submit = async () => {
    if (!staff?.id || !staff.organization_id) {
      Alert.alert('Hata', 'Personel/organizasyon bilgisi bulunamadı.');
      return;
    }
    if (!canSave) {
      Alert.alert('Eksik Bilgi', 'Tür, lokasyon ve açıklama zorunludur.');
      return;
    }
    setSaving(true);
    const occurred = new Date(occurredAt);
    const { data, error } = await createIncidentReport({
      organization_id: staff.organization_id,
      report_no: reportNo.trim(),
      report_type_id: typeId,
      occurred_at: Number.isNaN(occurred.getTime()) ? new Date().toISOString() : occurred.toISOString(),
      location_label: locationLabel.trim(),
      room_number: roomNumber.trim() || null,
      related_guest_name: relatedGuestName.trim() || null,
      description: description.trim(),
      action_taken: actionTaken.trim() || null,
      created_by_staff_id: staff.id,
      hotel_name: staff.organization?.name ?? 'Valoria Hotel',
    });
    if (error || !data?.id) {
      setSaving(false);
      Alert.alert('Kayıt Hatası', error?.message ?? 'Tutanak oluşturulamadı.');
      return;
    }

    if (recipientStaffIds.length > 0) {
      const syncRes = await syncIncidentReportRecipients({
        organizationId: staff.organization_id,
        reportId: data.id,
        staffIds: recipientStaffIds,
        createdByStaffId: staff.id,
      });
      if (syncRes.error) {
        setSaving(false);
        Alert.alert('Uyarı', syncRes.error.message ?? 'Personel ataması kaydedilemedi.');
        router.replace({ pathname: `${basePath}/[id]` as any, params: { id: data.id } });
        return;
      }
    }

    if (notifyOnCreate && recipientStaffIds.length > 0) {
      const notifyRes = await notifyIncidentReportRecipients({
        report: {
          id: data.id,
          report_no: reportNo.trim(),
          location_label: locationLabel.trim(),
          room_number: roomNumber.trim() || null,
          status: 'draft',
        },
        staffIds: recipientStaffIds,
        createdByStaffId: staff.id,
        isStaffRoute,
        message: 'Yeni tutanak oluşturuldu. Detayları inceleyin.',
      });
      setSaving(false);
      if (notifyRes.error) {
        Alert.alert(
          'Tutanak oluşturuldu',
          `Personel bildirimi gönderilemedi: ${notifyRes.error}`,
          [{ text: 'Detaya git', onPress: () => router.replace({ pathname: `${basePath}/[id]` as any, params: { id: data.id } }) }]
        );
        return;
      }
      Alert.alert('Başarılı', `Tutanak oluşturuldu. ${notifyRes.count} personele bildirim gönderildi.`);
    } else {
      setSaving(false);
      Alert.alert('Başarılı', 'Tutanak taslak olarak oluşturuldu.');
    }

    router.replace({ pathname: `${basePath}/[id]` as any, params: { id: data.id } });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.label}>Tutanak No</Text>
        <TextInput style={styles.input} value={reportNo} onChangeText={setReportNo} placeholder="TUTANAK-2026..." />

        <Text style={styles.label}>Tutanak Türü</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeWrap}>
          {types.map((t) => {
            const active = t.id === typeId;
            return (
              <TouchableOpacity key={t.id} style={[styles.typeChip, active && styles.typeChipActive]} onPress={() => setTypeId(t.id)}>
                <Text style={[styles.typeChipText, active && styles.typeChipTextActive]}>{t.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>Olay Tarih/Saat</Text>
        <TextInput
          style={styles.input}
          value={occurredAt}
          onChangeText={setOccurredAt}
          placeholder="2026-04-27T12:30"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Lokasyon</Text>
        <TextInput style={styles.input} value={locationLabel} onChangeText={setLocationLabel} placeholder="Oda 203 / Lobi / Restoran" />

        <Text style={styles.label}>Oda No (opsiyonel)</Text>
        <TextInput style={styles.input} value={roomNumber} onChangeText={setRoomNumber} placeholder="203" />

        <Text style={styles.label}>İlgili Misafir (opsiyonel)</Text>
        <TextInput style={styles.input} value={relatedGuestName} onChangeText={setRelatedGuestName} placeholder="Misafir adı" />

        <Text style={styles.label}>İlgili Personel</Text>
        <IncidentStaffPicker
          organizationId={staff?.organization_id ?? null}
          selectedStaffIds={recipientStaffIds}
          onChange={setRecipientStaffIds}
        />

        <TouchableOpacity
          style={styles.notifyToggle}
          onPress={() => setNotifyOnCreate((v) => !v)}
          activeOpacity={0.85}
          disabled={recipientStaffIds.length === 0}
        >
          <Ionicons
            name={notifyOnCreate && recipientStaffIds.length > 0 ? 'checkbox' : 'square-outline'}
            size={20}
            color={recipientStaffIds.length === 0 ? adminTheme.colors.textMuted : adminTheme.colors.primary}
          />
          <Text style={styles.notifyToggleText}>Oluşturulunca seçili personellere bildirim gönder</Text>
        </TouchableOpacity>

        <Text style={styles.label}>Olay Açıklaması</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Resmi ve net bir dille olay tespiti yazın."
          multiline
        />

        <Text style={styles.label}>Alınan Aksiyon (opsiyonel)</Text>
        <TextInput
          style={[styles.input, styles.textAreaSmall]}
          value={actionTaken}
          onChangeText={setActionTaken}
          placeholder="Uygulanan işlem"
          multiline
        />
      </View>

      <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && styles.disabled]} onPress={submit} disabled={!canSave || saving}>
        <Ionicons name="save-outline" size={18} color="#fff" />
        <Text style={styles.saveBtnText}>{saving ? 'Kaydediliyor...' : 'Tutanak Oluştur (Taslak)'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.listBtn} onPress={() => router.push(basePath as any)} activeOpacity={0.9}>
        <Ionicons name="list-outline" size={18} color={adminTheme.colors.text} />
        <Text style={styles.listBtnText}>Oluşturulan Tutanaklar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 12,
  },
  label: { marginTop: 10, marginBottom: 6, fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: adminTheme.colors.text,
  },
  textArea: { minHeight: 96, textAlignVertical: 'top' },
  textAreaSmall: { minHeight: 72, textAlignVertical: 'top' },
  typeWrap: { gap: 8, paddingVertical: 2 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
  },
  typeChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  typeChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.text },
  typeChipTextActive: { color: '#fff' },
  notifyToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  notifyToggleText: { flex: 1, fontSize: 12, fontWeight: '600', color: adminTheme.colors.text },
  saveBtn: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  listBtn: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  listBtnText: { color: adminTheme.colors.text, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
