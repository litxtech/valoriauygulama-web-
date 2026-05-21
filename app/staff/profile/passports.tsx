import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { loadMrzRecentDocuments } from '@/lib/loadMrzRecentDocuments';
import { useAuthStore } from '@/stores/authStore';
import { canStaffUseMrzScan } from '@/lib/kbsMrzAccess';
import {
  groupRowsByTenMinuteWindow,
  formatWindowRangeTr,
} from '@/lib/mrzPassportBatches';
import { formatDateShort } from '@/lib/date';

type GuestRow = { full_name: string | null; first_name: string | null; last_name: string | null } | null;

type DocRow = {
  id: string;
  created_at: string;
  document_type: string;
  document_number: string | null;
  nationality_code: string | null;
  expiry_date: string | null;
  raw_mrz: string | null;
  scan_status: string;
  guest_id: string;
  guest?: GuestRow;
};

const CARD_W = 168;

function guestNameFromRow(g: GuestRow): string {
  if (!g) return '—';
  if (g.full_name?.trim()) return g.full_name.trim();
  const n = [g.first_name, g.last_name].filter(Boolean).join(' ').trim();
  return n || '—';
}

export default function StaffPassportsMrzScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width: winW } = useWindowDimensions();
  const staff = useAuthStore((s) => s.staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<DocRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const allowed = canStaffUseMrzScan(staff);

  const load = useCallback(async (isRefresh: boolean) => {
    if (!allowed) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setErr(null);
    try {
      const res = await loadMrzRecentDocuments();
      if (!res.ok) {
        setErr(res.code === 'NO_APP_USER' ? t('staffPassportsNoAppUser') : res.message || t('unknownError'));
        setRows([]);
        return;
      }
      setRows(res.data);
    } catch (e) {
      const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
      const unreachable =
        m.includes('connection refused') ||
        m.includes('network request failed') ||
        m.includes('failed to connect');
      setErr(unreachable ? t('staffPassportsGatewayDown') : e instanceof Error ? e.message : t('unknownError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [allowed, t]);

  useEffect(() => {
    if (!allowed) {
      router.replace('/staff' as never);
    }
  }, [allowed, router]);

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load])
  );

  const grouped = useMemo(() => groupRowsByTenMinuteWindow(rows), [rows]);

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>{t('staffPassportsNoAccess')}</Text>
      </View>
    );
  }

  if (loading && !rows.length) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
        <Text style={styles.muted}>…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={theme.colors.primary} />}
    >
      <Text style={styles.title}>{t('staffPassportsTitle')}</Text>
      <Text style={styles.sub}>{t('staffPassportsSubtitle')}</Text>
      {err ? <Text style={styles.warn}>{err}</Text> : null}
      {rows.length === 0 && !err ? (
        <View style={styles.emptyCard}>
          <Ionicons name="document-text-outline" size={40} color={theme.colors.textMuted} />
          <Text style={styles.emptyText}>{t('staffPassportsEmpty')}</Text>
        </View>
      ) : null}

      {grouped.map(({ windowStart, items }) => {
        const { label } = formatWindowRangeTr(windowStart, i18n.language);
        return (
          <View key={String(windowStart)} style={styles.group}>
            <Text style={styles.groupTitle}>
              {t('staffPassportsWindowLabel', { range: label, count: items.length })}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.hRow}
              style={{ maxWidth: winW - 32 }}
            >
              {items.map((d) => (
                <View key={d.id} style={[styles.card, { minWidth: Math.min(CARD_W, winW * 0.45) }]}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {guestNameFromRow(d.guest ?? null)}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {t('staffPassportCardDoc')}: {d.document_number?.trim() || '—'}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {d.nationality_code || '—'} · {d.expiry_date ? formatDateShort(d.expiry_date) : '—'}
                  </Text>
                  <Text style={styles.cardTime}>
                    {new Date(d.created_at).toLocaleTimeString(i18n.language === 'tr' ? 'tr-TR' : 'en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        );
      })}

      <View style={styles.hintBox}>
        <Ionicons name="information-circle-outline" size={18} color={theme.colors.textSecondary} />
        <Text style={styles.hintText}>{t('staffPassportsKbsHint')}</Text>
        <Text style={styles.link} onPress={() => router.push('/staff/kbs/ready' as never)}>
          {t('kbsNavReady')}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  sub: { marginTop: 6, fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18, marginBottom: 12 },
  muted: { color: theme.colors.textSecondary, marginTop: 8 },
  warn: { color: '#b45309', fontWeight: '600', marginBottom: 8 },
  emptyCard: { alignItems: 'center', padding: 24, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, gap: 8 },
  emptyText: { textAlign: 'center', color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
  group: { marginBottom: 20 },
  groupTitle: { fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 10 },
  hRow: { gap: 10, paddingRight: 8 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 12,
  },
  cardName: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 6 },
  cardMeta: { fontSize: 12, color: theme.colors.textSecondary, fontWeight: '600' },
  cardTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8, fontFamily: 'monospace' },
  hintBox: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 },
  hintText: { flex: 1, fontSize: 12, color: theme.colors.textSecondary },
  link: { fontSize: 12, color: theme.colors.primary, fontWeight: '800' },
});
