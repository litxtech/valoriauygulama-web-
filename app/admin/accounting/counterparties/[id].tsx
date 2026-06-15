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
  formatCounterpartyFlow,
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
import { fetchCounterpartyAgreements, type CounterpartyAgreementRow } from '@/lib/financeCounterpartyAgreements';
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

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: c, error: e1 } = await supabase
      .from('finance_counterparties')
      .select('id, organization_id, name, party_type, party_type_label, phone, notes, profile_image')
      .eq('id', id)
      .single();

    if (e1 || !c) {
      setCp(null);
      setLoading(false);
      return;
    }
    const row = c as CpRow;
    setCp(row);

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
              {cp.notes?.trim() ? (
                <Text style={styles.notes} numberOfLines={2}>
                  {cp.notes.trim()}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <CounterpartyAgreementsSection
          counterpartyId={cp.id}
          organizationId={cp.organization_id}
          personName={cp.name}
          partyTypeLabel={meta.label}
          phone={cp.phone}
          profileImageUrl={cp.profile_image}
          defaultLedgerScope={defaultScope}
          agreements={agreements}
          onRefresh={load}
          reportFooter={reportFooter}
          documentBrandTitle={documentBrandTitle}
          createdByStaffId={me?.id ?? null}
        />

        <Text style={styles.dividerLabel}>Genel cari özeti</Text>
        <Text style={styles.dividerHint}>Tüm tahsilat ve ödemeler (plan dışı dahil)</Text>

        <View style={styles.scopeRow}>
          {(['all', 'hotel', 'personal'] as ScopeFilter[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.scopeChip, scopeFilter === s && styles.scopeChipOn]}
              onPress={() => setScopeFilter(s)}
            >
              <Text style={[styles.scopeChipText, scopeFilter === s && styles.scopeChipTextOn]}>
                {s === 'all' ? 'Tümü' : LEDGER_SCOPE_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLbl}>Ödenen</Text>
            <Text style={[styles.statVal, styles.out]}>{fmtMoneyTry(expense)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLbl}>Alınan</Text>
            <Text style={[styles.statVal, styles.in]}>{fmtMoneyTry(income)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLbl}>Net</Text>
            <Text
              style={[
                styles.statVal,
                balance.tone === 'positive' && styles.in,
                balance.tone === 'negative' && styles.out,
              ]}
              numberOfLines={2}
            >
              {fmtMoneyTry(net)}
            </Text>
          </View>
        </View>
        <Text style={styles.flowHint}>{formatCounterpartyFlow(income, expense)}</Text>
        {balance.tone !== 'zero' ? (
          <Text
            style={[
              styles.balanceLine,
              balance.tone === 'positive' && styles.in,
              balance.tone === 'negative' && styles.out,
            ]}
          >
            {balance.text}
          </Text>
        ) : null}

        <View style={styles.reportSection}>
          <TouchableOpacity
            style={styles.reportToggle}
            onPress={() => setReportOpen((v) => !v)}
            activeOpacity={0.85}
          >
            <Ionicons name="document-text-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.reportToggleText}>Rapor / PDF / yazdır</Text>
            <Ionicons
              name={reportOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={adminTheme.colors.textMuted}
            />
          </TouchableOpacity>
          {reportOpen ? (
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
          ) : null}
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionIncome]}
            onPress={() =>
              router.push({
                pathname: '/admin/accounting/movements/new',
                params: {
                  kind: 'income',
                  counterpartyId: cp.id,
                  ledgerScope: scopeFilter === 'all' ? defaultScope : scopeFilter,
                },
              } as never)
            }
          >
            <Ionicons name="arrow-down-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Tahsilat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionExpense]}
            onPress={() =>
              router.push({
                pathname: '/admin/accounting/movements/new',
                params: {
                  kind: 'expense',
                  counterpartyId: cp.id,
                  ledgerScope: scopeFilter === 'all' ? defaultScope : scopeFilter,
                },
              } as never)
            }
          >
            <Ionicons name="arrow-up-circle" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>Ödeme</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Tüm işlem geçmişi</Text>
        {movements.length === 0 ? (
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
                  {formatDateShort(m.movement_date)} · {resolveCategoryLabel(m.category)} ·{' '}
                  {LEDGER_SCOPE_LABELS[m.ledger_scope] ?? LEDGER_SCOPE_LABELS.hotel}
                </Text>
                {m.agreement_id && agreementTitleById[m.agreement_id] ? (
                  <Text style={styles.planTag} numberOfLines={1}>
                    Plan: {agreementTitleById[m.agreement_id]}
                  </Text>
                ) : null}
                {m.description?.trim() ? (
                  <Text style={styles.movDesc} numberOfLines={1}>
                    {m.description.trim()}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="ellipsis-vertical" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

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
                {menuMovement.kind === 'expense' ? (
                  <>
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
                  </>
                ) : null}
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
  notes: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 4 },
  scopeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  scopeChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  scopeChipOn: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  scopeChipText: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  scopeChipTextOn: { color: '#fff' },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  statBox: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statLbl: { fontSize: 10, fontWeight: '700', color: adminTheme.colors.textMuted, textTransform: 'uppercase' },
  statVal: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  in: { color: '#16a34a' },
  out: { color: '#dc2626' },
  flowHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 4 },
  balanceLine: { fontSize: 13, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  reportSection: { marginBottom: 12 },
  reportToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  reportToggleText: { flex: 1, fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
  },
  actionIncome: { backgroundColor: '#16a34a' },
  actionExpense: { backgroundColor: '#dc2626' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  dividerLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginTop: 4,
    marginBottom: 2,
  },
  dividerHint: { fontSize: 11, color: adminTheme.colors.textMuted, marginBottom: 10 },
  planTag: { fontSize: 11, color: '#7c3aed', fontWeight: '600', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 8 },
  movItemWrap: { marginBottom: 8 },
  movReceiptActions: { paddingHorizontal: 4, marginBottom: 4 },
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
  movDesc: { fontSize: 12, color: adminTheme.colors.textSecondary, marginTop: 2 },
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
