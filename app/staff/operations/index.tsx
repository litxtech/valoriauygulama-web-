import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import {
  fetchMySmartOpsTasks,
  SMART_OPS_STATUS_LABELS,
  SMART_OPS_CRITICAL_LABELS,
  type SmartOpsTaskRow,
} from '@/lib/smartOps';
import { useCachedList } from '@/hooks/useCachedList';

function statusColor(status: string) {
  if (status.startsWith('overdue')) return theme.colors.error;
  if (status === 'pending') return '#dd6b20';
  return theme.colors.primary;
}

export default function StaffOperationsList() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const cacheKey =
    staff?.id && staff.organization_id
      ? `smart-ops:${staff.organization_id}:${staff.id}`
      : 'smart-ops:none';

  const fetchItems = useCallback(async () => {
    if (!staff?.id || !staff.organization_id) return [];
    try {
      return await fetchMySmartOpsTasks(staff.id, staff.organization_id, {
        role: staff.role,
        department: staff.department,
      });
    } catch {
      return [];
    }
  }, [staff?.id, staff?.organization_id, staff?.role, staff?.department]);

  const { items: list, loading, refreshing, refresh, showList } = useCachedList({
    cacheKey,
    enabled: !!staff?.id && !!staff.organization_id,
    fetchItems,
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Operasyon Görevleri</Text>
            <Text style={styles.subtitle}>Zamanlı checklist ve teyit görevleri</Text>
          </View>
        }
        ListEmptyComponent={
          !showList ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
          ) : (
            <Text style={styles.empty}>Bekleyen operasyon görevi yok.</Text>
          )
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(`/staff/smart-ops/${item.id}`)}
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(item.status) + '22' }]}>
                <Text style={[styles.badgeText, { color: statusColor(item.status) }]}>
                  {SMART_OPS_STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.cardBody} numberOfLines={2}>
              {item.body}
            </Text>
            <Text style={styles.cardMeta}>
              {SMART_OPS_CRITICAL_LABELS[item.critical_level] ?? item.critical_level} ·{' '}
              {new Date(item.scheduled_for).toLocaleString('tr-TR')}
            </Text>
            <View style={styles.cardAction}>
              <Text style={styles.cardActionText}>Teyit et</Text>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  list: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a365d' },
  subtitle: { fontSize: 14, color: '#718096', marginTop: 4 },
  empty: { textAlign: 'center', color: '#a0aec0', marginTop: 48, fontSize: 15 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#1a202c' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardBody: { fontSize: 14, color: '#4a5568', marginTop: 8 },
  cardMeta: { fontSize: 12, color: '#a0aec0', marginTop: 8 },
  cardAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, gap: 4 },
  cardActionText: { fontSize: 14, fontWeight: '700', color: theme.colors.primary },
});
