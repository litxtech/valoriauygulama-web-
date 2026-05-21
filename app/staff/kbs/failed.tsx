import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { theme } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/kbsApi';
import { kbsQueryOptions } from '@/lib/kbsReactQuery';
import { useTranslation } from 'react-i18next';

export default function FailedTransactionsScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['kbs', 'failed_transactions'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/failed-transactions');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    ...kbsQueryOptions,
  });

  const onRetry = async (transactionId: string) => {
    const res = await apiPost<{ transactionId: string }>('/submissions/retry', { transactionId });
    if (!res.ok) {
      Alert.alert(t('kbsRetryTitle'), res.error.message);
      return;
    }
    Alert.alert(t('kbsRetryTitle'), t('kbsTxRetried', { tx: String(res.data.transactionId).slice(0, 8) }));
    q.refetch();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('kbsNavFailed')}</Text>
      <Text style={styles.p}>{t('kbsFailedIntro')}</Text>

      <FlatList
        data={q.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.mono}>Tx: {String(item.id).slice(0, 8)}</Text>
            <Text style={styles.meta}>Type: {item.transaction_type}</Text>
            <Text style={styles.meta}>Retry: {item.retry_count}</Text>
            <Text style={styles.meta}>Err: {item.error_message ?? '-'}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => onRetry(item.id)}>
              <Text style={styles.btnText}>{t('kbsRetryTitle')}</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{q.isPending ? t('loading') : q.isError ? '' : t('kbsNoErrors')}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 4 },
  mono: { fontFamily: 'monospace', color: theme.colors.text, fontWeight: '800' },
  meta: { color: theme.colors.textSecondary },
  btn: { marginTop: 8, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900' },
});

