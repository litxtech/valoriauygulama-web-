import { useCallback, useEffect, useMemo, useState, type ComponentProps } from 'react';
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { sendNotification } from '@/lib/notificationService';
import { formatDateShort } from '@/lib/date';
import { VAT_RATE, ACCOMMODATION_TAX_RATE } from '@/constants/hmbHotel';
import { GUEST_TYPES, GUEST_MESSAGE_TEMPLATES } from '@/lib/notifications';
import { useAdminOrgStore } from '@/stores/adminOrgStore';

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
  extraLines: string[];
  raw: unknown;
};

const KIND_META: Record<Kind, { label: string; color: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  staff_app: { label: 'Personel başvurusu', color: '#2563eb', icon: 'person-add-outline' },
  stock: { label: 'Stok onayı', color: '#16a34a', icon: 'cube-outline' },
  expense: { label: 'Harcama', color: '#ca8a04', icon: 'wallet-outline' },
  report: { label: 'Paylaşım bildirimi', color: '#dc2626', icon: 'flag-outline' },
  contract: { label: 'Sözleşme (check-in bekliyor)', color: '#7c3aed', icon: 'document-text-outline' },
};

const ROOM_STATUS_LABELS: Record<string, string> = {
  available: 'Müsait',
  occupied: 'Dolu',
  cleaning: 'Temizlik',
  maintenance: 'Bakım',
  out_of_order: 'Kullanılmıyor',
};

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

export default function AdminApprovalsHubScreen() {
  const router = useRouter();
  const { staff: me } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();
  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
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

  const load = useCallback(async () => {
    const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
    const orgId = canUseAll ? selectedOrganizationId : me?.organization_id;
    const orgScoped = orgId && orgId !== 'all' ? orgId : null;
    let appsQuery = supabase
      .from('staff_applications')
      .select('id, full_name, email, phone, applied_department, experience, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (orgScoped) appsQuery = appsQuery.eq('organization_id', orgScoped);
    let stocksQuery = supabase
      .from('stock_movements')
      .select('id, product_id, movement_type, quantity, staff_image, photo_proof, notes, created_at, product:stock_products(name, unit, current_stock), staff:staff_id(full_name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (orgScoped) stocksQuery = stocksQuery.eq('organization_id', orgScoped);
    let expensesQuery = supabase
      .from('staff_expenses')
      .select(
        'id, amount, description, status, expense_date, created_at, staff_id, staff:staff_id(full_name, department), category:category_id(name)'
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(100);
    if (orgScoped) expensesQuery = expensesQuery.eq('organization_id', orgScoped);
    let contractsQuery = supabase
      .from('contract_acceptances')
      .select('id, token, room_id, contract_lang, accepted_at, guest_id, guests(full_name), rooms(room_number)')
      .is('assigned_staff_id', null)
      .order('accepted_at', { ascending: false })
      .limit(100);
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
          'id, post_id, reporter_staff_id, reporter_guest_id, reason, details, status, created_at, feed_posts(id, title, media_type), staff!reporter_staff_id(id, full_name, department), guests!reporter_guest_id(id, full_name)'
        )
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(100),
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
        extraLines: [
          r.phone ? `Tel: ${r.phone}` : '',
          r.experience ? `Deneyim: ${r.experience}` : '',
        ].filter(Boolean),
        raw: r,
      });
    }

    for (const m of (stocks.data ?? []) as unknown as Movement[]) {
      const prod = m.product as { name?: string; unit?: string | null } | null;
      const st = m.staff as { full_name?: string } | null;
      list.push({
        kind: 'stock',
        id: m.id,
        created_at: m.created_at,
        title: `${m.movement_type === 'in' ? 'Giriş' : 'Çıkış'} · ${prod?.name ?? 'Ürün'}`,
        fromLine: `Personel: ${st?.full_name ?? '—'}`,
        whyLine: `Miktar: ${m.movement_type === 'in' ? '+' : '-'}${m.quantity} ${prod?.unit ?? 'adet'}`,
        extraLines: [m.notes ? `Not: ${m.notes}` : ''].filter(Boolean),
        raw: m,
      });
    }

    for (const e of (expenses.data ?? []) as unknown as ExpenseRow[]) {
      const s = e.staff as { full_name?: string; department?: string } | null;
      list.push({
        kind: 'expense',
        id: e.id,
        created_at: e.created_at ?? e.expense_date,
        title: fmtMoney(Number(e.amount)),
        fromLine: `Personel: ${s?.full_name ?? '—'} (${s?.department ?? '—'})`,
        whyLine: `Tarih: ${formatDateShort(e.expense_date)} · Kategori: ${e.category?.name ?? '—'}`,
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
        extraLines: [r.details ? `Detay: ${r.details}` : ''].filter(Boolean),
        raw: r,
      });
    }

    for (const c of contracts.data ?? []) {
      const row = c as unknown as ContractApprovalRow;
      const g = Array.isArray(row.guests) ? row.guests[0] : row.guests;
      const rm = row.rooms;
      const roomObj = Array.isArray(rm) ? rm[0] : rm;
      const roomLabel = row.room_id ? roomObj?.room_number ?? '—' : null;
      list.push({
        kind: 'contract',
        id: row.id,
        created_at: row.accepted_at,
        title: `Sözleşme · ${row.contract_lang?.toUpperCase() ?? ''}`,
        fromLine: `İmzalayan: ${g?.full_name ?? '—'}`,
        whyLine: row.guest_id
          ? 'Check-in tamamlanmadı: oda ve maliye bilgisini buradan girebilir veya personele devredebilirsiniz.'
          : 'Misafir kaydı yok; sorumlu personel ataması yapılabilir.',
        extraLines: [
          `Token: ${row.token.slice(0, 12)}…`,
          ...(roomLabel != null ? [`Oda: ${roomLabel}`] : []),
        ],
        raw: row,
      });
    }

    list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(list);
  }, [me?.app_permissions?.super_admin, me?.organization_id, selectedOrganizationId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

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
    void supabase
      .from('rooms')
      .select('id, room_number, floor, status, price_per_night')
      .order('room_number')
      .then(({ data, error }) => {
        setContractRoomsLoading(false);
        if (!error) setContractRooms((data ?? []) as ContractRoomRow[]);
      });
    const row = detail.raw as ContractApprovalRow;
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
    await load();
    setRefreshing(false);
  };

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

      const { error: gErr } = await supabase
        .from('guests')
        .update({
          room_id: roomId,
          status: 'checked_in',
          check_in_at: new Date().toISOString(),
          total_amount_net: totalNet,
          vat_amount: vatAmount,
          accommodation_tax_amount: accommodationTaxAmount,
          nights_count: nights,
        })
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

  const counts = useMemo(() => {
    const c: Record<Kind, number> = {
      staff_app: 0,
      stock: 0,
      expense: 0,
      report: 0,
      contract: 0,
    };
    for (const i of items) c[i.kind]++;
    return c;
  }, [items]);

  const renderDetailActions = () => {
    if (!detail || !me) return null;
    switch (detail.kind) {
      case 'staff_app':
        return (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => {
              setDetail(null);
              router.push({ pathname: '/admin/staff/approve/[id]', params: { id: detail.id } });
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
        return (
          <View style={styles.rowBtns}>
            {hasGuest ? (
              <>
                <Text style={styles.contractAssignHint}>
                  Odayı seçin; gece başı fiyat ve gece sayısını yönetici/yetkili elle girer (oda liste fiyatı otomatik
                  doldurulmaz). İsterseniz önce önizleme bağlayın, ardından check-in tamamlayın.
                </Text>
                {contractRoomsLoading ? (
                  <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginVertical: 12 }} />
                ) : contractRooms.length === 0 ? (
                  <Text style={styles.contractEmptyStaff}>Tanımlı oda yok.</Text>
                ) : (
                  <ScrollView
                    style={styles.roomPickScroll}
                    nestedScrollEnabled
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    {contractRooms.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={[
                          styles.roomPickRow,
                          contractSelectedRoomId === r.id && styles.roomPickRowSelected,
                          acting && styles.staffPickRowDisabled,
                        ]}
                        onPress={() => {
                          setContractSelectedRoomId(r.id);
                        }}
                        disabled={acting}
                        activeOpacity={0.75}
                      >
                        <Ionicons name="bed-outline" size={22} color={adminTheme.colors.primaryMuted} />
                        <View style={styles.staffPickTextCol}>
                          <Text style={styles.staffPickName}>Oda {r.room_number}</Text>
                          {r.floor != null ? <Text style={styles.staffPickDept}>Kat {r.floor}</Text> : null}
                        </View>
                        <View style={[styles.roomStatusMini, { backgroundColor: r.status === 'available' ? adminTheme.colors.successLight : adminTheme.colors.surfaceTertiary }]}>
                          <Text style={styles.roomStatusMiniText}>{ROOM_STATUS_LABELS[r.status] ?? r.status}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                {contractSelectedRoomId ? (
                  <View style={styles.contractPriceBlock}>
                    <Text style={styles.inputLabel}>Gece başı fiyat (₺)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={contractPriceInput}
                      onChangeText={setContractPriceInput}
                      keyboardType="decimal-pad"
                      placeholder="Örn. 1500"
                      placeholderTextColor={adminTheme.colors.textMuted}
                      editable={!acting}
                    />
                    <Text style={styles.inputLabel}>Gece sayısı</Text>
                    <TextInput
                      style={styles.textInput}
                      value={contractNightsInput}
                      onChangeText={setContractNightsInput}
                      keyboardType="number-pad"
                      placeholder="Örn. 3"
                      placeholderTextColor={adminTheme.colors.textMuted}
                      editable={!acting}
                    />
                    <TouchableOpacity
                      style={[styles.secondaryBtn, { marginTop: 8 }]}
                      onPress={() => linkContractRoomPreview(row)}
                      disabled={acting}
                    >
                      <Text style={styles.secondaryBtnText}>Seçili odayı önizleme olarak bağla</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryBtn} onPress={() => completeContractCheckIn(row)} disabled={acting}>
                      <Text style={styles.primaryBtnText}>Check-in yap ve kaydı kapat</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={styles.contractAssignHint}>
                Bu onayda misafir kaydı yok; oda ataması yapılamaz. İsterseniz süreci bir personele devredebilirsiniz.
              </Text>
            )}
            <Text style={[styles.contractAssignHint, { marginTop: 14 }]}>Personele devret (personel uygulamasında oda atar):</Text>
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
                    <Ionicons name="person-circle-outline" size={22} color={adminTheme.colors.primaryMuted} />
                    <View style={styles.staffPickTextCol}>
                      <Text style={styles.staffPickName}>{s.full_name ?? s.id.slice(0, 8)}</Text>
                      {s.department ? <Text style={styles.staffPickDept}>{s.department}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => {
                setDetail(null);
                router.push('/admin/contracts/acceptances' as never);
              }}
            >
              <Text style={styles.secondaryBtnText}>Sözleşme onayları — tam liste, PDF, detay</Text>
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
    const u1 = m.staff_image;
    const u2 = m.photo_proof;
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
      >
        <AdminOrganizationPicker
          canUseAll={me?.app_permissions?.super_admin === true || me?.role === 'admin'}
          ownOrganizationId={me?.organization_id}
        />
        <AdminCard padded>
          <Text style={styles.lead}>
            Bekleyen personel başvuruları, stok hareketleri, harcamalar, paylaşım bildirimleri ve check-in bekleyen sözleşme onayları tek
            listede. Bir satıra dokunun; kaynağı, kim ve neden bilgisini görün, uygun aksiyonu seçin.
          </Text>
          <View style={styles.chipRow}>
            {(['staff_app', 'stock', 'expense', 'report', 'contract'] as Kind[]).map((k) => (
              <View key={k} style={[styles.chip, { borderColor: KIND_META[k].color }]}>
                <Text style={[styles.chipText, { color: KIND_META[k].color }]}>
                  {KIND_META[k].label}: {counts[k]}
                </Text>
              </View>
            ))}
          </View>
        </AdminCard>

        {items.length === 0 ? (
          <AdminCard padded>
            <Text style={styles.empty}>Şu an onay bekleyen kayıt yok.</Text>
          </AdminCard>
        ) : (
          items.map((it) => {
            const meta = KIND_META[it.kind];
            return (
              <TouchableOpacity key={`${it.kind}-${it.id}`} style={styles.itemCard} onPress={() => setDetail(it)} activeOpacity={0.85}>
                <View style={[styles.kindBar, { backgroundColor: meta.color }]} />
                <View style={styles.itemBody}>
                  <View style={styles.itemHead}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                    <Text style={styles.kindLabel}>{meta.label}</Text>
                    <Text style={styles.itemDate}>{new Date(it.created_at).toLocaleString('tr-TR')}</Text>
                  </View>
                  <Text style={styles.itemTitle} numberOfLines={2}>
                    {it.title}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={2}>
                    {it.fromLine}
                  </Text>
                  <Text style={styles.itemWhy} numberOfLines={2}>
                    {it.whyLine}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} style={styles.chevron} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!detail} animationType="slide" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            {detail ? (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{KIND_META[detail.kind].label}</Text>
                  <TouchableOpacity onPress={() => setDetail(null)} hitSlop={12}>
                    <Ionicons name="close" size={26} color={adminTheme.colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalH1}>{detail.title}</Text>
                  <Text style={styles.modalLine}>{detail.fromLine}</Text>
                  <Text style={styles.modalLine}>{detail.whyLine}</Text>
                  {detail.extraLines.map((line, i) => (
                    <Text key={i} style={styles.modalExtra}>
                      {line}
                    </Text>
                  ))}
                  {stockPhotos(detail)}
                  {renderDetailActions()}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  lead: { fontSize: 14, color: adminTheme.colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: adminTheme.colors.surface,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, paddingVertical: 12 },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...((Platform.OS === 'ios' ? adminTheme.shadow.sm : { elevation: 2 }) as ViewStyle),
  },
  kindBar: { width: 4 },
  itemBody: { flex: 1, padding: 12, minWidth: 0 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  kindLabel: { flex: 1, fontSize: 12, fontWeight: '800', color: adminTheme.colors.textMuted },
  itemDate: { fontSize: 11, color: adminTheme.colors.textMuted },
  itemTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  itemMeta: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4 },
  itemWhy: { fontSize: 13, color: adminTheme.colors.text, marginTop: 2 },
  chevron: { alignSelf: 'center', paddingRight: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '88%',
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: adminTheme.colors.text },
  modalScroll: { paddingHorizontal: 16, paddingTop: 12 },
  modalH1: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 10 },
  modalLine: { fontSize: 15, color: adminTheme.colors.text, marginBottom: 8, lineHeight: 22 },
  modalExtra: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 6 },
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
  contractAssignHint: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    lineHeight: 19,
    marginBottom: 8,
  },
  contractEmptyStaff: { fontSize: 14, color: adminTheme.colors.textMuted, marginVertical: 12 },
  staffPickScroll: { maxHeight: 280, marginTop: 4 },
  staffPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 8,
  },
  staffPickRowDisabled: { opacity: 0.55 },
  staffPickTextCol: { flex: 1, minWidth: 0 },
  staffPickName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  staffPickDept: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  roomPickScroll: { maxHeight: 200, marginTop: 4 },
  roomPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    marginBottom: 8,
  },
  roomPickRowSelected: {
    borderColor: adminTheme.colors.accent,
    backgroundColor: adminTheme.colors.warningLight,
  },
  roomStatusMini: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roomStatusMiniText: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.text },
  contractPriceBlock: { marginTop: 12, gap: 8 },
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
