import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { adminTheme } from '@/constants/adminTheme';
import { CachedImage } from '@/components/CachedImage';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  counterpartyInitials,
  resolveCounterpartyTypeMeta,
  formatCounterpartyBalance,
} from '@/lib/financeCounterpartyUi';
import {
  fetchCounterpartyBalanceMap,
  invalidateCounterpartyBalanceCache,
} from '@/lib/financeCounterpartyBalances';
import {
  pickCounterpartyProfileImage,
  uploadCounterpartyProfileImage,
  clearCounterpartyProfileImage,
} from '@/lib/financeCounterpartyAvatar';
import { fmtMoneyTry } from '@/lib/financeLedger';
import { resolveCategoryLabel } from '@/lib/financeCategoriesApi';
import type { FinanceCounterpartyType, FinanceLedgerScope } from '@/lib/financeLedger';
import { LEDGER_SCOPE_LABELS } from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import { FinanceReportExportButtons } from '@/components/admin/FinanceReportExportButtons';
import {
  buildCounterpartyPersonReportHtml,
  fetchCounterpartyMovementsForReport,
  resolveFinanceReportFooter,
} from '@/lib/financeCounterpartyReport';
import { footerOptsFromOrganization } from '@/lib/financeReportBranding';
import { CounterpartyAgreementsSection } from '@/components/admin/CounterpartyAgreementsSection';
import { CounterpartyQuickPaySheet } from '@/components/admin/CounterpartyQuickPaySheet';
import { CounterpartyQuickCollectSheet } from '@/components/admin/CounterpartyQuickCollectSheet';
import {
  fetchCounterpartyAgreements,
  defaultAgreementMovementKind,
  agreementKindLabels,
  type CounterpartyAgreementRow,
} from '@/lib/financeCounterpartyAgreements';
import {
  loadFinanceMovementReceiptInput,
  mailFinanceMovementReceiptToPrinter,
  printFinanceMovementReceipt,
  shareFinanceMovementReceiptPdf,
  shareFinanceMovementReceiptWhatsApp,
} from '@/lib/financeMovementReceiptPdf';

type CpRow = {
  id: string;
  organization_id: string;
  name: string;
  party_type: FinanceCounterpartyType;
  party_type_label: string | null;
  phone: string | null;
  notes: string | null;
  profile_image: string | null;
  linked_staff_id: string | null;
};

type MovRow = {
  id: string;
  kind: string;
  amount: number;
  movement_date: string;
  category: string;
  description: string;
  ledger_scope: FinanceLedgerScope;
  agreement_id: string | null;
};

type ScopeFilter = 'all' | FinanceLedgerScope;

export default function CounterpartyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrg = useAdminOrgStore((s) =>
    s.organizations.find((o) => o.id === (s.selectedOrganizationId !== 'all' ? s.selectedOrganizationId : me?.organization_id))
  );
  const [cp, setCp] = useState<CpRow | null>(null);
  const [movements, setMovements] = useState<MovRow[]>([]);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuMovement, setMenuMovement] = useState<MovRow | null>(null);
  const [menuPerson, setMenuPerson] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [imageLightbox, setImageLightbox] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [agreements, setAgreements] = useState<CounterpartyAgreementRow[]>([]);
  const [receiptBusy, setReceiptBusy] = useState<'pdf' | 'print' | 'mail' | 'whatsapp' | null>(null);
  const [paySheetOpen, setPaySheetOpen] = useState(false);
  const [payAgreementId, setPayAgreementId] = useState<string | null>(null);
  const [collectSheetOpen, setCollectSheetOpen] = useState(false);
  const [collectAgreementId, setCollectAgreementId] = useState<string | null>(null);
  const [newDebtTick, setNewDebtTick] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [linkedStaffName, setLinkedStaffName] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error: e1 } = await supabase
      .from('finance_counterparties')
      .select(
        'id, organization_id, name, party_type, party_type_label, phone, notes, profile_image, linked_staff_id'
      )
      .eq('id', id)
      .single();

    if (e1 || !c) {
      setCp(null);
      setLoading(false);
      return;
    }
    const row = c as CpRow;
    setCp(row);
    if (row.linked_staff_id) {
      const { data: staffRow } = await supabase
        .from('staff')
        .select('full_name')
        .eq('id', row.linked_staff_id)
        .maybeSingle();
      setLinkedStaffName((staffRow as { full_name?: string | null } | null)?.full_name?.trim() ?? null);
    } else {
      setLinkedStaffName(null);
    }

    const scope = scopeFilter === 'all' ? null : scopeFilter;
    const [{ data: m }, balMap, agreementRows] = await Promise.all([
      supabase
        .from('finance_movements')
        .select('id, kind, amount, movement_date, category, description, ledger_scope, agreement_id')
        .eq('counterparty_id', id)
        .order('movement_date', { ascending: false })
        .limit(80),
      fetchCounterpartyBalanceMap(row.organization_id, scope),
      fetchCounterpartyAgreements(id),
    ]);

    let list = (m as MovRow[]) ?? [];
    if (scopeFilter !== 'all') list = list.filter((x) => x.ledger_scope === scopeFilter);
    setMovements(list);
    const b = balMap.get(id);
    setIncome(b?.income ?? 0);
    setExpense(b?.expense ?? 0);
    setAgreements(agreementRows);
    setLoading(false);
  }, [id, scopeFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  if (loading && !refreshing) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!cp) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Cari bulunamadı.</Text>
      </View>
    );
  }

  const meta = resolveCounterpartyTypeMeta(cp.party_type, cp.party_type_label);
  const debtLabels = agreementKindLabels(defaultAgreementMovementKind(cp.party_type));
  const net = income - expense;
  const balance = formatCounterpartyBalance(net);
  const defaultScope: FinanceLedgerScope =
    cp.party_type === 'private_person' ? 'personal' : 'hotel';
  const agreementTitleById = Object.fromEntries(agreements.map((a) => [a.id, a.title]));
  const reportBrandingOpts = footerOptsFromOrganization(selectedOrg);
  const reportFooter = resolveFinanceReportFooter(reportBrandingOpts);
  const documentBrandTitle = reportFooter.documentBrandTitle;

  const closeMenu = () => {
    setMenuVisible(false);
    setMenuMovement(null);
    setMenuPerson(false);
    setReceiptBusy(null);
  };

  const runMovementReceipt = async (action: 'pdf' | 'print' | 'mail' | 'whatsapp') => {
    if (!menuMovement || receiptBusy) return;
    setReceiptBusy(action);
    try {
      const data = await loadFinanceMovementReceiptInput(menuMovement.id, selectedOrg);
      if (action === 'pdf') await shareFinanceMovementReceiptPdf(data);
      else if (action === 'print') await printFinanceMovementReceipt(data);
      else if (action === 'mail') await mailFinanceMovementReceiptToPrinter(data);
      else await shareFinanceMovementReceiptWhatsApp(data);
      closeMenu();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'İşlem tamamlanamadı.');
    } finally {
      setReceiptBusy(null);
    }
  };

  const openPersonMenu = () => {
    setMenuPerson(true);
    setMenuMovement(null);
    setMenuVisible(true);
  };

  const openMovementMenu = (m: MovRow) => {
    setMenuMovement(m);
    setMenuPerson(false);
    setMenuVisible(true);
  };

  const removePersonFromList = () => {
    closeMenu();
    Alert.alert(
      'Kişiyi kaldır',
      'Liste dışı bırakılır; geçmiş ödemeler silinmez.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Kaldır',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('finance_counterparties')
              .update({ is_active: false })
              .eq('id', cp.id);
            if (error) Alert.alert('Hata', error.message);
            else router.replace('/admin/accounting/counterparties' as never);
          },
        },
      ]
    );
  };

  const deleteMovement = (movementId: string) => {
    closeMenu();
    Alert.alert('Sil', 'Bu kayıt silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('finance_movements').delete().eq('id', movementId);
          if (error) {
            Alert.alert('Hata', error.message);
            return;
          }
          invalidateCounterpartyBalanceCache(cp.organization_id);
          load();
        },
      },
    ]);
  };

  const pickAndUploadPhoto = async () => {
    const uri = await pickCounterpartyProfileImage();
    if (!uri) return;
    setUploadingPhoto(true);
    const res = await uploadCounterpartyProfileImage(cp.organization_id, cp.id, uri);
    setUploadingPhoto(false);
    if ('error' in res) {
      Alert.alert('Hata', res.error);
      return;
    }
    setCp((p) => (p ? { ...p, profile_image: res.publicUrl } : null));
  };

  const onAvatarPress = () => {
    if (cp.profile_image) {
      setImageLightbox(true);
      return;
    }
    void pickAndUploadPhoto();
  };

  const confirmDeletePhoto = () => {
    setImageLightbox(false);
    Alert.alert('Sil', 'Profil fotoğrafı kaldırılsın mı?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setUploadingPhoto(true);
          const err = await clearCounterpartyProfileImage(cp.id);
          setUploadingPhoto(false);
          if (err) Alert.alert('Hata', err);
          else setCp((p) => (p ? { ...p, profile_image: null } : null));
        },
      },
    ]);
  };

  const menuChangePhoto = () => {
    closeMenu();
    void pickAndUploadPhoto();
  };

  const openQuickPay = (agreement?: CounterpartyAgreementRow) => {
    setPayAgreementId(agreement?.id ?? null);
    setPaySheetOpen(true);
  };

  const openQuickCollect = (agreement?: CounterpartyAgreementRow) => {
    setCollectAgreementId(agreement?.id ?? null);
    setCollectSheetOpen(true);
  };

  const openIncome = () => {
    openQuickCollect();
  };

  const openDebtsTotal = agreements
    .filter((a) => a.status === 'open' || a.status === 'partial')
    .reduce((s, a) => s + a.amount_remaining, 0);

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroRow}>
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={onAvatarPress}
              onLongPress={menuChangePhoto}
              activeOpacity={0.88}
              disabled={uploadingPhoto}
            >
              {cp.profile_image ? (
                <CachedImage uri={cp.profile_image} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <View style={[styles.avatarPh, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.avatarLetter, { color: meta.color }]}>
                    {counterpartyInitials(cp.name)}
                  </Text>
                </View>
              )}
              <View style={styles.avatarBadge}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name={cp.profile_image ? 'expand-outline' : 'camera-outline'} size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.heroInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.heroName} numberOfLines={2}>
                  {cp.name}
                </Text>
                <TouchableOpacity style={styles.moreBtn} onPress={openPersonMenu} hitSlop={12}>
                  <Ionicons name="ellipsis-vertical" size={22} color={adminTheme.colors.textMuted} />
                </TouchableOpacity>
              </View>
              <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                <Ionicons name={meta.icon} size={13} color={meta.color} />
                <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {cp.phone ? (
                <Text style={styles.phone}>
                  <Ionicons name="call-outline" size={13} color={adminTheme.colors.textMuted} /> {cp.phone}
                </Text>
              ) : null}
              {linkedStaffName ? (
                <Text style={styles.linkedStaff}>
                  <Ionicons name="notifications-outline" size={13} color="#7c3aed" /> Bildirim: {linkedStaffName}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.balanceStrip}>
            {openDebtsTotal > 0 ? (
              <View style={styles.balanceMain}>
                <Text style={styles.balanceLbl}>Açık borç toplamı</Text>
                <Text style={styles.balanceValDebt}>{fmtMoneyTry(openDebtsTotal)}</Text>
              </View>
            ) : (
              <View style={styles.balanceMain}>
                <Text style={styles.balanceLbl}>Genel durum</Text>
                <Text
                  style={[
                    styles.balanceVal,
                    balance.tone === 'positive' && styles.in,
                    balance.tone === 'negative' && styles.out,
                  ]}
                >
                  {balance.tone === 'zero' ? 'Dengede' : balance.text}
                </Text>
              </View>
            )}
            <View style={styles.balanceSide}>
              <Text style={styles.balanceSideLbl}>Ödenen</Text>
              <Text style={[styles.balanceSideVal, styles.out]}>{fmtMoneyTry(expense)}</Text>
              <Text style={[styles.balanceSideLbl, { marginTop: 6 }]}>Alınan</Text>
              <Text style={[styles.balanceSideVal, styles.in]}>{fmtMoneyTry(income)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.hubTitle}>Ne yapmak istiyorsunuz?</Text>
        <View style={styles.hubRow}>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubDebt]}
            onPress={() => setNewDebtTick((t) => t + 1)}
            activeOpacity={0.88}
          >
            <Ionicons name="document-text-outline" size={22} color="#7c3aed" />
            <Text style={styles.hubCardTitle}>{debtLabels.debtOpen}</Text>
            <Text style={styles.hubCardSub}>
              {cp.party_type === 'customer' ? 'Günü birlik vb.' : 'Yeni iş / kayıt'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubPay]}
            onPress={() => openQuickPay()}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-up-circle" size={22} color="#dc2626" />
            <Text style={styles.hubCardTitle}>Ödeme yap</Text>
            <Text style={styles.hubCardSub}>Para ver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.hubCard, styles.hubIncome]}
            onPress={openIncome}
            activeOpacity={0.88}
          >
            <Ionicons name="arrow-down-circle" size={22} color="#16a34a" />
            <Text style={styles.hubCardTitle}>Tahsilat</Text>
            <Text style={styles.hubCardSub}>Para al</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.debtsSectionTitle}>Açık {debtLabels.debtNoun.toLowerCase()}lar</Text>
        <CounterpartyAgreementsSection
          counterpartyId={cp.id}
          organizationId={cp.organization_id}
          personName={cp.name}
          partyType={cp.party_type}
          partyTypeLabel={meta.label}
          phone={cp.phone}
          profileImageUrl={cp.profile_image}
          defaultLedgerScope={defaultScope}
          agreements={agreements}
          onRefresh={load}
          reportFooter={reportFooter}
          documentBrandTitle={documentBrandTitle}
          createdByStaffId={me?.id ?? null}
          createdByStaffName={me?.full_name ?? null}
          linkedStaffId={cp.linked_staff_id}
          linkedStaffName={linkedStaffName}
          openNewDebtRequest={newDebtTick}
          onPayDebt={(row) => openQuickPay(row)}
          onCollectDebt={(row) => openQuickCollect(row)}
          hideHeader
        />

        <TouchableOpacity style={styles.historyHead} onPress={() => setHistoryOpen((v) => !v)} activeOpacity={0.85}>
          <Text style={styles.historyTitle}>İşlem geçmişi ({movements.length})</Text>
          <Ionicons
            name={historyOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={adminTheme.colors.textMuted}
          />
        </TouchableOpacity>

        {historyOpen ? (
          movements.length === 0 ? (
            <Text style={styles.muted}>Henüz kayıt yok.</Text>
          ) : (
            movements.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={styles.movItem}
                onPress={() => openMovementMenu(m)}
                activeOpacity={0.85}
              >
                <View
                  style={[styles.movIcon, m.kind === 'income' ? styles.movIconIn : styles.movIconOut]}
                >
                  <Ionicons
                    name={m.kind === 'income' ? 'arrow-down' : 'arrow-up'}
                    size={16}
                    color={m.kind === 'income' ? '#16a34a' : '#dc2626'}
                  />
                </View>
                <View style={styles.movBody}>
                  <View style={styles.movTop}>
                    <Text style={styles.movKind}>{m.kind === 'income' ? 'Tahsilat' : 'Ödeme'}</Text>
                    <Text style={[styles.movAmt, m.kind === 'income' ? styles.in : styles.out]}>
                      {m.kind === 'income' ? '+' : '−'}
                      {fmtMoneyTry(Number(m.amount))}
                    </Text>
                  </View>
                  <Text style={styles.movMeta}>
                    {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)}
                  </Text>
                  {m.agreement_id && agreementTitleById[m.agreement_id] ? (
                    <Text style={styles.planTag} numberOfLines={1}>
                      Borç: {agreementTitleById[m.agreement_id]}
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="ellipsis-vertical" size={18} color={adminTheme.colors.textMuted} />
              </TouchableOpacity>
            ))
          )
        ) : null}

        {reportOpen ? null : (
          <TouchableOpacity style={styles.reportLink} onPress={() => setReportOpen(true)} activeOpacity={0.85}>
            <Ionicons name="document-text-outline" size={16} color={adminTheme.colors.primary} />
            <Text style={styles.reportLinkText}>Rapor / PDF</Text>
          </TouchableOpacity>
        )}
        {reportOpen ? (
          <View style={styles.reportSection}>
            <FinanceReportExportButtons
              compact
              disabled={!cp}
              fileName={`kisi-${cp.id.slice(0, 8)}`}
              mailSubject={`Kişi ödemeleri: ${cp.name}`}
              shareDialogTitle={`${cp.name} — ödeme raporu`}
              getHtml={async (kind) => {
                const allMovements = await fetchCounterpartyMovementsForReport(cp.id, scopeFilter);
                return buildCounterpartyPersonReportHtml(
                  {
                    personName: cp.name,
                    partyTypeLabel: meta.label,
                    phone: cp.phone,
                    notes: cp.notes,
                    profileImageUrl: cp.profile_image,
                    scopeLabel:
                      scopeFilter === 'all' ? 'Tüm kayıtlar (otel + şahsi)' : LEDGER_SCOPE_LABELS[scopeFilter],
                    income,
                    expense,
                    movements: allMovements,
                    footer: reportFooter,
                  },
                  kind
                );
              }}
            />
          </View>
        ) : null}
      </ScrollView>

      <CounterpartyQuickCollectSheet
        visible={collectSheetOpen}
        person={cp}
        defaultLedgerScope={defaultScope}
        staffId={me?.id}
        preselectedAgreementId={collectAgreementId}
        onClose={() => {
          setCollectSheetOpen(false);
          setCollectAgreementId(null);
        }}
        onSaved={load}
      />

      <CounterpartyQuickPaySheet
        visible={paySheetOpen}
        person={cp}
        defaultLedgerScope={defaultScope}
        staffId={me?.id}
        preselectedAgreementId={payAgreementId}
        onClose={() => {
          setPaySheetOpen(false);
          setPayAgreementId(null);
        }}
        onSaved={load}
      />

      <ImageLightboxModal
        visible={imageLightbox}
        uri={cp.profile_image}
        onClose={() => setImageLightbox(false)}
        onDelete={confirmDeletePhoto}
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.menuOverlay} onPress={closeMenu}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            {menuPerson ? (
              <>
                <Text style={styles.menuSheetTitle}>{cp.name}</Text>
                <TouchableOpacity style={styles.menuItem} onPress={menuChangePhoto}>
                  <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>
                    {cp.profile_image ? 'Fotoğrafı değiştir' : 'Profil fotoğrafı ekle'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/counterparties/edit',
                      params: { id: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>Kişiyi düzenle</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={removePersonFromList}>
                  <Ionicons name="person-remove-outline" size={20} color="#dc2626" />
                  <Text style={[styles.menuItemText, styles.menuItemDanger]}>Listedeki kaldır</Text>
                </TouchableOpacity>
              </>
            ) : menuMovement ? (
              <>
                <Text style={styles.menuSheetTitle}>
                  {menuMovement.kind === 'income' ? 'Tahsilat' : 'Ödeme'} ·{' '}
                  {fmtMoneyTry(Number(menuMovement.amount))}
                </Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const mid = menuMovement.id;
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/movements/[id]',
                      params: { id: mid, returnCounterpartyId: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.text} />
                  <Text style={styles.menuItemText}>Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => {
                    const mid = menuMovement.id;
                    closeMenu();
                    router.push({
                      pathname: '/admin/accounting/movements/edit',
                      params: { id: mid, returnCounterpartyId: cp.id },
                    } as never);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
                  <Text style={styles.menuItemText}>Düzenle</Text>
                </TouchableOpacity>
                <View style={styles.menuDivider} />
                <Text style={styles.menuSectionLabel}>Belge</Text>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('pdf')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'pdf' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('print')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'print' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="print-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>Yazdır</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('mail')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'mail' ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} />
                  ) : (
                    <Ionicons name="mail-outline" size={20} color={adminTheme.colors.primary} />
                  )}
                  <Text style={styles.menuItemText}>Yazıcı mail</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => runMovementReceipt('whatsapp')}
                  disabled={!!receiptBusy}
                >
                  {receiptBusy === 'whatsapp' ? (
                    <ActivityIndicator size="small" color="#25D366" />
                  ) : (
                    <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
                  )}
                  <Text style={styles.menuItemText}>WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuItem}
                  onPress={() => deleteMovement(menuMovement.id)}
                >
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  <Text style={[styles.menuItemText, styles.menuItemDanger]}>Sil</Text>
                </TouchableOpacity>
              </>
            ) : null}
            <TouchableOpacity style={styles.menuCancel} onPress={closeMenu}>
              <Text style={styles.menuCancelText}>İptal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { textAlign: 'center', color: adminTheme.colors.textMuted, marginTop: 8, fontSize: 14 },
  heroCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  avatarWrap: { position: 'relative' },
  avatarImg: { width: 76, height: 76, borderRadius: 38 },
  avatarPh: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { fontSize: 26, fontWeight: '800' },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7c3aed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: adminTheme.colors.surface,
  },
  heroInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start' },
  heroName: { flex: 1, fontSize: 19, fontWeight: '800', color: adminTheme.colors.text },
  moreBtn: { padding: 2, marginLeft: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  phone: { fontSize: 13, color: adminTheme.colors.textMuted, marginTop: 8 },
  linkedStaff: { fontSize: 12, color: '#7c3aed', marginTop: 6, fontWeight: '600' },
  balanceStrip: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
    gap: 12,
  },
  balanceMain: { flex: 1 },
  balanceLbl: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  balanceVal: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginTop: 4 },
  balanceValDebt: { fontSize: 22, fontWeight: '900', color: '#dc2626', marginTop: 4 },
  balanceSide: {
    alignItems: 'flex-end',
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: adminTheme.colors.border,
  },
  balanceSideLbl: { fontSize: 10, fontWeight: '600', color: adminTheme.colors.textMuted },
  balanceSideVal: { fontSize: 13, fontWeight: '800' },
  hubTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  hubRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  hubCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  hubDebt: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  hubPay: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  hubIncome: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  hubCardTitle: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.text, textAlign: 'center' },
  hubCardSub: { fontSize: 10, color: adminTheme.colors.textMuted, textAlign: 'center' },
  debtsSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  historyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 10,
    paddingVertical: 4,
  },
  historyTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 8,
  },
  reportLinkText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.primary },
  planTag: { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
  movItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  movIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movIconIn: { backgroundColor: '#dcfce7' },
  movIconOut: { backgroundColor: '#fee2e2' },
  movBody: { flex: 1, minWidth: 0 },
  movTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  movKind: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  movAmt: { fontSize: 15, fontWeight: '800' },
  movMeta: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  in: { color: '#16a34a' },
  out: { color: '#dc2626' },
  reportSection: { marginTop: 8, marginBottom: 12 },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  menuSheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: adminTheme.colors.border,
    marginHorizontal: 20,
  },
  menuSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  menuItemText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  menuItemDanger: { color: '#dc2626' },
  menuCancel: { paddingVertical: 16, alignItems: 'center' },
  menuCancelText: { fontSize: 16, color: adminTheme.colors.textMuted, fontWeight: '600' },
});
