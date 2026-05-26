import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  TextInput,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { sendNotification } from '@/lib/notificationService';
import { formatDateShort } from '@/lib/date';
import { VAT_RATE, ACCOMMODATION_TAX_RATE } from '@/constants/hmbHotel';
import { GUEST_TYPES, GUEST_MESSAGE_TEMPLATES } from '@/lib/notifications';
import {
  approvalsCacheKey,
  getApprovalsCache,
  getApprovalsCacheAgeMs,
  setApprovalsCache,
} from '@/lib/adminApprovalsCache';

/** Liste için yeterli; tam kayıt detayda veya lazy yüklenir. */
const LIST_LIMIT = 40;
const FOCUS_REFRESH_MS = 30_000;

const DEPT_LABELS: Record<string, string> = {
  housekeeping: 'Temizlik',
  technical: 'Teknik',
  receptionist: 'Resepsiyon',
  security: 'Güvenlik',
  reception_chief: 'Resepsiyon şefi',
  other: 'Diğer',
};

const REPORT_REASONS: Record<string, string> = {
  spam: 'Spam / tekrarlayan içerik',
  inappropriate: 'Uygunsuz içerik',
  violence: 'Şiddet veya tehdit',
  hate: 'Nefret söylemi veya ayrımcılık',
  false_info: 'Yanıltıcı bilgi',
  other: 'Diğer',
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

type Kind = 'staff_app' | 'stock' | 'expense' | 'report' | 'contract';

type UnifiedItem = {
  kind: Kind;
  id: string;
  created_at: string;
  title: string;
  fromLine: string;
  whyLine: string;
  orgLine: string | null;
  organizationId: string | null;
  extraLines: string[];
  raw: unknown;
};

type KindMeta = {
  label: string;
  shortLabel: string;
  color: string;
  bg: string;
  grad: [string, string];
  icon: ComponentProps<typeof Ionicons>['name'];
};

const KIND_ORDER: Kind[] = ['staff_app', 'stock', 'expense', 'report', 'contract'];

const KIND_META: Record<Kind, KindMeta> = {
  staff_app: {
    label: 'Personel başvurusu',
    shortLabel: 'Başvuru',
    color: '#2563eb',
    bg: '#eff6ff',
    grad: ['#3b82f6', '#1d4ed8'],
    icon: 'person-add-outline',
  },
  stock: {
    label: 'Stok onayı',
    shortLabel: 'Stok',
    color: '#16a34a',
    bg: '#ecfdf5',
    grad: ['#22c55e', '#15803d'],
    icon: 'cube-outline',
  },
  expense: {
    label: 'Harcama',
    shortLabel: 'Harcama',
    color: '#ca8a04',
    bg: '#fffbeb',
    grad: ['#f59e0b', '#b45309'],
    icon: 'wallet-outline',
  },
  report: {
    label: 'Paylaşım bildirimi',
    shortLabel: 'Bildirim',
    color: '#dc2626',
    bg: '#fef2f2',
    grad: ['#ef4444', '#b91c1c'],
    icon: 'flag-outline',
  },
  contract: {
    label: 'Sözleşme (check-in bekliyor)',
    shortLabel: 'Sözleşme',
    color: '#7c3aed',
    bg: '#f5f3ff',
    grad: ['#8b5cf6', '#6d28d9'],
    icon: 'document-text-outline',
  },
};

function relativeTimeTr(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Az önce';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} dk önce`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} sa önce`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} gün önce`;
  return formatDateShort(iso);
}

const ROOM_STATUS_LABELS: Record<string, string> = {
  available: 'Müsait',
  occupied: 'Dolu',
  cleaning: 'Temizlik',
  maintenance: 'Bakım',
  out_of_order: 'Kullanılmıyor',
};

const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Nakit' },
  { value: 'credit_card', label: 'Kredi Kartı' },
  { value: 'debit_card', label: 'Banka Kartı' },
  { value: 'transfer', label: 'Havale / EFT' },
  { value: 'online', label: 'Online Ödeme' },
];

const RESERVATION_CHANNELS: { value: string; label: string }[] = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Telefon' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Web sitesi' },
  { value: 'booking_com', label: 'Booking.com' },
  { value: 'trivago', label: 'Trivago' },
  { value: 'airbnb', label: 'Airbnb' },
  { value: 'hotels_com', label: 'Hotels.com' },
  { value: 'expedia', label: 'Expedia' },
  { value: 'agoda', label: 'Agoda' },
  { value: 'tatilbudur', label: 'Tatilbudur' },
  { value: 'jolly', label: 'Jolly' },
  { value: 'etstur', label: 'ETS Tur' },
  { value: 'agency', label: 'Acente' },
  { value: 'corporate', label: 'Kurumsal / Firma' },
  { value: 'social_media', label: 'Sosyal Medya' },
  { value: 'other', label: 'Diğer' },
];

type Movement = {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  staff_image: string | null;
  photo_proof: string | null;
  notes: string | null;
  created_at: string;
  product: { name: string; unit: string | null; current_stock: number | null } | null;
  staff: { full_name: string | null } | null;
};

type ExpenseRow = {
  id: string;
  amount: number;
  description: string | null;
  status: string;
  expense_date: string;
  created_at?: string;
  staff_id: string;
  staff: { full_name: string | null; department: string | null } | null;
  category: { name: string } | null;
};

type ReportRow = {
  id: string;
  post_id: string;
  reporter_staff_id: string | null;
  reporter_guest_id: string | null;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  feed_posts: { id: string; title: string | null; media_type: string } | null;
  staff: { id: string; full_name: string | null } | null;
  guests: { id: string; full_name: string | null } | null;
};

type ContractApprovalRow = {
  id: string;
  token: string;
  contract_lang: string;
  accepted_at: string;
  guest_id: string | null;
  room_id: string | null;
  guests: { full_name?: string | null } | { full_name?: string | null }[] | null;
  rooms?: { room_number?: string | null } | { room_number?: string | null }[] | null;
};

type ContractRoomRow = {
  id: string;
  room_number: string | null;
  floor: string | number | null;
  status: string | null;
  price_per_night: number | null;
};

type StaffPickRow = { id: string; full_name: string | null; department: string | null };

function orgNameFromJoin(row: { organization?: { name?: string } | { name?: string }[] | null } | null) {
  const o = row?.organization;
  if (!o) return null;
  const one = Array.isArray(o) ? o[0] : o;
  return one?.name?.trim() || null;
}

export default function AdminApprovalsHubScreen() {
  const router = useRouter();
  const { staff: me } = useAuthStore();
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const orgScopedForCache = canUseAll ? null : me?.organization_id ?? null;
  const initialCacheKey = approvalsCacheKey(canUseAll, orgScopedForCache);
  const initialCached = getApprovalsCache(initialCacheKey, true) as UnifiedItem[] | null;
  /** Onay merkezi: muhasebe/global işletme seçiminden bağımsız; varsayılan tüm bekleyenler */
  const [orgFilter, setOrgFilter] = useState<string | 'all'>('all');
  const autoOrgPickedRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const [items, setItems] = useState<UnifiedItem[]>(initialCached ?? []);
  const [loading, setLoading] = useState(!(initialCached && initialCached.length > 0));
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<UnifiedItem | null>(null);
  const [acting, setActing] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [contractStaffList, setContractStaffList] = useState<StaffPickRow[]>([]);
  const [contractStaffLoading, setContractStaffLoading] = useState(false);
  const [contractRooms, setContractRooms] = useState<ContractRoomRow[]>([]);
  const [contractRoomsLoading, setContractRoomsLoading] = useState(false);
  const [contractSelectedRoomId, setContractSelectedRoomId] = useState<string | null>(null);
  const [contractPriceInput, setContractPriceInput] = useState('');
  const [contractNightsInput, setContractNightsInput] = useState('');
  const [contractPaymentMethod, setContractPaymentMethod] = useState<string | null>(null);
  const [contractReservationChannel, setContractReservationChannel] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stockDetailPhotos, setStockDetailPhotos] = useState<{
    staff_image: string | null;
    photo_proof: string | null;
  } | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (loadInFlightRef.current) return;
    const orgScoped = canUseAll ? null : me?.organization_id ?? null;
    const cacheKey = approvalsCacheKey(canUseAll, orgScoped);

    if (!opts?.silent) {
      const stale = getApprovalsCache(cacheKey, true) as UnifiedItem[] | null;
      if (stale?.length) {
        setItems(stale);
        setLoading(false);
      } else {
        setLoading(true);
      }
    }

    loadInFlightRef.current = true;
    try {
    let appsQuery = supabase
      .from('staff_applications')
      .select('id, full_name, email, phone, applied_department, experience, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    let stocksQuery = supabase
      .from('stock_movements')
      .select(
        'id, product_id, movement_type, quantity, notes, created_at, organization_id, product:stock_products(name, unit), staff:staff_id(full_name), organization:organization_id(name)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (orgScoped) stocksQuery = stocksQuery.eq('organization_id', orgScoped);
    let expensesQuery = supabase
      .from('staff_expenses')
      .select(
        'id, amount, description, status, expense_date, created_at, staff_id, organization_id, staff:staff_id(full_name, department), category:category_id(name), organization:organization_id(name)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (orgScoped) expensesQuery = expensesQuery.eq('organization_id', orgScoped);
    let contractsQuery = supabase
      .from('contract_acceptances')
      .select(
        'id, token, room_id, contract_lang, accepted_at, guest_id, organization_id, guests(full_name), rooms(room_number), organization:organization_id(name)'
      )
      .is('assigned_staff_id', null)
      .order('accepted_at', { ascending: false })
      .limit(LIST_LIMIT);
    if (orgScoped) contractsQuery = contractsQuery.eq('organization_id', orgScoped);
    const [
      apps,
      stocks,
      expenses,
      reports,
      contracts,
    ] = await Promise.all([
      appsQuery,
      stocksQuery,
      expensesQuery,
      supabase
        .from('feed_post_reports')
        .select(
          'id, post_id, reporter_staff_id, reporter_guest_id, reason, details, status, created_at, feed_posts(id, title), staff!reporter_staff_id(full_name), guests!reporter_guest_id(full_name)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT),
      contractsQuery,
    ]);

    const list: UnifiedItem[] = [];

    for (const a of apps.data ?? []) {
      const r = a as {
        id: string;
        full_name: string;
        email: string;
        phone?: string;
        applied_department: string;
        experience?: string;
        created_at: string;
      };
      list.push({
        kind: 'staff_app',
        id: r.id,
        created_at: r.created_at,
        title: r.full_name,
        fromLine: `E-posta: ${r.email}`,
        whyLine: `Başvurulan birim: ${DEPT_LABELS[r.applied_department] ?? r.applied_department}`,
        orgLine: 'Genel başvuru',
        organizationId: null,
        extraLines: [
          r.phone ? `Tel: ${r.phone}` : '',
          r.experience ? `Deneyim: ${r.experience}` : '',
        ].filter(Boolean),
        raw: r,
      });
    }

    for (const m of (stocks.data ?? []) as unknown as (Movement & { organization_id?: string; organization?: { name?: string } | null })[]) {
      const prod = m.product as { name?: string; unit?: string | null } | null;
      const st = m.staff as { full_name?: string } | null;
      const orgName = orgNameFromJoin(m);
      list.push({
        kind: 'stock',
        id: m.id,
        created_at: m.created_at,
        title: `${m.movement_type === 'in' ? 'Giriş' : 'Çıkış'} · ${prod?.name ?? 'Ürün'}`,
        fromLine: `Personel: ${st?.full_name ?? '—'}`,
        whyLine: `Miktar: ${m.movement_type === 'in' ? '+' : '-'}${m.quantity} ${prod?.unit ?? 'adet'}`,
        orgLine: orgName,
        organizationId: m.organization_id ?? null,
        extraLines: [m.notes ? `Not: ${m.notes}` : ''].filter(Boolean),
        raw: m,
      });
    }

    for (const e of (expenses.data ?? []) as unknown as (ExpenseRow & {
      organization_id?: string;
      organization?: { name?: string } | null;
    })[]) {
      const s = e.staff as { full_name?: string; department?: string } | null;
      const orgName = orgNameFromJoin(e);
      list.push({
        kind: 'expense',
        id: e.id,
        created_at: e.created_at ?? e.expense_date,
        title: fmtMoney(Number(e.amount)),
        fromLine: `Personel: ${s?.full_name ?? '—'} (${s?.department ?? '—'})`,
        whyLine: `Tarih: ${formatDateShort(e.expense_date)} · Kategori: ${e.category?.name ?? '—'}`,
        orgLine: orgName,
        organizationId: e.organization_id ?? null,
        extraLines: [e.description ? `Açıklama: ${e.description}` : ''].filter(Boolean),
        raw: e,
      });
    }

    for (const r of (reports.data ?? []) as unknown as ReportRow[]) {
      const reporter =
        r.reporter_guest_id
          ? `Misafir: ${(r.guests as { full_name?: string } | null)?.full_name ?? '—'}`
          : `Personel: ${(r.staff as { full_name?: string } | null)?.full_name ?? '—'}`;
      list.push({
        kind: 'report',
        id: r.id,
        created_at: r.created_at,
        title: r.feed_posts?.title?.trim() || 'Paylaşım bildirimi',
        fromLine: reporter,
        whyLine: `Sebep: ${REPORT_REASONS[r.reason] ?? r.reason}`,
        orgLine: null,
        organizationId: null,
        extraLines: [r.details ? `Detay: ${r.details}` : ''].filter(Boolean),
        raw: r,
      });
    }

    for (const c of contracts.data ?? []) {
      const row = c as unknown as ContractApprovalRow & {
        organization_id?: string;
        organization?: { name?: string } | null;
      };
      const g = Array.isArray(row.guests) ? row.guests[0] : row.guests;
      const rm = row.rooms;
      const roomObj = Array.isArray(rm) ? rm[0] : rm;
      const roomLabel = row.room_id ? roomObj?.room_number ?? '—' : null;
      const orgName = orgNameFromJoin(row);
      list.push({
        kind: 'contract',
        id: row.id,
        created_at: row.accepted_at,
        title: `Sözleşme · ${row.contract_lang?.toUpperCase() ?? ''}`,
        fromLine: `İmzalayan: ${g?.full_name ?? '—'}`,
        whyLine: row.guest_id
          ? 'Check-in tamamlanmadı: oda ve maliye bilgisini buradan girebilir veya personele devredebilirsiniz.'
          : 'Misafir kaydı yok; sorumlu personel ataması yapılabilir.',
        orgLine: orgName,
        organizationId: row.organization_id ?? null,
        extraLines: [
          `Token: ${row.token.slice(0, 12)}…`,
          ...(roomLabel != null ? [`Oda: ${roomLabel}`] : []),
        ],
        raw: row,
      });
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setApprovalsCache(cacheKey, list);
    setItems(list);

    if (canUseAll && !autoOrgPickedRef.current && list.length > 0) {
      const orgIds = new Set(list.map((i) => i.organizationId).filter(Boolean) as string[]);
      if (orgIds.size === 1) {
        autoOrgPickedRef.current = true;
        setOrgFilter([...orgIds][0]);
      }
    }
    } catch {
      /* önbellek / önceki liste kalır */
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, [canUseAll, me?.organization_id]);

  useEffect(() => {
    void load({ silent: Boolean(initialCached?.length) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ilk açılış + org değişimi load içinde
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      const orgScoped = canUseAll ? null : me?.organization_id ?? null;
      const key = approvalsCacheKey(canUseAll, orgScoped);
      const age = getApprovalsCacheAgeMs(key);
      if (age == null) return;
      if (age < FOCUS_REFRESH_MS) return;
      void load({ silent: true });
    }, [canUseAll, load, me?.organization_id])
  );

  useEffect(() => {
    if (detail?.kind !== 'contract') {
      setContractStaffList([]);
      setContractStaffLoading(false);
      setContractRooms([]);
      setContractRoomsLoading(false);
      setContractSelectedRoomId(null);
      setContractPriceInput('');
      setContractNightsInput('');
      return;
    }
    setContractStaffLoading(true);
    void supabase
      .from('staff')
      .select('id, full_name, department')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data, error }) => {
        setContractStaffLoading(false);
        if (!error) setContractStaffList((data ?? []) as StaffPickRow[]);
      });
    setContractRoomsLoading(true);
    const row = detail.raw as ContractApprovalRow & { organization_id?: string };
    let roomsQuery = supabase
      .from('rooms')
      .select('id, room_number, floor, status, price_per_night')
      .order('room_number')
      .limit(120);
    if (row.organization_id) {
      roomsQuery = roomsQuery.eq('organization_id', row.organization_id);
    }
    void roomsQuery.then(({ data, error }) => {
      setContractRoomsLoading(false);
      if (!error) setContractRooms((data ?? []) as ContractRoomRow[]);
    });
    if (row.room_id) {
      setContractSelectedRoomId(row.room_id);
    } else {
      setContractSelectedRoomId(null);
    }
    /** Konaklama tutarı oda kartındaki fiyattan otomatik gelmez; yönetici/yetkili elle girer. */
    setContractPriceInput('');
    setContractNightsInput('');
  }, [detail?.kind, detail?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  };

  useEffect(() => {
    if (detail?.kind !== 'stock') {
      setStockDetailPhotos(null);
      return;
    }
    const m = detail.raw as Movement;
    if (m.staff_image || m.photo_proof) {
      setStockDetailPhotos({ staff_image: m.staff_image, photo_proof: m.photo_proof });
      return;
    }
    setStockDetailPhotos(null);
    void supabase
      .from('stock_movements')
      .select('staff_image, photo_proof')
      .eq('id', detail.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setStockDetailPhotos(data);
      });
  }, [detail?.id, detail?.kind]);

  const expenseSummary = (e: ExpenseRow) =>
    `${fmtMoney(Number(e.amount))} · ${formatDateShort(e.expense_date)} · ${e.category?.name ?? '—'}`;

  const approveExpense = async (e: ExpenseRow) => {
    if (!me?.id) return;
    setActing(true);
    const { error } = await supabase
      .from('staff_expenses')
      .update({
        status: 'approved',
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', e.id);
    setActing(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (e.staff_id) {
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama onaylandı',
        body: `Girdiğiniz harcama onaylandı: ${expenseSummary(e)}`,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me.id,
      });
    }
    setDetail(null);
    await load();
  };

  const rejectExpenseWithReason = async (e: ExpenseRow, reason: string) => {
    if (!me?.id) return;
    setActing(true);
    const { error } = await supabase
      .from('staff_expenses')
      .update({
        status: 'rejected',
        approved_by: me.id,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .eq('id', e.id);
    setActing(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    if (e.staff_id) {
      await sendNotification({
        staffId: e.staff_id,
        title: 'Harcama geri bildirimi',
        body: `Girdiğiniz harcama: ${expenseSummary(e)} — ${reason}`,
        category: 'admin',
        data: { screen: '/staff/expenses' },
        createdByStaffId: me.id,
      });
    }
    setDetail(null);
    await load();
    Alert.alert('Gönderildi', 'Harcama reddedildi ve personel bilgilendirildi.');
  };

  const rejectExpense = (e: ExpenseRow) => {
    Alert.alert('Harcamayı reddet', 'Red nedeni seçin (personel bildiriminde görünür).', [
      { text: 'İptal', style: 'cancel' },
      { text: 'Yanlış', onPress: () => void rejectExpenseWithReason(e, 'Harcama yanlış.') },
      { text: 'Tekrar giriş', onPress: () => void rejectExpenseWithReason(e, 'Gereksiz tekrar giriş.') },
      { text: 'Kabul edilmedi', onPress: () => void rejectExpenseWithReason(e, 'Kabul edilmedi.') },
    ]);
  };

  const approveStock = async (m: Movement) => {
    if (!me?.id) return;
    setActing(true);
    const { data: prod } = await supabase.from('stock_products').select('current_stock').eq('id', m.product_id).single();
    const cur = (prod?.current_stock ?? 0) as number;
    const newStock = m.movement_type === 'in' ? cur + m.quantity : cur - m.quantity;
    if (m.movement_type === 'out' && newStock < 0) {
      setActing(false);
      Alert.alert('Hata', 'Stok yetersiz.');
      return;
    }
    await supabase
      .from('stock_movements')
      .update({ status: 'approved', approved_by: me.id, approved_at: new Date().toISOString() })
      .eq('id', m.id);
    await supabase.from('stock_products').update({ current_stock: newStock }).eq('id', m.product_id);
    setActing(false);
    setDetail(null);
    await load();
  };

  const rejectStock = async (id: string) => {
    setActing(true);
    await supabase.from('stock_movements').update({ status: 'rejected' }).eq('id', id);
    setActing(false);
    setDetail(null);
    await load();
  };

  const markReportReviewed = async (r: ReportRow) => {
    if (!me?.id) return;
    setActing(true);
    const { error } = await supabase
      .from('feed_post_reports')
      .update({ status: 'reviewed', reviewed_at: new Date().toISOString(), reviewed_by: me.id })
      .eq('id', r.id);
    setActing(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const postTitle = r.feed_posts?.title ?? null;
    const notifBody = postTitle
      ? `"${postTitle}" paylaşımına dair bildiriminiz incelendi olarak işlendi.`
      : `Paylaşım bildiriminiz incelendi olarak işlendi.`;
    if (r.reporter_staff_id) {
      await sendNotification({
        staffId: r.reporter_staff_id,
        title: 'Bildiriminiz incelendi',
        body: notifBody,
        category: 'staff',
        notificationType: 'report_status',
        data: { reportId: r.id, status: 'reviewed' },
        createdByStaffId: me.id,
      });
    } else if (r.reporter_guest_id) {
      await sendNotification({
        guestId: r.reporter_guest_id,
        title: 'Bildiriminiz incelendi',
        body: notifBody,
        category: 'guest',
        notificationType: 'report_status',
        data: { reportId: r.id, status: 'reviewed' },
        createdByStaffId: me.id,
      });
    }
    setDetail(null);
    await load();
  };

  const assignContractStaff = async (row: ContractApprovalRow, staffId: string) => {
    setActing(true);
    try {
      const { error } = await supabase
        .from('contract_acceptances')
        .update({ assigned_staff_id: staffId, assigned_at: new Date().toISOString() })
        .eq('id', row.id);
      if (error) throw error;
      setDetail(null);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Çalışan atanamadı.');
    }
    setActing(false);
  };

  const linkContractRoomPreview = async (row: ContractApprovalRow) => {
    if (!row.guest_id) return;
    const roomId = contractSelectedRoomId;
    if (!roomId) {
      Alert.alert('Uyarı', 'Önce listeden bir oda seçin.');
      return;
    }
    const g0 = Array.isArray(row.guests) ? row.guests[0] : row.guests;
    const signerLabel = g0?.full_name?.trim() || 'Misafir';
    setActing(true);
    try {
      const { error } = await supabase.from('contract_acceptances').update({ room_id: roomId }).eq('id', row.id);
      if (error) throw error;
      const roomNum = contractRooms.find((r) => r.id === roomId)?.room_number ?? '';
      setDetail((prev) => {
        if (!prev || prev.kind !== 'contract' || prev.id !== row.id) return prev;
        const raw = { ...(prev.raw as ContractApprovalRow), room_id: roomId };
        const extraLines = [`Token: ${raw.token.slice(0, 12)}…`, ...(roomNum ? [`Oda (önizleme): ${roomNum}`] : [])];
        return { ...prev, raw, extraLines };
      });
      Alert.alert(
        'Önizleme',
        `${signerLabel} adı oda ${roomNum || '…'} kartında önizleme olarak görünür. Check-in için fiyat ve gece sayısı girip “Check-in yap”a basın.`
      );
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oda bağlanamadı.');
    }
    setActing(false);
  };

  const completeContractCheckIn = async (row: ContractApprovalRow) => {
    if (!me?.id) return;
    const roomId = contractSelectedRoomId;
    if (!roomId) {
      Alert.alert('Uyarı', 'Önce bir oda seçin.');
      return;
    }
    if (!row.guest_id) {
      Alert.alert('Bilgi', 'Bu kayıtta misafir yok; check-in yapılamaz.');
      return;
    }
    const price = contractPriceInput.trim() ? parseFloat(contractPriceInput.replace(',', '.')) : null;
    const nights = contractNightsInput.trim() ? parseInt(contractNightsInput, 10) : null;
    if (price == null || price < 0 || !nights || nights < 1) {
      Alert.alert('Hata', 'Geçerli bir fiyat ve en az 1 gece girin.');
      return;
    }
    const totalNet = price * nights;
    const vatAmount = Math.round(totalNet * VAT_RATE * 100) / 100;
    const accommodationTaxAmount = Math.round(totalNet * ACCOMMODATION_TAX_RATE * 100) / 100;
    const roomNumber = contractRooms.find((x) => x.id === roomId)?.room_number ?? '';
    const msg = GUEST_MESSAGE_TEMPLATES[GUEST_TYPES.admin_assigned_room]({ roomNumber });
    setActing(true);
    try {
      const { error: caErr } = await supabase
        .from('contract_acceptances')
        .update({
          room_id: roomId,
          assigned_staff_id: me.id,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (caErr) throw caErr;

      const guestUpdate: Record<string, unknown> = {
          room_id: roomId,
          status: 'checked_in',
          check_in_at: new Date().toISOString(),
          total_amount_net: totalNet,
          vat_amount: vatAmount,
          accommodation_tax_amount: accommodationTaxAmount,
          nights_count: nights,
      };
      if (contractPaymentMethod) guestUpdate.payment_method = contractPaymentMethod;
      if (contractReservationChannel) guestUpdate.reservation_channel = contractReservationChannel;

      const { error: gErr } = await supabase
        .from('guests')
        .update(guestUpdate)
        .eq('id', row.guest_id);
      if (gErr) throw gErr;

      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId);

      await sendNotification({
        guestId: row.guest_id,
        title: msg.title,
        body: msg.body,
        notificationType: GUEST_TYPES.admin_assigned_room,
        category: 'guest',
        createdByStaffId: me.id,
      });

      setDetail(null);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Check-in tamamlanamadı.');
    }
    setActing(false);
  };

  const visibleItems = useMemo(() => {
    if (!canUseAll || orgFilter === 'all') return items;
    return items.filter((i) => !i.organizationId || i.organizationId === orgFilter);
  }, [canUseAll, items, orgFilter]);

  const pendingByOrg = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of items) {
      if (!i.organizationId) continue;
      map[i.organizationId] = (map[i.organizationId] ?? 0) + 1;
    }
    return map;
  }, [items]);

  const counts = useMemo(() => {
    const c: Record<Kind, number> = {
      staff_app: 0,
      stock: 0,
      expense: 0,
      report: 0,
      contract: 0,
    };
    for (const i of visibleItems) c[i.kind]++;
    return c;
  }, [visibleItems]);

  const totalPending = visibleItems.length;

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase('tr-TR');
    return visibleItems.filter((it) => {
      if (kindFilter !== 'all' && it.kind !== kindFilter) return false;
      if (!q) return true;
      const hay = [it.title, it.fromLine, it.whyLine, it.orgLine ?? '', ...it.extraLines]
        .join(' ')
        .toLocaleLowerCase('tr-TR');
      return hay.includes(q);
    });
  }, [visibleItems, kindFilter, searchQuery]);

  const renderDetailActions = () => {
    if (!detail || !me) return null;
    switch (detail.kind) {
      case 'staff_app':
        return (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setDetail(null);
              const orgId = detail.organizationId;
              router.push({
                pathname: '/admin/staff/approve/[id]',
                params: orgId ? { id: detail.id, organizationId: orgId } : { id: detail.id },
              });
            }}
          >
            <Text style={styles.primaryBtnText}>Başvuruyu aç ve onayla</Text>
          </TouchableOpacity>
        );
      case 'stock': {
        const m = detail.raw as Movement;
        return (
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => approveStock(m)} disabled={acting}>
              <Text style={styles.primaryBtnText}>Stok hareketini onayla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerBtn} onPress={() => rejectStock(detail.id)} disabled={acting}>
              <Text style={styles.dangerBtnText}>Reddet</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'expense': {
        const e = detail.raw as ExpenseRow;
        return (
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => approveExpense(e)} disabled={acting}>
              <Text style={styles.primaryBtnText}>Harcamayı onayla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerBtn} onPress={() => rejectExpense(e)} disabled={acting}>
              <Text style={styles.dangerBtnText}>Reddet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setDetail(null);
                router.push('/admin/expenses/all');
              }}
            >
              <Text style={styles.secondaryBtnText}>Tüm harcamalar</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'report': {
        const r = detail.raw as ReportRow;
        return (
          <View style={styles.rowBtns}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => markReportReviewed(r)} disabled={acting}>
              <Text style={styles.primaryBtnText}>İncelendi olarak işaretle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setDetail(null);
                router.push('/admin/reports');
              }}
            >
              <Text style={styles.secondaryBtnText}>Şikayetler ekranı</Text>
            </TouchableOpacity>
          </View>
        );
      }
      case 'contract': {
        const row = detail.raw as ContractApprovalRow;
        const hasGuest = Boolean(row.guest_id);
        const g0 = Array.isArray(row.guests) ? row.guests[0] : row.guests;
        const guestName = g0?.full_name?.trim() || null;
        return (
          <View style={styles.rowBtns}>
            {hasGuest ? (
              <>
                {/* Guest info banner */}
                <View style={styles.contractGuestBanner}>
                  <View style={styles.contractGuestAvatar}>
                    <Ionicons name="person" size={20} color="#7c3aed" />
                  </View>
                  <View style={styles.contractGuestInfo}>
                    <Text style={styles.contractGuestName}>{guestName ?? 'Misafir'}</Text>
                    <Text style={styles.contractGuestMeta}>
                      Sözleşme dili: {row.contract_lang?.toUpperCase() ?? '—'}
                    </Text>
                  </View>
                  <View style={styles.contractGuestBadge}>
                    <Ionicons name="document-text" size={12} color="#7c3aed" />
                    <Text style={styles.contractGuestBadgeText}>Onaylı</Text>
                  </View>
                </View>

                {/* Step indicator */}
                <View style={styles.contractSteps}>
                  <View style={[styles.contractStep, contractSelectedRoomId ? styles.contractStepDone : styles.contractStepActive]}>
                    <View style={[styles.contractStepDot, contractSelectedRoomId ? styles.contractStepDotDone : styles.contractStepDotActive]}>
                      {contractSelectedRoomId ? (
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      ) : (
                        <Text style={styles.contractStepNum}>1</Text>
                      )}
                    </View>
                    <Text style={[styles.contractStepLabel, contractSelectedRoomId && styles.contractStepLabelDone]}>Oda seç</Text>
                  </View>
                  <View style={[styles.contractStepLine, contractSelectedRoomId && styles.contractStepLineDone]} />
                  <View style={[styles.contractStep, contractPriceInput && contractNightsInput ? styles.contractStepDone : contractSelectedRoomId ? styles.contractStepActive : null]}>
                    <View style={[styles.contractStepDot, contractPriceInput && contractNightsInput ? styles.contractStepDotDone : contractSelectedRoomId ? styles.contractStepDotActive : null]}>
                      {contractPriceInput && contractNightsInput ? (
                        <Ionicons name="checkmark" size={10} color="#fff" />
                      ) : (
                        <Text style={styles.contractStepNum}>2</Text>
                      )}
                    </View>
                    <Text style={[styles.contractStepLabel, contractPriceInput && contractNightsInput && styles.contractStepLabelDone]}>Detaylar</Text>
                  </View>
                  <View style={[styles.contractStepLine, contractPriceInput && contractNightsInput ? styles.contractStepLineDone : null]} />
                  <View style={styles.contractStep}>
                    <View style={styles.contractStepDot}>
                      <Text style={styles.contractStepNum}>3</Text>
                    </View>
                    <Text style={styles.contractStepLabel}>Check-in</Text>
                  </View>
                </View>

                {/* Room grid */}
                <View style={styles.contractSectionCard}>
                  <View style={styles.contractSectionCardHeader}>
                    <View style={styles.contractSectionIcon}>
                      <Ionicons name="bed-outline" size={16} color="#7c3aed" />
                    </View>
                    <Text style={styles.contractSectionCardTitle}>Oda Seçimi</Text>
                    {contractSelectedRoomId ? (
                      <View style={styles.contractSectionDoneBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                      </View>
                    ) : null}
                  </View>
                  {contractRoomsLoading ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 12 }} />
                  ) : contractRooms.length === 0 ? (
                    <Text style={styles.contractEmptyStaff}>Tanımlı oda yok.</Text>
                  ) : (
                    <View style={styles.roomList}>
                      {contractRooms.map((r) => {
                        const isSelected = contractSelectedRoomId === r.id;
                        const isAvailable = r.status === 'available';
                        const statusColor = isAvailable ? '#16a34a' : r.status === 'occupied' ? '#dc2626' : r.status === 'cleaning' ? '#ca8a04' : '#64748b';
                        const statusBg = isAvailable ? '#dcfce7' : r.status === 'occupied' ? '#fee2e2' : r.status === 'cleaning' ? '#fef9c3' : '#f1f5f9';
                        return (
                          <TouchableOpacity
                            key={r.id}
                            style={[
                              styles.roomListItem,
                              isSelected && styles.roomListItemSelected,
                              !isAvailable && !isSelected && styles.roomCardUnavailable,
                              acting && styles.staffPickRowDisabled,
                            ]}
                            onPress={() => setContractSelectedRoomId(r.id)}
                            disabled={acting}
                            activeOpacity={0.8}
                          >
                            <View style={[styles.roomListNumber, isSelected && styles.roomListNumberSelected]}>
                              <Text style={[styles.roomListNumberText, isSelected && styles.roomListNumberTextSelected]}>{r.room_number}</Text>
                            </View>
                            <View style={styles.roomListBody}>
                              <Text style={[styles.roomListTitle, isSelected && styles.roomListTitleSelected]}>
                                Oda {r.room_number}
                              </Text>
                              <View style={styles.roomListMeta}>
                                {r.floor != null ? <Text style={styles.roomListFloor}>Kat {r.floor}</Text> : null}
                                {r.price_per_night != null && r.price_per_night > 0 ? (
                                  <Text style={styles.roomListPrice}>{fmtMoney(r.price_per_night)}/gece</Text>
                                ) : null}
                              </View>
                            </View>
                            <View style={[styles.roomListStatus, { backgroundColor: statusBg }]}>
                              <View style={[styles.roomCardStatusDot, { backgroundColor: statusColor }]} />
                              <Text style={[styles.roomCardStatusText, { color: statusColor }]}>
                                {ROOM_STATUS_LABELS[r.status ?? ''] ?? r.status}
                              </Text>
                            </View>
                            {isSelected ? (
                              <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
                            ) : (
                              <View style={styles.roomListRadio} />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Pricing & details section */}
                {contractSelectedRoomId ? (
                  <View style={styles.contractSectionCard}>
                    <View style={styles.contractSectionCardHeader}>
                      <View style={styles.contractSectionIcon}>
                        <Ionicons name="calculator-outline" size={16} color="#0f766e" />
                      </View>
                      <Text style={styles.contractSectionCardTitle}>Konaklama Detayları</Text>
                    </View>
                    <View style={styles.contractPriceRow}>
                      <View style={styles.contractPriceField}>
                        <Text style={styles.inputLabel}>Gece başı fiyat (₺)</Text>
                        <TextInput
                          style={styles.textInput}
                          value={contractPriceInput}
                          onChangeText={setContractPriceInput}
                          keyboardType="decimal-pad"
                          placeholder="1500"
                          placeholderTextColor={adminTheme.colors.textMuted}
                          editable={!acting}
                        />
                      </View>
                      <View style={styles.contractPriceField}>
                        <Text style={styles.inputLabel}>Gece sayısı</Text>
                        <TextInput
                          style={styles.textInput}
                          value={contractNightsInput}
                          onChangeText={setContractNightsInput}
                          keyboardType="number-pad"
                          placeholder="3"
                          placeholderTextColor={adminTheme.colors.textMuted}
                          editable={!acting}
                        />
                      </View>
                    </View>

                    {contractPriceInput && contractNightsInput ? (
                      <View style={styles.contractPriceSummary}>
                        <View style={styles.contractPriceSummaryRow}>
                          <Text style={styles.contractPriceSummaryLabel}>Toplam (net)</Text>
                          <Text style={styles.contractPriceSummaryValue}>
                            {fmtMoney(parseFloat(contractPriceInput.replace(',', '.') || '0') * parseInt(contractNightsInput || '0', 10))}
                          </Text>
                        </View>
                        <Text style={styles.contractPriceSummaryNote}>+ KDV + konaklama vergisi</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Payment & channel section */}
                {contractSelectedRoomId ? (
                  <View style={styles.contractSectionCard}>
                    <View style={styles.contractSectionCardHeader}>
                      <View style={styles.contractSectionIcon}>
                        <Ionicons name="wallet-outline" size={16} color="#b45309" />
                      </View>
                      <Text style={styles.contractSectionCardTitle}>Ödeme & Kaynak</Text>
                    </View>

                    <View style={styles.contractFieldSection}>
                      <Text style={styles.inputLabel}>Ödeme Şekli</Text>
                      <View style={styles.chipRow}>
                        {PAYMENT_METHODS.map((pm) => {
                          const active = contractPaymentMethod === pm.value;
                          return (
                            <TouchableOpacity
                              key={pm.value}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setContractPaymentMethod(active ? null : pm.value)}
                              disabled={acting}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{pm.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.contractFieldSection}>
                      <Text style={styles.inputLabel}>Rezervasyon Kanalı</Text>
                      <View style={styles.chipRow}>
                        {RESERVATION_CHANNELS.map((ch) => {
                          const active = contractReservationChannel === ch.value;
                          return (
                            <TouchableOpacity
                              key={ch.value}
                              style={[styles.chip, active && styles.chipActive]}
                              onPress={() => setContractReservationChannel(active ? null : ch.value)}
                              disabled={acting}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.chipText, active && styles.chipTextActive]}>{ch.label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* Action buttons */}
                {contractSelectedRoomId ? (
                  <View style={styles.contractActionBar}>
                    <TouchableOpacity
                      style={styles.contractPreviewBtn}
                      onPress={() => linkContractRoomPreview(row)}
                      disabled={acting}
                    >
                      <Ionicons name="eye-outline" size={16} color="#2563eb" />
                      <Text style={styles.contractPreviewBtnText}>Önizleme</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.contractCheckinBtn} onPress={() => completeContractCheckIn(row)} disabled={acting}>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.contractCheckinBtnText}>Check-in Yap</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.contractNoGuestCard}>
                <Ionicons name="alert-circle-outline" size={28} color="#64748b" />
                <Text style={styles.contractNoGuestText}>
                  Bu onayda misafir kaydı yok; oda ataması yapılamaz. Süreci bir personele devredebilirsiniz.
                </Text>
              </View>
            )}

            {/* Delegate section */}
            <View style={styles.contractDivider} />
            <View style={styles.contractSectionCardHeader}>
              <View style={[styles.contractSectionIcon, { backgroundColor: '#ede9fe' }]}>
                <Ionicons name="people-outline" size={16} color="#7c3aed" />
              </View>
              <Text style={styles.contractSectionCardTitle}>Personele Devret</Text>
            </View>
            <Text style={styles.contractAssignHint}>Personel uygulamasında oda atamasını tamamlar:</Text>
            {contractStaffLoading ? (
              <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 12 }} />
            ) : contractStaffList.length === 0 ? (
              <Text style={styles.contractEmptyStaff}>Aktif çalışan bulunamadı.</Text>
            ) : (
              <ScrollView
                style={styles.staffPickScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {contractStaffList.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.staffPickRow, acting && styles.staffPickRowDisabled]}
                    onPress={() => assignContractStaff(row, s.id)}
                    disabled={acting}
                    activeOpacity={0.75}
                  >
                    <View style={styles.staffPickAvatar}>
                      <Text style={styles.staffPickAvatarText}>
                        {(s.full_name?.[0] ?? '?').toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.staffPickTextCol}>
                      <Text style={styles.staffPickName}>{s.full_name ?? s.id.slice(0, 8)}</Text>
                      {s.department ? <Text style={styles.staffPickDept}>{DEPT_LABELS[s.department] ?? s.department}</Text> : null}
                    </View>
                    <View style={styles.staffPickArrow}>
                      <Ionicons name="arrow-forward" size={16} color="#7c3aed" />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.contractFullListBtn}
              onPress={() => {
                setDetail(null);
                router.push('/admin/contracts/acceptances' as never);
              }}
            >
              <Ionicons name="list-outline" size={16} color="#7c3aed" />
              <Text style={styles.contractFullListBtnText}>Sözleşme onayları — tam liste</Text>
              <Ionicons name="chevron-forward" size={14} color="#7c3aed" />
            </TouchableOpacity>
          </View>
        );
      }
      default:
        return null;
    }
  };

  const stockPhotos = (d: UnifiedItem) => {
    if (d.kind !== 'stock') return null;
    const m = d.raw as Movement;
    const u1 = stockDetailPhotos?.staff_image ?? m.staff_image;
    const u2 = stockDetailPhotos?.photo_proof ?? m.photo_proof;
    if (!u1 && !u2) return null;
    return (
      <View style={styles.photoRow}>
        {u1 ? (
          <TouchableOpacity onPress={() => setPreviewUri(u1)}>
            <CachedImage uri={u1} style={styles.thumb} contentFit="cover" />
          </TouchableOpacity>
        ) : null}
        {u2 ? (
          <TouchableOpacity onPress={() => setPreviewUri(u2)}>
            <CachedImage uri={u2} style={styles.thumb} contentFit="cover" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const detailMeta = detail ? KIND_META[detail.kind] : null;
  const showListSkeleton = loading && items.length === 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
      >
        {loading && items.length > 0 ? (
          <View style={styles.syncBanner}>
            <ActivityIndicator size="small" color={adminTheme.colors.accent} />
            <Text style={styles.syncBannerText}>Liste güncelleniyor…</Text>
          </View>
        ) : null}
        <AdminOrganizationPicker
          canUseAll={canUseAll}
          ownOrganizationId={me?.organization_id}
          value={orgFilter}
          onChange={setOrgFilter}
          pendingCounts={pendingByOrg}
        />

        <LinearGradient
          colors={['#0f172a', '#134e4a', '#0f766e']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroRow}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="shield-checkmark" size={28} color="#fff" />
            </View>
            <View style={styles.heroTextCol}>
              <Text style={styles.heroKicker}>Yönetim · Onay merkezi</Text>
              <View style={styles.heroCountRow}>
                <Text style={styles.heroCount}>{totalPending}</Text>
                <Text style={styles.heroCountUnit}>bekleyen</Text>
              </View>
            </View>
            {totalPending > 0 ? (
              <View style={styles.heroPulse}>
                <View style={styles.heroPulseDot} />
                <Text style={styles.heroPulseText}>Aktif</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.heroSub}>
            {totalPending > 0
              ? 'Başvuru, stok, harcama, bildirim ve sözleşmeler tek akışta. Karta dokunarak onaylayın.'
              : 'Şu an bekleyen kayıt yok. Yeni talepler burada görünecek.'}
          </Text>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={adminTheme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="İsim, ürün, tutar veya işletme ara…"
            placeholderTextColor={adminTheme.colors.textMuted}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kindStatRow}
          style={styles.kindStatScroll}
        >
          <TouchableOpacity
            style={[styles.kindStatCard, kindFilter === 'all' && styles.kindStatCardActive]}
            onPress={() => setKindFilter('all')}
            activeOpacity={0.85}
          >
            <View style={[styles.kindStatIcon, { backgroundColor: '#e2e8f0' }]}>
              <Ionicons name="layers-outline" size={20} color={adminTheme.colors.primary} />
            </View>
            <Text style={styles.kindStatCount}>{totalPending}</Text>
            <Text style={styles.kindStatLabel}>Tümü</Text>
          </TouchableOpacity>
          {KIND_ORDER.map((k) => {
            const meta = KIND_META[k];
            const active = kindFilter === k;
            return (
              <TouchableOpacity
                key={k}
                style={[styles.kindStatCard, active && styles.kindStatCardActive, active && { borderColor: meta.color }]}
                onPress={() => setKindFilter((prev) => (prev === k ? 'all' : k))}
                activeOpacity={0.85}
              >
                <LinearGradient colors={meta.grad} style={styles.kindStatIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name={meta.icon} size={18} color="#fff" />
                </LinearGradient>
                <Text style={[styles.kindStatCount, { color: meta.color }]}>{counts[k]}</Text>
                <Text style={styles.kindStatLabel}>{meta.shortLabel}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.listSectionHead}>
          <Text style={styles.listSectionTitle}>
            {kindFilter === 'all' ? 'Bekleyen işlemler' : KIND_META[kindFilter].label}
          </Text>
          <Text style={styles.listSectionMeta}>
            {filteredItems.length === visibleItems.length
              ? `${filteredItems.length} kayıt`
              : `${filteredItems.length} / ${visibleItems.length}`}
          </Text>
        </View>

        {showListSkeleton ? (
          <>
            {[0, 1, 2].map((i) => (
              <View key={`sk-${i}`} style={styles.skeletonCard}>
                <View style={styles.skeletonIcon} />
                <View style={styles.skeletonBody}>
                  <View style={[styles.skeletonLine, { width: '40%' }]} />
                  <View style={[styles.skeletonLine, { width: '85%', marginTop: 10 }]} />
                  <View style={[styles.skeletonLine, { width: '65%', marginTop: 8 }]} />
                </View>
              </View>
            ))}
          </>
        ) : visibleItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color="#0f766e" />
            </View>
            <Text style={styles.emptyTitle}>Bekleyen onay yok</Text>
            <Text style={styles.emptySub}>Personel başvurusu, stok hareketi veya harcama geldiğinde bu listede görünür.</Text>
          </View>
        ) : filteredItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="search-outline" size={40} color={adminTheme.colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>Sonuç bulunamadı</Text>
            <Text style={styles.emptySub}>Arama veya filtre kriterlerini değiştirmeyi deneyin.</Text>
            <TouchableOpacity
              style={styles.emptyResetBtn}
              onPress={() => {
                setSearchQuery('');
                setKindFilter('all');
              }}
            >
              <Text style={styles.emptyResetBtnText}>Filtreleri temizle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredItems.map((it, idx) => {
            const meta = KIND_META[it.kind];
            const isUrgent = Date.now() - new Date(it.created_at).getTime() > 48 * 60 * 60 * 1000;
            return (
              <TouchableOpacity
                key={`${it.kind}-${it.id}`}
                style={[styles.itemCard, idx === 0 && styles.itemCardFirst]}
                onPress={() => setDetail(it)}
                activeOpacity={0.88}
              >
                <LinearGradient colors={meta.grad} style={styles.itemIconGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name={meta.icon} size={22} color="#fff" />
                </LinearGradient>
                <View style={styles.itemBody}>
                  <View style={styles.itemHead}>
                    <View style={[styles.kindPill, { backgroundColor: meta.bg }]}>
                      <Text style={[styles.kindPillText, { color: meta.color }]}>{meta.shortLabel}</Text>
                    </View>
                    <Text style={styles.itemDate}>{relativeTimeTr(it.created_at)}</Text>
                    {isUrgent ? (
                      <View style={styles.urgentPill}>
                        <Text style={styles.urgentPillText}>48s+</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {it.title}
                  </Text>
                  {it.orgLine ? (
                    <View style={styles.orgBadge}>
                      <Ionicons name="business-outline" size={12} color={adminTheme.colors.accent} />
                      <Text style={styles.orgBadgeText} numberOfLines={1}>
                        {it.orgLine}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {it.fromLine}
                  </Text>
                  <Text style={styles.itemWhy} numberOfLines={2}>
                    {it.whyLine}
                  </Text>
                </View>
                <View style={styles.itemChevronWrap}>
                  <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {detail && detailMeta ? (
              <>
                <View style={styles.modalHandle} />
                <LinearGradient colors={detailMeta.grad} style={styles.modalHero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <View style={styles.modalHeroIcon}>
                    <Ionicons name={detailMeta.icon} size={24} color="#fff" />
                  </View>
                  <View style={styles.modalHeroText}>
                    <Text style={styles.modalHeroKind}>{detailMeta.label}</Text>
                    <Text style={styles.modalHeroTime}>{relativeTimeTr(detail.created_at)}</Text>
                  </View>
                  <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setDetail(null)} hitSlop={12}>
                    <Ionicons name="close" size={22} color="#fff" />
                  </TouchableOpacity>
                </LinearGradient>
                <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
                  <Text style={styles.modalH1}>{detail.title}</Text>
                  {detail.orgLine ? (
                    <View style={styles.modalOrgRow}>
                      <Ionicons name="business-outline" size={16} color={adminTheme.colors.accent} />
                      <Text style={styles.modalOrgText}>{detail.orgLine}</Text>
                    </View>
                  ) : null}
                  <View style={styles.modalInfoCard}>
                    <View style={styles.modalInfoRow}>
                      <Ionicons name="person-outline" size={16} color={adminTheme.colors.textMuted} />
                      <Text style={styles.modalInfoText}>{detail.fromLine}</Text>
                    </View>
                    <View style={[styles.modalInfoRow, styles.modalInfoRowLast]}>
                      <Ionicons name="information-circle-outline" size={16} color={adminTheme.colors.textMuted} />
                      <Text style={styles.modalInfoText}>{detail.whyLine}</Text>
                    </View>
                  </View>
                  {detail.extraLines.length > 0 ? (
                    <View style={styles.modalExtras}>
                      {detail.extraLines.map((line, i) => (
                        <Text key={i} style={styles.modalExtra}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {stockPhotos(detail)}
                  {acting ? (
                    <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 12 }} />
                  ) : null}
                  {renderDetailActions()}
                  <View style={{ height: 24 }} />
                </ScrollView>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const cardShadow = (Platform.OS === 'ios' ? adminTheme.shadow.md : { elevation: 3 }) as ViewStyle;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingHint: { fontSize: 14, color: adminTheme.colors.textMuted },
  scrollContent: { padding: 16, paddingBottom: 48 },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  syncBannerText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  skeletonCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    marginBottom: 10,
    borderRadius: adminTheme.radius.lg,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  skeletonIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  skeletonBody: { flex: 1 },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  hero: {
    borderRadius: adminTheme.radius.xl,
    padding: 18,
    marginBottom: 14,
    ...cardShadow,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  heroIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroKicker: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 },
  heroCountRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  heroCount: { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  heroCountUnit: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  heroPulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  heroPulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  heroPulseText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 19, marginTop: 12 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    marginBottom: 12,
    ...adminTheme.shadow.sm,
  },
  searchInput: { flex: 1, fontSize: 15, color: adminTheme.colors.text, padding: 0 },
  kindStatScroll: { marginHorizontal: -16, marginBottom: 14 },
  kindStatRow: { paddingHorizontal: 16, gap: 10 },
  kindStatCard: {
    width: 88,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: adminTheme.radius.lg,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    ...adminTheme.shadow.sm,
  },
  kindStatCardActive: {
    borderColor: adminTheme.colors.primary,
    backgroundColor: '#f8fafc',
  },
  kindStatIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kindStatIconGrad: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kindStatCount: { fontSize: 20, fontWeight: '900', color: adminTheme.colors.text },
  kindStatLabel: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted, marginTop: 2 },
  listSectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  listSectionTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  listSectionMeta: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted },
  emptyCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.xl,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...cardShadow,
  },
  emptyIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  emptySub: { fontSize: 14, color: adminTheme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  emptyResetBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.primary,
  },
  emptyResetBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    marginBottom: 10,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...cardShadow,
  },
  itemCardFirst: {
    borderColor: 'rgba(15,118,110,0.35)',
  },
  itemIconGrad: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, minWidth: 0 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  kindPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kindPillText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  itemDate: { fontSize: 11, fontWeight: '600', color: adminTheme.colors.textMuted },
  urgentPill: {
    backgroundColor: adminTheme.colors.errorLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  urgentPillText: { fontSize: 9, fontWeight: '800', color: adminTheme.colors.error },
  itemTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, lineHeight: 21 },
  orgBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(180,83,9,0.1)',
  },
  orgBadgeText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.accent, maxWidth: 200 },
  itemMeta: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4 },
  itemWhy: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 3, lineHeight: 17 },
  itemChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: '95%',
    flex: 1,
    overflow: 'hidden',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: adminTheme.colors.border,
    marginTop: 10,
    marginBottom: 4,
  },
  modalHero: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  modalHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeroText: { flex: 1, minWidth: 0 },
  modalHeroKind: { fontSize: 15, fontWeight: '800', color: '#fff' },
  modalHeroTime: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScroll: { paddingHorizontal: 16, paddingTop: 16, flex: 1 },
  modalScrollContent: { paddingBottom: 40 },
  modalH1: { fontSize: 22, fontWeight: '900', color: adminTheme.colors.text, marginBottom: 10, letterSpacing: -0.3 },
  modalOrgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: adminTheme.colors.warningLight,
    borderRadius: 10,
  },
  modalOrgText: { flex: 1, fontSize: 13, fontWeight: '700', color: adminTheme.colors.accent },
  modalInfoCard: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderRadius: adminTheme.radius.lg,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  modalInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  modalInfoRowLast: { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
  modalInfoText: { flex: 1, fontSize: 14, color: adminTheme.colors.text, lineHeight: 20 },
  modalExtras: {
    marginBottom: 12,
    paddingLeft: 4,
  },
  modalExtra: { fontSize: 13, color: adminTheme.colors.textSecondary, marginBottom: 4, lineHeight: 18 },
  photoRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  thumb: { width: 88, height: 88, borderRadius: 10 },
  rowBtns: { gap: 10, marginTop: 16 },
  primaryBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  dangerBtn: {
    backgroundColor: adminTheme.colors.error,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  secondaryBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  secondaryBtnText: { color: adminTheme.colors.primary, fontWeight: '700', fontSize: 15 },
  contractDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 18,
  },
  contractGuestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    marginBottom: 14,
  },
  contractGuestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractGuestInfo: { flex: 1 },
  contractGuestName: { fontSize: 16, fontWeight: '800', color: '#1e1b4b' },
  contractGuestMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  contractGuestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#ede9fe',
  },
  contractGuestBadgeText: { fontSize: 11, fontWeight: '700', color: '#7c3aed' },
  contractSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 14,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  contractStep: { alignItems: 'center', gap: 4 },
  contractStepDone: {},
  contractStepActive: {},
  contractStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractStepDotActive: {
    backgroundColor: '#7c3aed',
  },
  contractStepDotDone: {
    backgroundColor: '#16a34a',
  },
  contractStepNum: { fontSize: 10, fontWeight: '800', color: '#94a3b8' },
  contractStepLabel: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  contractStepLabelDone: { color: '#16a34a' },
  contractStepLine: {
    width: 32,
    height: 2,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 8,
    borderRadius: 1,
  },
  contractStepLineDone: { backgroundColor: '#16a34a' },
  contractSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    gap: 12,
    ...((Platform.OS === 'ios' ? { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8 } : { elevation: 1 }) as ViewStyle),
  },
  contractSectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  contractSectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contractSectionCardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  contractSectionDoneBadge: { marginLeft: 'auto' },
  contractNoGuestCard: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contractNoGuestText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  contractActionBar: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  contractFullListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#faf5ff',
    borderWidth: 1,
    borderColor: '#e9d5ff',
    marginTop: 12,
  },
  contractFullListBtnText: { fontSize: 14, fontWeight: '600', color: '#7c3aed' },
  contractAssignHint: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    lineHeight: 19,
    marginBottom: 8,
  },
  contractEmptyStaff: { fontSize: 14, color: adminTheme.colors.textMuted, marginVertical: 12 },
  staffPickScroll: { maxHeight: 400, marginTop: 4 },
  staffPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  staffPickRowDisabled: { opacity: 0.55 },
  staffPickAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ede9fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffPickAvatarText: { fontSize: 14, fontWeight: '800', color: '#7c3aed' },
  staffPickTextCol: { flex: 1, minWidth: 0 },
  staffPickName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  staffPickDept: { fontSize: 12, color: '#64748b', marginTop: 2 },
  staffPickArrow: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#faf5ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomList: {
    gap: 8,
    marginTop: 8,
  },
  roomListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  roomListItemSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
    ...((Platform.OS === 'ios' ? { shadowColor: '#16a34a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 } : { elevation: 3 }) as ViewStyle),
  },
  roomCardUnavailable: {
    opacity: 0.5,
  },
  roomListNumber: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomListNumberSelected: {
    backgroundColor: '#dcfce7',
  },
  roomListNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1e293b',
  },
  roomListNumberTextSelected: {
    color: '#166534',
  },
  roomListBody: {
    flex: 1,
    gap: 2,
  },
  roomListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  roomListTitleSelected: {
    color: '#166534',
  },
  roomListMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roomListFloor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  roomListPrice: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  roomListStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roomListRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5e1',
  },
  roomCardStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roomCardStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  contractPriceRow: {
    flexDirection: 'row',
    gap: 12,
  },
  contractPriceField: {
    flex: 1,
    gap: 6,
  },
  contractPriceSummary: {
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#86efac',
    gap: 4,
  },
  contractPriceSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contractPriceSummaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#166534',
  },
  contractPriceSummaryValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#166534',
  },
  contractPriceSummaryNote: {
    fontSize: 11,
    color: '#4ade80',
    fontWeight: '500',
  },
  contractPriceSummaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  contractPreviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  contractPreviewBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563eb',
  },
  contractCheckinBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#0f766e',
    ...((Platform.OS === 'ios' ? { shadowColor: '#0f766e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 } : { elevation: 4 }) as ViewStyle),
  },
  contractCheckinBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  contractFieldSection: {
    marginTop: 14,
    gap: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: adminTheme.colors.borderLight,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#7c3aed',
    backgroundColor: '#f5f3ff',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
  },
  chipTextActive: {
    color: '#7c3aed',
    fontWeight: '700',
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.textSecondary },
  textInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 16,
    color: adminTheme.colors.text,
    backgroundColor: adminTheme.colors.surface,
  },
});
