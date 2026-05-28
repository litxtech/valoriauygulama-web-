import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { Ionicons } from '@expo/vector-icons';
import { canManageDiningVenues } from '@/lib/diningVenuesPermissions';
import { venueRowFromDb, priceLevelLabel, venueAvatarUrl, type DiningVenueRow } from '@/lib/diningVenues';
import { CachedImage } from '@/components/CachedImage';

export default function AdminDiningVenuesIndex() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const base = pathname?.startsWith('/staff') ? '/staff/dining-venues' : '/admin/dining-venues';
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const can = canManageDiningVenues(staff);

  const [rows, setRows] = useState<DiningVenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canQuery) {
      setRows([]);
      return;
    }
    let query = supabase
      .from('dining_venues')
      .select('*')
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (orgScoped) query = query.eq('organization_id', orgScoped);
    const { data, error } = await query;
    if (error) {
      setRows([]);
      return;
    }
    setRows((data ?? []).map((r) => venueRowFromDb(r as Record<string, unknown>)));
  }, [canQuery, orgScoped]);

  useEffect(() => {
    if (!can) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, can]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggle = async (v: DiningVenueRow) => {
    if (!can) return;
    setSavingId(v.id);
    const { error } = await supabase.from('dining_venues').update({ is_active: !v.is_active }).eq('id', v.id);
    setSavingId(null);
    if (error) Alert.alert(t('error'), error.message);
    else load();
  };

  const remove = (v: DiningVenueRow) => {
    if (!can) return;
    Alert.alert(t('diningVenuesDelete'), t('diningVenuesDeleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('dining_venues').delete().eq('id', v.id);
          if (error) Alert.alert(t('error'), error.message);
          else load();
        },
      },
    ]);
  };

  if (!can) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={adminTheme.colors.textMuted} />
        <Text style={styles.noAccess}>{t('diningVenuesNoAccess')}</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      </View>
      <View style={styles.toolbar}>
        <Text style={styles.h}>{t('diningVenuesAdminTitle')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push(`${base}/venue/new` as Href)}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnT}>{t('diningVenuesAdd')}</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        ListEmptyComponent={<Text style={styles.empty}>{t('diningVenuesNoRows')}</Text>}
        renderItem={({ item: v }) => {
          const av = venueAvatarUrl(v);
          return (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              {av ? (
                <View style={styles.venueAvatar}>
                  <CachedImage uri={av} style={styles.venueAvatarImg} contentFit="cover" />
                </View>
              ) : (
                <View style={styles.venueAvatar}>
                  <Ionicons name="restaurant-outline" size={22} color={adminTheme.colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={2}>
                  {v.name}
                </Text>
                <Text style={styles.meta}>
                  {t(`diningVenuesType_${v.venue_type}`)} · {priceLevelLabel(v.price_level)}
                </Text>
                {v.menu_items.length > 0 ? (
                  <View style={styles.menuPeek}>
                    <Text style={styles.menuPeekLabel}>{t('diningVenuesMenuPeek')}</Text>
                    <Text style={styles.menuPeekText} numberOfLines={2}>
                      {v.menu_items
                        .map((m) => m.name?.trim())
                        .filter(Boolean)
                        .slice(0, 5)
                        .join(' · ')}
                    </Text>
                  </View>
                ) : null}
                {v.lat != null && v.lng != null && Number.isFinite(v.lat) && Number.isFinite(v.lng) ? (
                  <View style={styles.mapBadge}>
                    <Ionicons name="map-outline" size={14} color={adminTheme.colors.primary} />
                    <Text style={styles.mapBadgeT}>{t('diningVenuesOnMap')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.row}>
                <Text style={styles.mutedSm}>{t('diningVenuesActive')}</Text>
                <Switch
                  value={v.is_active}
                  onValueChange={() => toggle(v)}
                  disabled={savingId === v.id}
                />
              </View>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity
                style={styles.acBtn}
                onPress={() => router.push(`${base}/venue/${v.id}` as Href)}
              >
                <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
                <Text style={styles.acBtnT}>{t('edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.acBtn} onPress={() => remove(v)}>
                <Ionicons name="trash-outline" size={20} color={adminTheme.colors.error} />
                <Text style={[styles.acBtnT, { color: adminTheme.colors.error }]}>{t('delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  orgPickerWrap: { paddingHorizontal: 16, paddingTop: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  noAccess: { marginTop: 12, color: adminTheme.colors.textMuted, textAlign: 'center' },
  toolbar: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 12 },
  h: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  addBtnT: { color: '#fff', fontWeight: '800' },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  venueAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  venueAvatarImg: { width: '100%', height: '100%' },
  name: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  meta: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  menuPeek: { marginTop: 8 },
  menuPeekLabel: { fontSize: 11, fontWeight: '800', color: adminTheme.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  menuPeekText: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  mapBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  mapBadgeT: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.primary },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mutedSm: { fontSize: 12, color: adminTheme.colors.textMuted },
  cardActions: { flexDirection: 'row', marginTop: 12, gap: 12 },
  acBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  acBtnT: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.primary },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
});
