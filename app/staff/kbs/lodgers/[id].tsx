import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { fetchGuestStayById, updateGuestStay } from '@/lib/kbsStays/guestStaysDb';
import type { GuestStayRow } from '@/lib/kbsStays/types';
import { submitGuestCheckout, deleteGuestFromKbs } from '@/lib/kbsService';
import { useAuthStore } from '@/stores/authStore';
import { canKbsCheckout, canKbsDeleteAndResubmit } from '@/lib/kbsStaysPermissions';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/kbsApi';

export default function KbsLodgerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const [stay, setStay] = useState<GuestStayRow | null>(null);
  const [logs, setLogs] = useState<
    { action_type: string; status: string; submitted_at: string; error_message: string | null }[]
  >([]);
  const [busy, setBusy] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const load = async () => {
    if (!id) return;
    const row = await fetchGuestStayById(id);
    setStay(row);
    if (row) {
      setFirstName(row.first_name ?? '');
      setLastName(row.last_name ?? '');
    }
    const { data } = await supabase
      .schema('ops')
      .from('kbs_submission_logs')
      .select('action_type, status, submitted_at, error_message')
      .eq('guest_stay_id', id)
      .order('submitted_at', { ascending: false })
      .limit(20);
    setLogs((data ?? []) as typeof logs);
  };

  useEffect(() => {
    void load();
  }, [id]);

  if (!stay) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const name = [stay.first_name, stay.last_name].filter(Boolean).join(' ');
  const statusAllowsCheckout = stay.stay_status === 'checked_in' || stay.stay_status === 'checkout_failed';
  const showCheckout = statusAllowsCheckout && canKbsCheckout(staff);
  const showCorrect = canKbsDeleteAndResubmit(staff);

  const doCheckout = () => {
    Alert.alert(t('kbsLodgersCheckoutConfirmTitle'), t('kbsLodgersCheckoutConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ok'),
        onPress: async () => {
          setBusy(true);
          const res = await submitGuestCheckout({ stay, checkoutType: 'single' });
          setBusy(false);
          if (!res.ok) Alert.alert(t('error'), res.userMessage);
          else {
            Alert.alert(t('kbsLodgersCheckoutOk'));
            void load();
          }
        },
      },
    ]);
  };

  const doEditAndResubmit = () => {
    Alert.alert(
      'Düzenle ve yeniden bildir',
      'KBS’de güncelleme yok. Kayıt silinip düzeltilmiş bilgilerle yeniden bildirilecek.',
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('ok'),
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const fn = firstName.trim();
            const ln = lastName.trim();
            const full = [fn, ln].filter(Boolean).join(' ');

            await updateGuestStay(stay.id, {
              first_name: fn || '',
              last_name: ln || '',
            });

            if (stay.guest_document_id) {
              const { data: doc } = await supabase
                .schema('ops')
                .from('guest_documents')
                .select('guest_id, parsed_payload')
                .eq('id', stay.guest_document_id)
                .maybeSingle();
              if (doc?.guest_id) {
                await supabase
                  .schema('ops')
                  .from('guests')
                  .update({ first_name: fn || null, last_name: ln || null, full_name: full || null })
                  .eq('id', doc.guest_id);
                const prev = (doc.parsed_payload ?? {}) as Record<string, unknown>;
                await supabase
                  .schema('ops')
                  .from('guest_documents')
                  .update({
                    parsed_payload: {
                      ...prev,
                      firstName: fn || null,
                      lastName: ln || null,
                      fullName: full || null,
                    },
                    scan_status: 'ready_to_submit',
                  })
                  .eq('id', stay.guest_document_id);
              }
            }

            const del = await deleteGuestFromKbs(stay);
            if (!del.ok) {
              setBusy(false);
              Alert.alert(t('error'), del.userMessage);
              return;
            }

            if (stay.guest_document_id) {
              const submit = await apiPost<{ transactionId: string }>('/submissions/check-in', {
                guestDocumentId: stay.guest_document_id,
              });
              setBusy(false);
              if (!submit.ok) {
                Alert.alert(
                  'Silindi, bildirim başarısız',
                  `${submit.error.message}\nBildirime Hazır listesinden tekrar deneyin.`
                );
                void load();
                return;
              }
              Alert.alert('Yeniden bildirildi', 'Düzeltme KBS’ye gönderildi.');
              void load();
              return;
            }

            setBusy(false);
            Alert.alert(t('kbsLodgersDeleteResubmitTitle'), t('kbsLodgersDeleteOk'));
            void load();
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.h1}>{name || '—'}</Text>
      <Text style={styles.meta}>
        {t('kbsRoomLabel')} {stay.room_no} · {stay.nationality ?? '—'}
      </Text>
      <Text style={styles.meta}>
        {t('kbsLodgersCheckin')}: {formatIsoDateTr(stay.checkin_at.slice(0, 10))}
      </Text>
      <Text style={styles.meta}>KBS ref: {stay.kbs_reference_no ?? '—'}</Text>
      <Text style={styles.meta}>
        {t('kbsLodgersStatus')}: {stay.stay_status} / {stay.kbs_checkin_status}
      </Text>
      {stay.kbs_error_message ? <Text style={styles.err}>{stay.kbs_error_message}</Text> : null}
      {stay.kbs_checkout_error_message ? <Text style={styles.err}>{stay.kbs_checkout_error_message}</Text> : null}

      {showCheckout ? (
        <TouchableOpacity style={styles.primary} onPress={doCheckout} disabled={busy}>
          <Text style={styles.primaryText}>{t('kbsLodgersCheckoutBtn')}</Text>
        </TouchableOpacity>
      ) : null}

      {showCorrect ? (
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Manuel düzeltme</Text>
          <Text style={styles.editHint}>Alanları düzeltip yeniden bildirin (KBS’de update yoktur).</Text>
          <Text style={styles.fieldLabel}>Ad</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} editable={!busy} />
          <Text style={styles.fieldLabel}>Soyad</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} editable={!busy} />
          <TouchableOpacity style={styles.warn} onPress={doEditAndResubmit} disabled={busy}>
            <Text style={styles.warnText}>Düzenle ve yeniden bildir</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <Text style={styles.section}>{t('kbsLodgersLogs')}</Text>
      {logs.map((l, i) => (
        <View key={i} style={styles.logRow}>
          <Text style={styles.logType}>
            {l.action_type ?? '—'} · {l.status}
          </Text>
          <Text style={styles.logSub}>{l.submitted_at?.slice(0, 19)}</Text>
          {l.error_message ? <Text style={styles.errSmall}>{l.error_message}</Text> : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  meta: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  err: { color: '#b91c1c', marginTop: 8, fontWeight: '700' },
  errSmall: { color: '#b91c1c', fontSize: 11 },
  primary: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#fff', fontWeight: '800' },
  editCard: {
    marginTop: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    gap: 8,
  },
  editTitle: { fontWeight: '900', fontSize: 15, color: theme.colors.text },
  editHint: { fontSize: 12, color: theme.colors.textSecondary, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: '600',
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  warn: {
    marginTop: 6,
    backgroundColor: '#fef2f2',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  warnText: { color: '#b91c1c', fontWeight: '800' },
  section: { fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 8, color: theme.colors.text },
  logRow: {
    backgroundColor: theme.colors.surface,
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  logType: { fontWeight: '700', fontSize: 13 },
  logSub: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
});
