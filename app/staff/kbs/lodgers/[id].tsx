import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { fetchGuestStayById } from '@/lib/kbsStays/guestStaysDb';
import type { GuestStayRow } from '@/lib/kbsStays/types';
import { submitGuestCheckout, deleteGuestFromKbs } from '@/lib/kbsService';
import { useAuthStore } from '@/stores/authStore';
import { canKbsDeleteAndResubmit } from '@/lib/kbsStaysPermissions';
import { formatIsoDateTr } from '@/lib/scanner/mrzDates';
import { supabase } from '@/lib/supabase';

export default function KbsLodgerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const [stay, setStay] = useState<GuestStayRow | null>(null);
  const [logs, setLogs] = useState<{ action_type: string; status: string; submitted_at: string; error_message: string | null }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const row = await fetchGuestStayById(id);
    setStay(row);
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
  const canCheckout = stay.stay_status === 'checked_in' || stay.stay_status === 'checkout_failed';

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

  const doDeleteResubmit = () => {
    Alert.alert(t('kbsLodgersDeleteResubmitTitle'), t('kbsLodgersDeleteResubmitBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('ok'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const res = await deleteGuestFromKbs(stay);
          setBusy(false);
          if (!res.ok) Alert.alert(t('error'), res.userMessage);
          else {
            Alert.alert(t('kbsLodgersDeleteResubmitTitle'), t('kbsLodgersDeleteOk'));
            void load();
          }
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.h1}>{name}</Text>
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

      {canCheckout ? (
        <TouchableOpacity style={styles.primary} onPress={doCheckout} disabled={busy}>
          <Text style={styles.primaryText}>{t('kbsLodgersCheckoutBtn')}</Text>
        </TouchableOpacity>
      ) : null}

      {canKbsDeleteAndResubmit(staff) ? (
        <TouchableOpacity style={styles.warn} onPress={doDeleteResubmit} disabled={busy}>
          <Text style={styles.warnText}>{t('kbsLodgersDeleteResubmitBtn')}</Text>
        </TouchableOpacity>
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
  warn: {
    marginTop: 10,
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
