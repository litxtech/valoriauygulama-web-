import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  Keyboard,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';
import {
  batchRescanPosReceiptInvoices,
  deletePosReceiptInvoice,
  listPosReceiptInvoices,
  markPosReceiptInvoiced,
  POS_STATUS_LABELS,
  rescanPosReceiptInvoice,
  updatePosReceiptStatus,
} from '@/lib/posReceiptInvoice/api';
import type {
  PosReceiptInvoiceRow,
  PosReceiptInvoiceStatus,
  PosVenueScope,
} from '@/lib/posReceiptInvoice/types';
import { POS_VENUE_LABELS } from '@/lib/posReceiptInvoice/types';
import { formatTry, computePosInvoiceTotals } from '@/lib/posReceiptInvoice/totals';
import { parseMoneyInput, amountMatches } from '@/lib/posReceiptInvoice/parseMoneyInput';
import {
  findDuplicateReceiptIds,
  posReceiptDuplicateKeyFromRow,
} from '@/lib/posReceiptInvoice/duplicateReceipt';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import { isImageContractUrl } from '@/lib/financeAgreementContract';

function rowPayable(r: PosReceiptInvoiceRow): number {
  if (r.receipt_total != null && r.receipt_total > 0) return r.receipt_total;
  if (r.payable_amount > 0) return r.payable_amount;
  if (r.line_items?.length) {
    return computePosInvoiceTotals(r.line_items, { receiptTotal: r.receipt_total }).payableAmount;
  }
  return 0;
}

function rowMatrah(r: PosReceiptInvoiceRow): number {
  if (r.invoice_cut_amount > 0) return r.invoice_cut_amount;
  if (r.line_items?.length) {
    return computePosInvoiceTotals(r.line_items, { receiptTotal: r.receipt_total }).invoiceCutAmount;
  }
  return 0;
}

type FilterTab = 'all' | 'pending' | 'invoiced';

type DetailFilters = {
  amountMin: string;
  amountMax: string;
  dateFrom: string;
  dateTo: string;
  merchant: string;
  bank: string;
  receiptNo: string;
  taxId: string;
};

const EMPTY_FILTERS: DetailFilters = {
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
  merchant: '',
  bank: '',
  receiptNo: '',
  taxId: '',
};

type Section = {
  title: string;
  hourKey: string;
  data: PosReceiptInvoiceRow[];
  sectionReceipt: number;
  sectionMatrah: number;
};

/** Çekim / kayıt saatine göre bölüm anahtarı */
function captureHourKeyFromRow(r: PosReceiptInvoiceRow): string {
  const iso = r.created_at || r.receipt_at;
  if (!iso) return '_none';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '_none';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}`;
}

function captureHourSectionLabel(hourKey: string): string {
  if (hourKey === '_none') return 'Çekim saati yok';
  const m = hourKey.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/);
  if (!m) return hourKey;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOnly = new Date(d);
  dayOnly.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dayOnly.getTime() - today.getTime()) / 86400000);
  const hh = m[4];
  const next = String((Number(hh) + 1) % 24).padStart(2, '0');
  const range = `${hh}:00–${next}:00`;
  if (diffDays === 0) return `Bugün · ${range}`;
  if (diffDays === -1) return `Dün · ${range}`;
  const pretty = d.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${pretty} · ${range}`;
}

function formatReceiptDateShort(date: string | null): string {
  if (!date) return '—';
  try {
    const d = new Date(`${date}T12:00:00`);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
}

function countActiveFilters(f: DetailFilters): number {
  return (Object.keys(EMPTY_FILTERS) as (keyof DetailFilters)[]).filter((k) => f[k].trim()).length;
}

export default function PosReceiptInvoicesList() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venue?: string }>();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const orgId = canUseAll ? selectedOrganizationId : me?.organization_id ?? null;

  const initialVenue: PosVenueScope = params.venue === 'restaurant' ? 'restaurant' : 'hotel';
  const [rows, setRows] = useState<PosReceiptInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [venue, setVenue] = useState<PosVenueScope>(initialVenue);
  /** Mutfak/otel: seçim taslağı — Uygula ile yüklenir (otomatik değişmez) */
  const [venueDraft, setVenueDraft] = useState<PosVenueScope>(initialVenue);
  const [tab, setTab] = useState<FilterTab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [rescanProgress, setRescanProgress] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<DetailFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState<DetailFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);

  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || orgId === 'all') {
      setRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setError(null);
    const res = await listPosReceiptInvoices(orgId, { venueScope: venue });
    if (res.error) {
      setError(res.error);
      setRows([]);
    } else {
      setRows(res.rows);
    }
    setLoading(false);
  }, [orgId, venue]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  /** Deep link / muhasebe hub’dan gelen hesap (yalnızca param varsa) */
  useFocusEffect(
    useCallback(() => {
      if (params.venue !== 'hotel' && params.venue !== 'restaurant') return;
      const next = params.venue;
      if (next !== venue) {
        setVenue(next);
        setVenueDraft(next);
        setLoading(true);
      }
    }, [params.venue, venue])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const activeFilterCount = countActiveFilters(filters);

  const filtered = useMemo(() => {
    let list = rows;

    if (tab === 'pending') list = list.filter((r) => r.status === 'draft' || r.status === 'ready');
    else if (tab === 'invoiced') list = list.filter((r) => r.status === 'invoiced');

    const f = filters;
    const amountMin = parseMoneyInput(f.amountMin);
    const amountMax = parseMoneyInput(f.amountMax);
    const merchantQ = f.merchant.trim().toLowerCase();
    const bankQ = f.bank.trim().toLowerCase();
    const noQ = f.receiptNo.trim().toLowerCase();
    const taxQ = f.taxId.trim().replace(/\s/g, '');
    const dateFrom = f.dateFrom.trim();
    const dateTo = f.dateTo.trim();

    if (
      amountMin != null ||
      amountMax != null ||
      merchantQ ||
      bankQ ||
      noQ ||
      taxQ ||
      dateFrom ||
      dateTo
    ) {
      list = list.filter((r) => {
        const amounts = [r.receipt_total, r.payable_amount, r.invoice_cut_amount, rowPayable(r), rowMatrah(r)].filter(
          (n): n is number => n != null && Number.isFinite(n)
        );

        if (amountMin != null && !amounts.some((a) => a + 0.005 >= amountMin)) return false;
        if (amountMax != null && !amounts.some((a) => a - 0.005 <= amountMax)) return false;

        if (dateFrom && (r.receipt_date || '') < dateFrom) return false;
        if (dateTo && (r.receipt_date || '') > dateTo) return false;

        if (merchantQ) {
          const hay = `${r.merchant_name || ''} ${r.buyer_name || ''}`.toLowerCase();
          if (!hay.includes(merchantQ)) return false;
        }
        if (bankQ && !(r.payment_bank || '').toLowerCase().includes(bankQ)) return false;
        if (noQ && !(r.receipt_no || '').toLowerCase().includes(noQ)) return false;
        if (taxQ && !(r.merchant_tax_id || '').replace(/\s/g, '').includes(taxQ)) return false;

        return true;
      });
    }

    const q = query.trim();
    if (!q) return list;

    const qLower = q.toLowerCase();
    const qMoney = parseMoneyInput(q);
    const qDigits = q.replace(/\D/g, '');

    return list.filter((r) => {
      if (qMoney != null) {
        if (
          amountMatches(r.receipt_total, qMoney) ||
          amountMatches(r.payable_amount, qMoney) ||
          amountMatches(r.invoice_cut_amount, qMoney) ||
          amountMatches(rowMatrah(r), qMoney) ||
          amountMatches(rowPayable(r), qMoney)
        ) {
          return true;
        }
      }

      const hay = [
        r.merchant_name,
        r.buyer_name,
        r.receipt_no,
        r.payment_bank,
        r.payment_method,
        r.merchant_tax_id,
        r.paid_by,
        r.card_last4,
        r.description_note,
        formatReceiptDateShort(r.receipt_date),
        POS_STATUS_LABELS[r.status],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (hay.includes(qLower)) return true;

      if (qDigits.length >= 3) {
        const digitHay = [r.receipt_no, r.merchant_tax_id, r.card_last4, String(r.receipt_total ?? '')]
          .join('')
          .replace(/\D/g, '');
        if (digitHay.includes(qDigits)) return true;
      }

      return false;
    });
  }, [rows, tab, query, filters]);

  const sections = useMemo((): Section[] => {
    const map = new Map<string, PosReceiptInvoiceRow[]>();
    for (const r of filtered) {
      const key = captureHourKeyFromRow(r);
      const list = map.get(key) ?? [];
      list.push(r);
      map.set(key, list);
    }
    /** Yeni çekim saati üstte */
    const keys = [...map.keys()].sort((a, b) => {
      if (a === '_none') return 1;
      if (b === '_none') return -1;
      return b.localeCompare(a);
    });
    return keys.map((hourKey) => {
      const data = (map.get(hourKey) ?? []).sort((a, b) => {
        const ca = a.created_at || a.receipt_at || '';
        const cb = b.created_at || b.receipt_at || '';
        if (ca !== cb) return cb.localeCompare(ca);
        const ma = (a.merchant_name || '').localeCompare(b.merchant_name || '', 'tr');
        if (ma !== 0) return ma;
        return (a.receipt_no || '').localeCompare(b.receipt_no || '', 'tr');
      });
      let sectionReceipt = 0;
      let sectionMatrah = 0;
      for (const r of data) {
        sectionReceipt += rowPayable(r);
        sectionMatrah += rowMatrah(r);
      }
      return {
        hourKey,
        title: captureHourSectionLabel(hourKey),
        data,
        sectionReceipt: Math.round((sectionReceipt + Number.EPSILON) * 100) / 100,
        sectionMatrah: Math.round((sectionMatrah + Number.EPSILON) * 100) / 100,
      };
    });
  }, [filtered]);

  const counts = useMemo(
    () => ({
      pending: rows.filter((r) => r.status === 'draft' || r.status === 'ready').length,
      invoiced: rows.filter((r) => r.status === 'invoiced').length,
      all: rows.length,
    }),
    [rows]
  );

  const sums = useMemo(() => {
    let receipt = 0;
    let matrah = 0;
    for (const r of filtered) {
      receipt += rowPayable(r);
      matrah += rowMatrah(r);
    }
    return {
      receipt: Math.round((receipt + Number.EPSILON) * 100) / 100,
      matrah: Math.round((matrah + Number.EPSILON) * 100) / 100,
      count: filtered.length,
    };
  }, [filtered]);

  /** Aynı fiş no/tarih/tutar — kopyalar (en eski tutulur) */
  const duplicateIds = useMemo(
    () => findDuplicateReceiptIds(rows, posReceiptDuplicateKeyFromRow).duplicateIds,
    [rows]
  );

  const deleteDuplicate = (item: PosReceiptInvoiceRow) => {
    Alert.alert(
      'Aynı fiş',
      `${item.merchant_name || 'Bu fiş'} zaten yüklenmiş görünüyor (no/tarih/tutar). Kopya silinsin mi?`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(item.id);
              const res = await deletePosReceiptInvoice(item.id);
              setBusyId(null);
              if (res.error) Alert.alert('Hata', res.error);
              else await load();
            })();
          },
        },
      ]
    );
  };

  const markInvoiced = (item: PosReceiptInvoiceRow) => {
    Alert.alert(
      'Fatura kesildi',
      `${item.merchant_name || 'Bu fiş'} için fatura kesildi olarak işaretlensin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Evet, kesildi',
          onPress: () => {
            void (async () => {
              setBusyId(item.id);
              const res = await markPosReceiptInvoiced(item.id);
              setBusyId(null);
              if (res.error) Alert.alert('Hata', res.error);
              else await load();
            })();
          },
        },
      ]
    );
  };

  const reopen = (item: PosReceiptInvoiceRow) => {
    void (async () => {
      setBusyId(item.id);
      const res = await updatePosReceiptStatus(item.id, 'ready');
      setBusyId(null);
      if (res.error) Alert.alert('Hata', res.error);
      else await load();
    })();
  };

  const rereadOneDate = (item: PosReceiptInvoiceRow) => {
    if (!(item.receipt_urls?.length > 0)) {
      Alert.alert('Görsel yok', 'Bu fişte yeniden okunacak görsel yok.');
      return;
    }
    void (async () => {
      setBusyId(item.id);
      const res = await rescanPosReceiptInvoice(item.id, { preferFullOcr: true });
      setBusyId(null);
      if (res.error) {
        Alert.alert('Hata', res.error);
        return;
      }
      await load();
      Alert.alert(
        'Tarih okundu',
        res.previousDate !== res.nextDate
          ? `${res.previousDate || '—'} → ${res.nextDate || '—'}`
          : `Tarih: ${res.nextDate || 'okunamadı'}`
      );
    })();
  };

  /** Bekleyen fişleri son OCR ile yeniden oku — yanlış tarihler düzelir */
  const rescanPendingDates = () => {
    const targets = rows.filter(
      (r) =>
        (r.status === 'draft' || r.status === 'ready') &&
        (r.receipt_urls?.length ?? 0) > 0
    );
    if (!targets.length) {
      Alert.alert('Yok', 'Yeniden okunacak bekleyen fiş (görselli) bulunamadı.');
      return;
    }
    Alert.alert(
      'Tarihleri yeniden oku',
      `${targets.length} bekleyen fiş son OCR ile yeniden okunacak. Devam?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Yeniden oku',
          onPress: () => {
            void (async () => {
              setRescanning(true);
              setRescanProgress(`0 / ${targets.length}`);
              const result = await batchRescanPosReceiptInvoices(
                targets.map((r) => r.id),
                (done, total) => setRescanProgress(`${done} / ${total}`)
              );
              setRescanning(false);
              setRescanProgress(null);
              await load();
              Alert.alert(
                'Tamam',
                `${result.updated} güncellendi · ${result.dateFixed} tarihte değişiklik · ${result.failed} hata`
              );
            })();
          },
        },
      ]
    );
  };

  /** Tek dokunuş: kamera aç → oku → onay sayfası */
  const openQuickCamera = () => {
    router.push({
      pathname: '/admin/accounting/pos-receipts/batch',
      params: { venue, autostart: 'camera' },
    });
  };

  const openAddMenu = () => {
    Alert.alert('Fiş ekle', 'Nasıl eklemek istersiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Kamera',
        onPress: openQuickCamera,
      },
      {
        text: 'Galeri / çoklu',
        onPress: () =>
          router.push({
            pathname: '/admin/accounting/pos-receipts/batch',
            params: { venue, autostart: 'gallery' },
          }),
      },
      {
        text: 'Tek fiş (detaylı)',
        onPress: () =>
          router.push({
            pathname: '/admin/accounting/pos-receipts/new',
            params: { venue },
          }),
      },
    ]);
  };

  const openAdd = openAddMenu;

  const openFilters = () => {
    setDraftFilters(filters);
    setFilterOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
    Keyboard.dismiss();
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterOpen(false);
  };

  const hasSearch = query.trim().length > 0 || activeFilterCount > 0;

  const listHeader = (
    <View style={styles.headerBlock}>
      <View style={styles.hero}>
        <View style={styles.heroGlow} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>Muhasebe · ayrı hesap</Text>
            <Text style={styles.heroTitle}>{POS_VENUE_LABELS[venue]} POS fişleri</Text>
            <Text style={styles.heroSub}>
              {venue === 'hotel' ? 'Otel' : 'Mutfak'} defteri · otel/mutfak toplamları karışmaz
            </Text>
          </View>
          <TouchableOpacity
            style={styles.batchChip}
            onPress={openQuickCamera}
            onLongPress={openAddMenu}
          >
            <Ionicons name="camera" size={16} color="#042f2e" />
            <Text style={styles.batchChipText}>Çek</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.rescanChip, rescanning && { opacity: 0.6 }]}
          onPress={rescanPendingDates}
          disabled={rescanning || loading}
        >
          {rescanning ? (
            <ActivityIndicator size="small" color="#99f6e4" />
          ) : (
            <Ionicons name="refresh-outline" size={15} color="#99f6e4" />
          )}
          <Text style={styles.rescanChipText}>
            {rescanning
              ? `Yeniden okunuyor ${rescanProgress ?? ''}…`
              : 'Tarihleri yeniden oku (OCR)'}
          </Text>
        </TouchableOpacity>

        <View style={styles.venueTabs}>
          {(['hotel', 'restaurant'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setVenueDraft(v)}
              style={[styles.venueTab, venueDraft === v && styles.venueTabOn]}
            >
              <Ionicons
                name={v === 'hotel' ? 'business-outline' : 'restaurant-outline'}
                size={15}
                color={venueDraft === v ? '#042f2e' : '#99f6e4'}
              />
              <Text style={[styles.venueTabText, venueDraft === v && styles.venueTabTextOn]}>
                {POS_VENUE_LABELS[v]}
              </Text>
            </Pressable>
          ))}
          {venueDraft !== venue ? (
            <TouchableOpacity
              style={styles.venueApplyBtn}
              onPress={() => {
                setLoading(true);
                setVenue(venueDraft);
                router.setParams({ venue: venueDraft });
              }}
            >
              <Text style={styles.venueApplyText}>Hesabı aç</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.venueActiveLabel}>Aktif hesap</Text>
          )}
        </View>

        <View style={styles.statRow}>
          <StatPill
            label="Bekleyen"
            value={String(counts.pending)}
            color="#fbbf24"
            icon="time-outline"
          />
          <StatPill
            label="Kesildi"
            value={String(counts.invoiced)}
            color="#86efac"
            icon="checkmark-circle-outline"
          />
          <StatPill
            label={hasSearch ? 'Sonuç' : 'Fiş'}
            value={String(sums.count)}
            color="#99f6e4"
            icon="receipt-outline"
          />
        </View>

        <View style={styles.sumBar}>
          <View style={styles.sumItem}>
            <Text style={styles.sumLbl}>Görünen toplam</Text>
            <Text style={styles.sumVal}>{formatTry(sums.receipt)} ₺</Text>
          </View>
          <View style={styles.sumDivider} />
          <View style={styles.sumItem}>
            <Text style={styles.sumLbl}>Matrah</Text>
            <Text style={[styles.sumVal, styles.sumAccent]}>{formatTry(sums.matrah)} ₺</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color="#0f766e" />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Tutar, işyeri, fiş no, banka…"
            placeholderTextColor="#94a3b8"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnOn]}
          onPress={openFilters}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={activeFilterCount > 0 ? '#042f2e' : '#0f766e'}
          />
          {activeFilterCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {hasSearch ? (
        <View style={styles.resultHint}>
          <Ionicons name="flash-outline" size={14} color="#0f766e" />
          <Text style={styles.resultHintText}>
            {filtered.length} fiş bulundu
            {query.trim() ? ` · “${query.trim()}”` : ''}
            {activeFilterCount > 0 ? ` · ${activeFilterCount} filtre` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setQuery('');
              setFilters(EMPTY_FILTERS);
            }}
          >
            <Text style={styles.clearLink}>Temizle</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.tabs}>
        {(
          [
            { id: 'pending', label: 'Bekleyen', n: counts.pending },
            { id: 'invoiced', label: 'Kesildi', n: counts.invoiced },
            { id: 'all', label: 'Tümü', n: counts.all },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
            <View style={[styles.tabCount, tab === t.id && styles.tabCountOn]}>
              <Text style={[styles.tabCountText, tab === t.id && styles.tabCountTextOn]}>{t.n}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />

      {!orgId || orgId === 'all' ? (
        <View style={styles.pad}>
          {listHeader}
          <Text style={styles.empty}>Listelemek için organizasyon seçin.</Text>
        </View>
      ) : loading ? (
        <View style={styles.pad}>
          {listHeader}
          <ActivityIndicator style={{ marginTop: 40 }} color={adminTheme.colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.pad}>
          {listHeader}
          <View style={styles.errBox}>
            <Text style={styles.errText}>{error}</Text>
            <Text style={styles.errSub}>Migration: 564–567 (pos_receipt_*)</Text>
          </View>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(r) => r.id}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
          contentContainerStyle={sections.length === 0 ? styles.emptyPad : styles.listPad}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name={hasSearch ? 'search-outline' : 'receipt-outline'} size={28} color="#0f766e" />
              </View>
              <Text style={styles.empty}>
                {hasSearch
                  ? 'Aramanıza uyan fiş yok.'
                  : tab === 'invoiced'
                    ? `${POS_VENUE_LABELS[venue]} için kesilmiş fiş yok.`
                    : `${POS_VENUE_LABELS[venue]} için henüz fiş yok.`}
              </Text>
              {hasSearch ? (
                <TouchableOpacity
                  style={styles.emptyBtnOutline}
                  onPress={() => {
                    setQuery('');
                    setFilters(EMPTY_FILTERS);
                  }}
                >
                  <Text style={styles.emptyBtnOutlineText}>Aramayı temizle</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.emptyBtn} onPress={openAdd}>
                  <Text style={styles.emptyBtnText}>Çoklu fiş yükle</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHead}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionDot} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
              </View>
              <Text style={styles.sectionSum}>
                {section.data.length} fiş · {formatTry(section.sectionReceipt)} ₺ · matrah{' '}
                {formatTry(section.sectionMatrah)} ₺
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <ReceiptCard
              item={item}
              busy={busyId === item.id}
              isDuplicate={duplicateIds.has(item.id)}
              highlightAmount={parseMoneyInput(query)}
              onOpen={() => router.push(`/admin/accounting/pos-receipts/${item.id}`)}
              onPreview={(uri) => setPreviewUri(uri)}
              onMarkInvoiced={() => markInvoiced(item)}
              onReopen={() => reopen(item)}
              onRereadDate={() => rereadOneDate(item)}
              onDeleteDuplicate={() => deleteDuplicate(item)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={openQuickCamera}
        onLongPress={openAddMenu}
        activeOpacity={0.9}
        delayLongPress={350}
      >
        <Ionicons name="camera" size={26} color="#fff" />
      </TouchableOpacity>

      <ChatFullscreenImageModal uri={previewUri} onClose={() => setPreviewUri(null)} />

      <Modal visible={filterOpen} animationType="slide" transparent onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setFilterOpen(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Detaylı filtre</Text>
            <TouchableOpacity onPress={() => setFilterOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color="#64748b" />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
            <Text style={styles.fieldLabel}>Tutar aralığı (₺)</Text>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.field, styles.fieldHalf]}
                value={draftFilters.amountMin}
                onChangeText={(v) => setDraftFilters((p) => ({ ...p, amountMin: v }))}
                placeholder="Min"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
              />
              <Text style={styles.fieldSep}>—</Text>
              <TextInput
                style={[styles.field, styles.fieldHalf]}
                value={draftFilters.amountMax}
                onChangeText={(v) => setDraftFilters((p) => ({ ...p, amountMax: v }))}
                placeholder="Max"
                placeholderTextColor="#94a3b8"
                keyboardType="decimal-pad"
              />
            </View>

            <Text style={styles.fieldLabel}>Fiş tarihi (YYYY-AA-GG)</Text>
            <View style={styles.fieldRow}>
              <TextInput
                style={[styles.field, styles.fieldHalf]}
                value={draftFilters.dateFrom}
                onChangeText={(v) => setDraftFilters((p) => ({ ...p, dateFrom: v }))}
                placeholder="Başlangıç"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <Text style={styles.fieldSep}>—</Text>
              <TextInput
                style={[styles.field, styles.fieldHalf]}
                value={draftFilters.dateTo}
                onChangeText={(v) => setDraftFilters((p) => ({ ...p, dateTo: v }))}
                placeholder="Bitiş"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
            </View>

            <Text style={styles.fieldLabel}>İşyeri / satıcı</Text>
            <TextInput
              style={styles.field}
              value={draftFilters.merchant}
              onChangeText={(v) => setDraftFilters((p) => ({ ...p, merchant: v }))}
              placeholder="İsim ara"
              placeholderTextColor="#94a3b8"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Banka</Text>
            <TextInput
              style={styles.field}
              value={draftFilters.bank}
              onChangeText={(v) => setDraftFilters((p) => ({ ...p, bank: v }))}
              placeholder="Örn. Ziraat, Garanti"
              placeholderTextColor="#94a3b8"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Fiş no</Text>
            <TextInput
              style={styles.field}
              value={draftFilters.receiptNo}
              onChangeText={(v) => setDraftFilters((p) => ({ ...p, receiptNo: v }))}
              placeholder="Fiş / belge no"
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={styles.fieldLabel}>Vergi no (VKN / TCKN)</Text>
            <TextInput
              style={styles.field}
              value={draftFilters.taxId}
              onChangeText={(v) => setDraftFilters((p) => ({ ...p, taxId: v }))}
              placeholder="Vergi kimlik no"
              placeholderTextColor="#94a3b8"
              keyboardType="number-pad"
            />
          </ScrollView>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalClear} onPress={clearFilters}>
              <Text style={styles.modalClearText}>Sıfırla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalApply} onPress={applyFilters}>
              <Text style={styles.modalApplyText}>Uygula</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function StatPill({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={[styles.statPill, { borderColor: color + '33' }]}>
      <Ionicons name={icon} size={14} color={color} style={{ marginBottom: 4 }} />
      <Text style={[styles.statVal, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

function statusColor(status: PosReceiptInvoiceStatus): string {
  switch (status) {
    case 'invoiced':
      return '#15803d';
    case 'ready':
      return '#0369a1';
    case 'cancelled':
      return '#94a3b8';
    default:
      return '#b45309';
  }
}

function ReceiptCard({
  item,
  busy,
  isDuplicate,
  highlightAmount,
  onOpen,
  onPreview,
  onMarkInvoiced,
  onReopen,
  onRereadDate,
  onDeleteDuplicate,
}: {
  item: PosReceiptInvoiceRow;
  busy: boolean;
  isDuplicate: boolean;
  highlightAmount: number | null;
  onOpen: () => void;
  onPreview: (uri: string) => void;
  onMarkInvoiced: () => void;
  onReopen: () => void;
  onRereadDate: () => void;
  onDeleteDuplicate: () => void;
}) {
  const totals = {
    invoiceCutAmount: rowMatrah(item),
    payableAmount: rowPayable(item),
  };
  const done = item.status === 'invoiced';
  const sc = statusColor(item.status);
  const thumb = item.receipt_urls?.[0];
  const showThumb = thumb && isImageContractUrl(thumb);
  const timeLabel = item.receipt_time ? item.receipt_time.slice(0, 5) : null;
  const metaLine = [
    formatReceiptDateShort(item.receipt_date),
    timeLabel,
    item.receipt_no ? `No ${item.receipt_no}` : null,
    item.payment_bank,
  ]
    .filter(Boolean)
    .join(' · ');

  const hitAmount =
    highlightAmount != null &&
    (amountMatches(item.receipt_total, highlightAmount) ||
      amountMatches(totals.invoiceCutAmount, highlightAmount) ||
      amountMatches(item.payable_amount, highlightAmount));

  return (
    <View
      style={[
        styles.card,
        done && styles.cardDone,
        hitAmount && styles.cardHit,
        isDuplicate && styles.cardDup,
      ]}
    >
      {isDuplicate ? (
        <View style={styles.dupBanner}>
          <Ionicons name="copy-outline" size={14} color="#b91c1c" />
          <Text style={styles.dupBannerText}>Aynı fiş tekrar yüklenmiş</Text>
        </View>
      ) : null}
      <View style={styles.cardTop}>
        {showThumb ? (
          <Pressable onPress={() => onPreview(thumb)} hitSlop={4}>
            <CachedImage uri={thumb} style={styles.thumb} contentFit="cover" />
            <View style={styles.thumbZoom}>
              <Ionicons name="expand-outline" size={12} color="#fff" />
            </View>
          </Pressable>
        ) : (
          <Pressable onPress={onOpen} style={[styles.thumb, styles.thumbPlaceholder]}>
            <Ionicons name="receipt-outline" size={22} color="#0d9488" />
          </Pressable>
        )}
        <Pressable onPress={onOpen} style={{ flex: 1 }} accessible={false}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.merchant} numberOfLines={1}>
              {item.merchant_name || 'İsimsiz işyeri'}
            </Text>
            <View style={[styles.badge, { backgroundColor: sc + '18' }]}>
              <Text style={[styles.badgeText, { color: sc }]}>{POS_STATUS_LABELS[item.status]}</Text>
            </View>
          </View>
          <Text style={styles.due} numberOfLines={2}>
            {metaLine || '—'}
          </Text>
          {item.invoice_due_on ? (
            <Text style={styles.cutHint} numberOfLines={1}>
              Kesim: {formatReceiptDateShort(item.invoice_due_on)}
              {item.receipt_date && item.receipt_date !== item.invoice_due_on
                ? ` · Fiş: ${formatReceiptDateShort(item.receipt_date)}`
                : ''}
            </Text>
          ) : null}
          <View style={[styles.amountRow, hitAmount && styles.amountRowHit]}>
            <View style={styles.amountCol}>
              <Text style={styles.amountLbl}>Fiş tutarı</Text>
              <Text style={styles.amountVal}>
                {item.receipt_total != null ? `${formatTry(item.receipt_total)} ₺` : '—'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
            <View style={styles.amountCol}>
              <Text style={styles.amountLbl}>Yazılacak matrah</Text>
              <Text style={[styles.amountVal, styles.amountAccent]}>
                {formatTry(totals.invoiceCutAmount)} ₺
              </Text>
            </View>
          </View>
        </Pressable>
      </View>

      <View style={styles.actions}>
        {isDuplicate ? (
          <TouchableOpacity
            style={styles.dupDeleteBtn}
            onPress={onDeleteDuplicate}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={15} color="#fff" />
                <Text style={styles.dupDeleteBtnText}>Silinsin mi?</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.detailBtn} onPress={onOpen}>
          <Text style={styles.detailBtnText}>Aç</Text>
        </TouchableOpacity>
        {!done && (item.receipt_urls?.length ?? 0) > 0 ? (
          <TouchableOpacity style={styles.dateBtn} onPress={onRereadDate} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#0f766e" />
            ) : (
              <Text style={styles.dateBtnText}>Tarih oku</Text>
            )}
          </TouchableOpacity>
        ) : null}
        {done ? (
          <TouchableOpacity style={styles.reopenBtn} onPress={onReopen} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#0369a1" />
            ) : (
              <Text style={styles.reopenText}>Geri al</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.doneBtn} onPress={onMarkInvoiced} disabled={busy}>
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.doneBtnText}>Fatura kesildi</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f1f5f9' },
  pad: { flex: 1 },
  headerBlock: { paddingBottom: 4 },
  hero: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#042f2e',
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -40,
    right: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: '#0d948855',
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  heroEyebrow: {
    color: '#5eead4',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  heroSub: { color: '#99f6e4', fontSize: 13, marginTop: 4 },
  batchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#99f6e4',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
  },
  batchChipText: { color: '#042f2e', fontWeight: '800', fontSize: 12 },
  rescanChip: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#0f766e33',
  },
  rescanChipText: { color: '#99f6e4', fontWeight: '700', fontSize: 13 },
  venueTabs: { flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' },
  venueTab: {
    flexGrow: 1,
    flexBasis: '40%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0f766e',
    backgroundColor: '#0f766e22',
  },
  venueTabOn: { backgroundColor: '#99f6e4', borderColor: '#99f6e4' },
  venueTabText: { color: '#99f6e4', fontWeight: '700', fontSize: 12 },
  venueTabTextOn: { color: '#042f2e' },
  venueApplyBtn: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  venueApplyText: { color: '#042f2e', fontWeight: '800', fontSize: 13 },
  venueActiveLabel: { color: '#5eead4', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  statPill: {
    flex: 1,
    backgroundColor: '#0f766e28',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  statVal: { fontWeight: '800', fontSize: 18, fontVariant: ['tabular-nums'] },
  statLbl: { color: '#ccfbf1', fontSize: 11, marginTop: 2, fontWeight: '600' },
  sumBar: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f766e33',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  sumItem: { flex: 1 },
  sumDivider: { width: 1, height: 28, backgroundColor: '#99f6e444', marginHorizontal: 10 },
  sumLbl: { color: '#99f6e4', fontSize: 11, fontWeight: '600' },
  sumVal: {
    marginTop: 2,
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  sumAccent: { color: '#fef08a' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    padding: 0,
    fontWeight: '500',
  },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1fae5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnOn: { backgroundColor: '#99f6e4', borderColor: '#5eead4' },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  filterBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  resultHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
  },
  resultHintText: { flex: 1, color: '#0f766e', fontSize: 12, fontWeight: '600' },
  clearLink: { color: '#b45309', fontWeight: '800', fontSize: 12 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  tabOn: { backgroundColor: '#fff' },
  tabText: { fontWeight: '600', color: '#64748b', fontSize: 13 },
  tabTextOn: { color: '#0f172a' },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  tabCountOn: { backgroundColor: '#ccfbf1' },
  tabCountText: { fontSize: 11, fontWeight: '800', color: '#475569', textAlign: 'center' },
  tabCountTextOn: { color: '#0f766e' },
  listPad: { paddingHorizontal: 16, paddingBottom: 100 },
  emptyPad: { flexGrow: 1, paddingBottom: 100 },
  emptyWrap: { alignItems: 'center', gap: 12, paddingTop: 28, paddingHorizontal: 24 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#ccfbf1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', color: '#94a3b8', fontSize: 15 },
  emptyBtn: {
    backgroundColor: '#0f766e',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
  emptyBtnOutline: {
    borderWidth: 1,
    borderColor: '#0f766e',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnOutlineText: { color: '#0f766e', fontWeight: '800' },
  errBox: { margin: 16, padding: 14, backgroundColor: '#fef2f2', borderRadius: 12 },
  errText: { color: '#b91c1c', fontWeight: '600' },
  errSub: { color: '#7f1d1d', fontSize: 12, marginTop: 6 },
  sectionHead: {
    backgroundColor: '#f1f5f9',
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0f766e',
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: '#0f172a' },
  sectionSum: { marginTop: 4, marginLeft: 16, fontSize: 12, color: '#0f766e', fontWeight: '700' },
  cutHint: { marginTop: 2, color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  amountCol: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardDone: { opacity: 0.92, borderColor: '#bbf7d0' },
  cardHit: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  cardDup: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  dupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    alignSelf: 'flex-start',
  },
  dupBannerText: { color: '#b91c1c', fontSize: 12, fontWeight: '800' },
  dupDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  dupDeleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  cardTop: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 80, borderRadius: 12, backgroundColor: '#e2e8f0' },
  thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  thumbZoom: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  merchant: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0f172a' },
  due: { marginTop: 3, color: '#64748b', fontWeight: '600', fontSize: 12 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  amountRowHit: { backgroundColor: '#fef3c7' },
  amountLbl: { fontSize: 10, color: '#64748b', fontWeight: '700' },
  amountVal: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  amountAccent: { color: '#0f766e' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  detailBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
  },
  detailBtnText: { color: '#0f766e', fontWeight: '700', fontSize: 13 },
  dateBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#99f6e4',
    minWidth: 88,
    alignItems: 'center',
  },
  dateBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 12 },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#15803d',
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  reopenBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
  },
  reopenText: { color: '#0369a1', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0d9488',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalBody: { paddingHorizontal: 20, paddingBottom: 16 },
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  field: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldHalf: { flex: 1 },
  fieldSep: { color: '#94a3b8', fontWeight: '700' },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  modalClear: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
  },
  modalClearText: { color: '#475569', fontWeight: '800' },
  modalApply: {
    flex: 2,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#0f766e',
  },
  modalApplyText: { color: '#fff', fontWeight: '800' },
});
