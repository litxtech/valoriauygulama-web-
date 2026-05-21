import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useGuestScanSessionStore } from '@/stores/guestScanSessionStore';
import { playKbsScanSound } from '@/lib/kbsScanSounds';
import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

function guestLabelFromItem(item: {
  firstName: string | null;
  lastName: string | null;
  passportNo: string | null;
  identityNo: string | null;
  id: string;
}): string {
  const name = [item.firstName, item.lastName].filter(Boolean).join(' ').trim();
  return name || item.passportNo || item.identityNo || item.id.slice(0, 8);
}

export default function KbsGuestResultsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { ok, total } = useLocalSearchParams<{ ok?: string; total?: string }>();
  const reset = useGuestScanSessionStore((s) => s.reset);
  const session = useGuestScanSessionStore((s) => s.session);
  const lastSubmitResults = useGuestScanSessionStore((s) => s.lastSubmitResults);
  const okN = Number(ok ?? 0);
  const totalN = Number(total ?? 0);
  const failed = totalN - okN;
  const [soundOn, setSoundOn] = useState(true);

  const failedRows = useMemo(() => {
    if (!lastSubmitResults?.length || !session?.items.length) return [];
    const byId = new Map(session.items.map((it) => [it.id, it]));
    return lastSubmitResults
      .filter((r) => !r.ok)
      .map((r) => {
        const item = byId.get(r.itemId);
        return {
          id: r.itemId,
          label: item ? guestLabelFromItem(item) : r.itemId.slice(0, 8),
          message: r.errorMessage ?? t('error'),
        };
      });
  }, [lastSubmitResults, session?.items, t]);

  useEffect(() => {
    void AsyncStorage.getItem('kbs_mrz_scan_sound_enabled').then((v) => setSoundOn(v !== '0'));
    void playKbsScanSound(failed > 0 ? 'error' : 'submit_ok', soundOn);
  }, [failed, soundOn]);

  const close = () => {
    reset();
    router.replace('/staff/kbs/guests' as never);
  };

  const retryRoom = () => {
    router.replace('/staff/kbs/guests/room' as never);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>
        {failed === 0
          ? t('kbsGuestResultsAllOk', { total: totalN })
          : t('kbsGuestResultsPartial', { ok: okN, total: totalN, failed })}
      </Text>

      {failed > 0 && failedRows.length > 0 ? (
        <View style={styles.failBox}>
          <Text style={styles.failTitle}>{t('kbsGuestResultsFailedList')}</Text>
          {failedRows.map((row) => (
            <View key={row.id} style={styles.failRow}>
              <Text style={styles.failName}>{row.label}</Text>
              <Text style={styles.failMsg}>{row.message}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {failed > 0 ? (
        <TouchableOpacity style={styles.secondary} onPress={retryRoom}>
          <Text style={styles.secondaryText}>{t('kbsGuestResultsRetry')}</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity style={styles.btn} onPress={close}>
        <Text style={styles.btnText}>{t('close')}</Text>
      </TouchableOpacity>

      {failed > 0 ? (
        <TouchableOpacity style={styles.ghost} onPress={() => router.replace('/staff/kbs/failed' as never)}>
          <Text style={styles.ghostText}>{t('kbsNavFailed')}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 24, paddingBottom: 40 },
  h1: { fontSize: 20, fontWeight: '800', color: theme.colors.text, textAlign: 'center', lineHeight: 28 },
  failBox: {
    marginTop: 20,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  failTitle: { fontWeight: '800', color: '#b91c1c', fontSize: 14 },
  failRow: { gap: 4 },
  failName: { fontWeight: '800', color: theme.colors.text, fontSize: 14 },
  failMsg: { fontSize: 13, color: '#991b1b', lineHeight: 18 },
  btn: {
    marginTop: 28,
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '800' },
  secondary: {
    marginTop: 20,
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  secondaryText: { color: theme.colors.primary, fontWeight: '800' },
  ghost: { marginTop: 12, padding: 14, alignItems: 'center' },
  ghostText: { color: theme.colors.textSecondary, fontWeight: '700' },
});
