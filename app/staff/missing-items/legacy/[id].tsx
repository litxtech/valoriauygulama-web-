import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import {
  getLegacyMissingItem,
  resolveLegacyMissingItem,
  type MissingItemPriority,
  type MissingItemRow,
} from '@/lib/missingItems';
import { getMissingAreaMeta } from '@/lib/missingItemsCatalog';

function formatDateTime(iso: string | null | undefined, locale: string): string {
  if (!iso) return '—';
  try {
    const loc = locale.startsWith('ar') ? 'ar-SA' : locale.startsWith('tr') ? 'tr-TR' : 'en-US';
    return new Date(iso).toLocaleString(loc, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function LegacyMissingItemDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Array.isArray(id) ? id[0] : id;
  const dateLocale = (i18n.language || 'tr').split('-')[0];

  const priorityLabel = useMemo(
    (): Record<MissingItemPriority, string> => ({
      low: t('missingItemsPriorityLow'),
      medium: t('missingItemsPriorityMedium'),
      high: t('missingItemsPriorityHigh'),
    }),
    [t, i18n.language]
  );

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<MissingItemRow | null>(null);

  const load = useCallback(async () => {
    if (!itemId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await getLegacyMissingItem(itemId);
    setItem(res.data);
    setLoading(false);
    if (res.error) Alert.alert(t('error'), res.error);
  }, [itemId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const meta = item ? getMissingAreaMeta(item.area) : null;

  const onResolve = () => {
    if (!item) return;
    Alert.alert(t('missingItemsResolveOneTitle'), t('missingItemsResolveOneBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('missingItemsResolvedBtn'),
        onPress: async () => {
          const result = await resolveLegacyMissingItem(item.id);
          if (result.error) Alert.alert(t('error'), result.error);
          else router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!item || !meta) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{t('missingItemsRecordNotFound')}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backLink}>{t('missingItemsGoBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { borderLeftColor: meta.color }]}>
          <Text style={styles.badge}>{t('missingItemsLegacyRecord')}</Text>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.sub}>
            {meta.title} · {priorityLabel[item.priority]}
          </Text>
          <Text style={styles.meta}>
            {t('missingItemsReporter', { name: item.creator?.full_name || '—' })}
          </Text>
          <Text style={styles.meta}>
            {t('missingItemsMetaNotification')}: {formatDateTime(item.created_at, dateLocale)}
          </Text>
          {item.status === 'resolved' ? (
            <Text style={styles.meta}>
              {t('missingItemsMetaResolvedBy')}: {item.resolver?.full_name || '—'} ·{' '}
              {formatDateTime(item.resolved_at, dateLocale)}
            </Text>
          ) : null}
        </View>
        {item.description?.trim() ? (
          <>
            <Text style={styles.sectionTitle}>{t('missingItemsDescription')}</Text>
            <Text style={styles.body}>{item.description}</Text>
          </>
        ) : null}
      </ScrollView>
      {item.status === 'open' ? (
        <View style={styles.footer}>
          <TouchableOpacity style={styles.resolveBtn} onPress={onResolve}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.resolveBtnText}>{t('missingItemsResolvedBtn')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: theme.colors.textMuted },
  backLink: { marginTop: 12, color: theme.colors.primary, fontWeight: '700' },
  content: { padding: theme.spacing.lg, paddingBottom: 100 },
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 4,
    padding: theme.spacing.md,
  },
  badge: { fontSize: 11, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '900', color: theme.colors.text },
  sub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  meta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 6 },
  sectionTitle: { marginTop: 20, marginBottom: 8, fontSize: 12, fontWeight: '800', color: theme.colors.textMuted },
  body: { fontSize: 15, lineHeight: 22, color: theme.colors.text },
  footer: { padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.surface },
  resolveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.success,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
  },
  resolveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
