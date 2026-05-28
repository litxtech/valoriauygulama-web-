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
  ScrollView,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { Ionicons } from '@expo/vector-icons';
import {
  canManageTransferServices,
  canManageTransferRequests,
} from '@/lib/transferTourPermissions';
import {
  type TransferServiceRow,
  type TransferRequestRow,
  serviceRowFromDb,
  pickLocalizedString,
  parseRoutes,
  type I18nJson,
} from '@/lib/transferTour';
import { notifyGuestTransferEvent } from '@/lib/transferTourNotify';

type Tab = 'services' | 'requests';

export default function AdminTransferTourHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const pathname = usePathname();
  const base = pathname?.startsWith('/staff') ? '/staff/transfer-tour' : '/admin/transfer-tour';
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const canSvc = canManageTransferServices(staff);
  const canReq = canManageTransferRequests(staff);
  const canAny = canSvc || canReq || staff?.role === 'admin';

  const requestStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t('transferTourStatusPending'),
      approved: t('transferTourStatusApproved'),
      rejected: t('transferTourStatusRejected'),
      price_offer: t('transferTourStatusPriceOffer'),
      completed: t('transferTourStatusCompleted'),
      cancelled: t('transferTourStatusCancelled'),
    };
    return map[status] ?? status;
  };

  const [tab, setTab] = useState<Tab>(canSvc || staff?.role === 'admin' ? 'services' : 'requests');
  const [services, setServices] = useState<TransferServiceRow[]>([]);
  const [requests, setRequests] = useState<TransferRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reqAct, setReqAct] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<TransferRequestRow | null>(null);
  const [offerVal, setOfferVal] = useState('');

  const load = useCallback(async () => {
    if (!canQuery) {
      setServices([]);
      setRequests([]);
      return;
    }
    if (canSvc || staff?.role === 'admin') {
      let servicesQuery = supabase
        .from('transfer_services')
        .select('*')
        .order('created_at', { ascending: false });
      if (orgScoped) servicesQuery = servicesQuery.eq('organization_id', orgScoped);
      const { data } = await servicesQuery;
      setServices((data ?? []).map((r) => serviceRowFromDb({ ...(r as object), routes: parseRoutes((r as { routes?: unknown }).routes) })));
    }
    if (canReq || staff?.role === 'admin') {
      let requestsQuery = supabase
        .from('transfer_service_requests')
        .select('*, transfer_services(title, cover_image, pricing_type, price, currency)')
        .order('created_at', { ascending: false });
      if (orgScoped) requestsQuery = requestsQuery.eq('organization_id', orgScoped);
      const { data } = await requestsQuery;
      setRequests((data ?? []) as unknown as TransferRequestRow[]);
    }
  }, [canQuery, orgScoped, canSvc, canReq, staff?.role]);

  useEffect(() => {
    if (!canAny) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, canAny]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleActive = async (s: TransferServiceRow) => {
    if (!canSvc && staff?.role !== 'admin') return;
    setSavingId(s.id);
    const { error } = await supabase.from('transfer_services').update({ is_active: !s.is_active }).eq('id', s.id);
    setSavingId(null);
    if (error) Alert.alert(t('error'), error.message);
    else load();
  };

  const deleteService = (s: TransferServiceRow) => {
    if (!canSvc && staff?.role !== 'admin') return;
    Alert.alert(t('transferTourDelete'), t('transferTourDeleteConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('transferTourDelete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('transfer_services').delete().eq('id', s.id);
          if (error) Alert.alert(t('error'), error.message);
          else load();
        },
      },
    ]);
  };

  const deleteRequest = (r: TransferRequestRow) => {
    if (!canReq && staff?.role !== 'admin') return;
    Alert.alert(t('transferTourDeleteRequest'), t('transferTourDeleteRequestConfirm'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('transferTourDeleteRequest'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('transfer_service_requests').delete().eq('id', r.id);
          if (error) Alert.alert(t('error'), error.message);
          else load();
        },
      },
    ]);
  };

  const setRequestStatus = async (r: TransferRequestRow, status: TransferRequestRow['status'], extra?: { price_offer?: number }) => {
    if (!canReq && staff?.role !== 'admin') return;
    setReqAct(r.id);
    const svcCur =
      (r as { transfer_services?: { currency?: string | null } }).transfer_services?.currency?.trim() || 'TRY';
    const { error } = await supabase
      .from('transfer_service_requests')
      .update({
        status,
        price_offer: extra?.price_offer ?? r.price_offer,
        handled_by_staff_id: staff?.id ?? null,
        offer_currency: extra?.price_offer != null ? svcCur : r.offer_currency ?? svcCur,
      })
      .eq('id', r.id);
    setReqAct(null);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    if (status === 'approved') {
      await notifyGuestTransferEvent({
        guestId: r.guest_id,
        title: t('transferTourNotifyApproved'),
        body: pickLocalizedString((r as { transfer_services?: { title?: I18nJson } }).transfer_services?.title as I18nJson, lang, ''),
      });
    }
    if (status === 'price_offer' && extra?.price_offer != null) {
      await notifyGuestTransferEvent({
        guestId: r.guest_id,
        title: t('transferTourNotifyPriceOffer'),
        body: `${extra.price_offer} ${r.offer_currency ?? 'TRY'}`,
      });
    }
    load();
  };

  if (!canAny) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={adminTheme.colors.textMuted} />
        <Text style={styles.noAccess}>{t('transferTourNoAccess')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.orgPickerWrap}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
      </View>
      <View style={styles.tabs}>
        {(canSvc || staff?.role === 'admin') && (
          <TouchableOpacity
            onPress={() => setTab('services')}
            style={[styles.tab, tab === 'services' && styles.tabOn]}
          >
            <Text style={[styles.tabT, tab === 'services' && styles.tabTOn]}>
              {t('transferTourTabServices')} ({services.length})
            </Text>
          </TouchableOpacity>
        )}
        {(canReq || staff?.role === 'admin') && (
          <TouchableOpacity onPress={() => setTab('requests')} style={[styles.tab, tab === 'requests' && styles.tabOn]}>
            <Text style={[styles.tabT, tab === 'requests' && styles.tabTOn]}>
              {t('transferTourTabRequests')} ({requests.length})
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {canSvc && tab === 'services' ? (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push({ pathname: `${base}/service/[id]`, params: { id: 'new' } } as Href)}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addBtnT}>{t('transferTourAddService')}</Text>
        </TouchableOpacity>
      ) : null}

      {tab === 'services' ? (
        <FlatList
          data={services}
          keyExtractor={(x) => x.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={loading ? null : <Text style={styles.empty}>{t('transferTourNoResults')}</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item: s }) => {
            const title = pickLocalizedString(s.title as I18nJson, lang, '—');
            return (
              <View style={styles.card}>
                <TouchableOpacity
                  onPress={() => router.push({ pathname: `${base}/service/[id]`, params: { id: s.id } } as Href)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {s.brand} {s.model} · {s.is_active ? t('transferTourActive') : '—'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.cardRow}>
                  {canSvc || staff?.role === 'admin' ? (
                    <>
                      <Text style={styles.mutedSmall}>{t('transferTourActive')}</Text>
                      <Switch
                        value={s.is_active}
                        onValueChange={() => toggleActive(s)}
                        disabled={savingId === s.id}
                      />
                    </>
                  ) : null}
                  {canSvc || staff?.role === 'admin' ? (
                    <TouchableOpacity onPress={() => deleteService(s)} style={{ marginLeft: 12 }} accessibilityLabel={t('transferTourDelete')}>
                      <Ionicons name="trash-outline" size={22} color={adminTheme.colors.error} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {requests.length === 0 && !loading ? <Text style={styles.empty}>{t('transferTourNoResults')}</Text> : null}
          {requests.map((r) => {
            const st = (r as { transfer_services?: { title?: I18nJson } }).transfer_services;
            const ttle = st?.title
              ? pickLocalizedString(st.title, lang, '—')
              : '—';
            return (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {ttle}
                </Text>
                <Text style={styles.cardMeta}>
                  {r.guest_name} · {r.request_date} {r.request_time} · {r.room_number ?? '—'}
                </Text>
                <View style={styles.reqHead}>
                  <Text style={styles.status}>{requestStatusLabel(r.status)}</Text>
                  {canReq || staff?.role === 'admin' ? (
                    <TouchableOpacity onPress={() => deleteRequest(r)} hitSlop={12} accessibilityLabel={t('transferTourDeleteRequest')}>
                      <Ionicons name="trash-outline" size={22} color={adminTheme.colors.error} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {canReq || staff?.role === 'admin' ? (
                  <View style={styles.actions}>
                    {r.status === 'pending' ? (
                      <>
                        <TouchableOpacity
                          style={styles.sbtn}
                          onPress={() => setRequestStatus(r, 'approved')}
                          disabled={reqAct === r.id}
                        >
                          <Text style={styles.sbtnT}>{t('transferTourApproving')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.sbtn, { backgroundColor: adminTheme.colors.error }]}
                          onPress={() => setRequestStatus(r, 'rejected')}
                        >
                          <Text style={styles.sbtnT}>{t('transferTourReject')}</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}
                    <TouchableOpacity
                      style={styles.sbtn}
                      onPress={() => {
                        setOfferFor(r);
                        setOfferVal(r.price_offer != null ? String(r.price_offer) : '');
                      }}
                    >
                      <Text style={styles.sbtnT}>{t('transferTourSetPrice')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.sbtn} onPress={() => setRequestStatus(r, 'completed')}>
                      <Text style={styles.sbtnT}>{t('transferTourMarkDone')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={!!offerFor} transparent animationType="fade" onRequestClose={() => setOfferFor(null)}>
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t('transferTourSetPrice')}</Text>
            <TextInput
              value={offerVal}
              onChangeText={setOfferVal}
              keyboardType="decimal-pad"
              style={styles.modalIn}
              placeholder={t('transferTourFieldOfferAmount')}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.mbtn} onPress={() => setOfferFor(null)}>
                <Text>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mbtn, styles.mbtnP]}
                onPress={() => {
                  if (!offerFor) return;
                  const n = parseFloat(offerVal.replace(',', '.'));
                  if (!Number.isFinite(n)) {
                    setOfferFor(null);
                    return;
                  }
                  setRequestStatus(offerFor, 'price_offer', { price_offer: n });
                  setOfferFor(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{t('ok')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  orgPickerWrap: { paddingHorizontal: 16, paddingTop: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  noAccess: { marginTop: 12, textAlign: 'center', color: adminTheme.colors.textSecondary },
  tabs: { flexDirection: 'row', padding: 12, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: adminTheme.colors.surface, alignItems: 'center' },
  tabOn: { backgroundColor: adminTheme.colors.primary + '22' },
  tabT: { fontWeight: '600', color: adminTheme.colors.textSecondary },
  tabTOn: { color: adminTheme.colors.primary, fontWeight: '800' },
  addBtn: {
    marginHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnT: { color: '#fff', fontWeight: '800' },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardMeta: { marginTop: 4, color: adminTheme.colors.textSecondary, fontSize: 13 },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'flex-end' },
  mutedSmall: { marginRight: 8, color: adminTheme.colors.textMuted, fontSize: 12 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 24 },
  reqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  status: { fontWeight: '600', color: adminTheme.colors.primary, flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  sbtn: { backgroundColor: adminTheme.colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  sbtnT: { color: '#fff', fontWeight: '700', fontSize: 12 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: adminTheme.colors.surface, borderRadius: 14, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 10 },
  modalIn: { borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 14 },
  modalBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  mbtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: adminTheme.colors.surfaceSecondary },
  mbtnP: { backgroundColor: adminTheme.colors.primary },
});
