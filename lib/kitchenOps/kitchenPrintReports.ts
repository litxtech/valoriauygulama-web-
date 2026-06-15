import { supabase } from '@/lib/supabase';
import { fetchKitchenItems, fetchDaySummary, fetchCariNetBalance } from './api';
import { KITCHEN_LOW_STOCK_THRESHOLD } from './constants';
import {
  fmtKitchenMoney,
  fmtKitchenQty,
  getEffectiveKitchenMinimum,
  getKitchenStockPrintAction,
  getKitchenStockPrintRowClass,
  getKitchenStockStatus,
  isKitchenStockLow,
  KITCHEN_STOCK_STATUS_COLORS,
} from './stockStatus';
import { KITCHEN_CARI_DIRECTIONS, KITCHEN_PAYMENT_TYPES, KITCHEN_PERSONNEL_PAYMENT_TYPES, KITCHEN_POS_STATUSES } from './constants';
import {
  buildKitchenPrintHtml,
  KITCHEN_PRINT_DEPT,
  KITCHEN_PRINT_HOTEL,
  type KitchenPrintInput,
  type KitchenPrintRow,
} from './kitchenPrintHtml';
import { formatDateShort, formatTime } from '@/lib/date';
import { listMissingItemReports } from '@/lib/missingItems';
import type { MissingItemArea } from '@/lib/missingItemsCatalog';

const PRINT_LIMIT = 500;

export type KitchenPrintReportKind =
  | 'stock_all'
  | 'stock_low'
  | 'cari_all'
  | 'cari_debt'
  | 'cari_receivable'
  | 'cari_weekly'
  | 'supplier_debts'
  | 'settlements'
  | 'expenses'
  | 'revenue'
  | 'personnel'
  | 'pos'
  | 'finance_daily'
  | 'day_close'
  | 'shortages_open'
  | 'shortages_resolved'
  | 'hotel_shortages_open'
  | 'hotel_shortages_resolved'
  | 'handover_list';

export const KITCHEN_PRINT_REPORT_TITLES: Record<KitchenPrintReportKind, string> = {
  stock_all: 'Stok listesi',
  stock_low: 'Kritik / düşük stok',
  cari_all: 'Cari hareket listesi (toplu)',
  cari_debt: 'Cari borç listesi',
  cari_receivable: 'Cari alacak listesi',
  cari_weekly: 'Haftalık cari özeti',
  supplier_debts: 'Tedarikçi borç listesi',
  settlements: 'Mahsup / ödeme listesi',
  expenses: 'Gider listesi',
  revenue: 'Hasılat listesi',
  personnel: 'Personel ödeme listesi',
  pos: 'POS işlem listesi',
  finance_daily: 'Günlük finans özeti',
  day_close: 'Gün sonu özeti',
  shortages_open: 'Mutfak açık eksik listesi',
  shortages_resolved: 'Mutfak giderilen eksikler',
  hotel_shortages_open: 'Otel açık eksik listesi',
  hotel_shortages_resolved: 'Otel giderilen eksikler',
  handover_list: 'Mutfak teslim kayıtları',
};

export type KitchenPrintPayload = {
  html: string;
  fileName: string;
  subject: string;
  landscape?: boolean;
};

function nowMeta(): { label: string; value: string }[] {
  const d = new Date();
  return [
    { label: 'Tarih', value: formatDateShort(d) },
    { label: 'Saat', value: d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) },
  ];
}

function payloadFromInput(input: KitchenPrintInput, kind: KitchenPrintReportKind): KitchenPrintPayload {
  const title = KITCHEN_PRINT_REPORT_TITLES[kind];
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = kind.replace(/_/g, '-');
  return {
    html: buildKitchenPrintHtml(input),
    fileName: `valoria-mutfak-${slug}-${stamp}.pdf`,
    subject: `${KITCHEN_PRINT_HOTEL} — ${KITCHEN_PRINT_DEPT} — ${title}`,
    landscape: input.landscape,
  };
}

const CARI_DIR_LABELS = Object.fromEntries(KITCHEN_CARI_DIRECTIONS.map((d) => [d.value, d.label]));
const PAY_LABELS = Object.fromEntries(KITCHEN_PAYMENT_TYPES.map((p) => [p.value, p.label]));
const PERSONNEL_LABELS = Object.fromEntries(KITCHEN_PERSONNEL_PAYMENT_TYPES.map((p) => [p.value, p.label]));
const POS_LABELS = Object.fromEntries(KITCHEN_POS_STATUSES.map((s) => [s.value, s.label]));
const SUPPLIER_STATUS: Record<string, string> = { pending: 'Bekliyor', partial: 'Kısmi', paid: 'Ödendi', overdue: 'Gecikti' };

export async function buildKitchenPrintReport(kind: KitchenPrintReportKind): Promise<KitchenPrintPayload> {
  switch (kind) {
    case 'stock_all':
      return buildStockReport(false);
    case 'stock_low':
      return buildStockReport(true);
    case 'cari_all':
      return buildCariReport('all');
    case 'cari_debt':
      return buildCariReport('kitchen_owes_hotel');
    case 'cari_receivable':
      return buildCariReport('hotel_owes_kitchen');
    case 'cari_weekly':
      return buildCariWeeklyReport();
    case 'supplier_debts':
      return buildSupplierDebtsReport();
    case 'settlements':
      return buildSettlementsReport();
    case 'expenses':
      return buildExpensesReport();
    case 'revenue':
      return buildRevenueReport();
    case 'personnel':
      return buildPersonnelReport();
    case 'pos':
      return buildPosReport();
    case 'finance_daily':
    case 'day_close':
      return buildFinanceReport(kind);
    case 'handover_list':
      return buildHandoverListReport();
    case 'shortages_open':
      return buildShortagesReport('kitchen', 'open');
    case 'shortages_resolved':
      return buildShortagesReport('kitchen', 'resolved');
    case 'hotel_shortages_open':
      return buildShortagesReport('hotel', 'open');
    case 'hotel_shortages_resolved':
      return buildShortagesReport('hotel', 'resolved');
    default:
      throw new Error('Bilinmeyen rapor türü');
  }
}

const SHORTAGE_PRIORITY: Record<string, string> = { low: 'Düşük', medium: 'Normal', high: 'Acil' };

async function buildShortagesReport(area: MissingItemArea, status: 'open' | 'resolved'): Promise<KitchenPrintPayload> {
  const { data, error } = await listMissingItemReports(area, status);
  if (error) throw new Error(error);

  const rows: KitchenPrintRow[] = [];
  for (const report of data) {
    const repName =
      (report.creator as { full_name: string | null } | null | undefined)?.full_name ?? '—';
    const when = `${formatDateShort(report.created_at)} ${formatTime(report.created_at)}`;
    const priority = SHORTAGE_PRIORITY[report.priority] ?? report.priority;
    const note = report.note?.trim() || '—';
    const items = report.items ?? [];

    if (items.length === 0) {
      rows.push({
        date: when,
        reporter: repName,
        item: `(${report.item_count} kalem)`,
        priority,
        note,
        status: status === 'open' ? 'Tedarik et' : 'Giderildi',
        __rowClass: status === 'open' ? 'row-low' : undefined,
      });
      continue;
    }

    for (const line of items) {
      rows.push({
        date: when,
        reporter: repName,
        item: line.title,
        priority,
        note,
        status: line.status === 'resolved' ? 'Giderildi' : 'Tedarik et',
        __rowClass: line.status === 'open' ? 'row-low' : undefined,
      });
    }
  }

  const isHotel = area === 'hotel';
  const kind: KitchenPrintReportKind =
    status === 'open'
      ? isHotel
        ? 'hotel_shortages_open'
        : 'shortages_open'
      : isHotel
        ? 'hotel_shortages_resolved'
        : 'shortages_resolved';

  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES[kind],
      subtitle:
        status === 'open'
          ? isHotel
            ? 'Onaylanmış açık otel eksik listesi — tedarik gerekli kalemler kırmızı'
            : 'Onaylanmış açık mutfak eksik listesi — tedarik gerekli kalemler kırmızı'
          : isHotel
            ? 'Giderilmiş otel eksik listeleri'
            : 'Giderilmiş mutfak eksik listeleri',
      brandDepartment: isHotel ? 'Otel Operasyon' : KITCHEN_PRINT_DEPT,
      footerTag: isHotel ? 'Otel' : 'Mutfak',
      meta: [...nowMeta(), { label: 'Kayıt / kalem', value: String(rows.length) }],
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'reporter', label: 'Bildiren', width: '14%' },
        { key: 'item', label: 'Eksik', width: '28%' },
        { key: 'priority', label: 'Öncelik', width: '10%' },
        { key: 'status', label: 'Durum', width: '12%' },
        { key: 'note', label: 'Not', width: '22%' },
      ],
      rows,
      landscape: true,
      emptyMessage:
        status === 'open'
          ? isHotel
            ? 'Açık otel eksik listesi yok.'
            : 'Açık mutfak eksik listesi yok.'
          : isHotel
            ? 'Giderilmiş otel eksik kaydı yok.'
            : 'Giderilmiş eksik kaydı yok.',
    },
    kind
  );
}

async function buildStockReport(lowOnly: boolean): Promise<KitchenPrintPayload> {
  const allItems = await fetchKitchenItems();
  const items = lowOnly ? allItems.filter(isKitchenStockLow) : allItems;
  const lowCount = allItems.filter(isKitchenStockLow).length;
  const rows: KitchenPrintRow[] = items.map((i) => {
    const st = getKitchenStockStatus(i);
    const cat = i.category && typeof i.category === 'object' && 'name' in i.category ? i.category.name : '';
    const action = getKitchenStockPrintAction(st);
    return {
      name: i.name,
      category: cat ?? '—',
      qty: fmtKitchenQty(Number(i.current_quantity), i.unit),
      min: fmtKitchenQty(getEffectiveKitchenMinimum(i), i.unit),
      status: KITCHEN_STOCK_STATUS_COLORS[st].label,
      action,
      skt: i.nearest_expires_at ? formatDateShort(i.nearest_expires_at) : '—',
      barcode: i.barcode ?? '—',
      __rowClass: getKitchenStockPrintRowClass(st),
    };
  });
  const kind = lowOnly ? 'stock_low' : 'stock_all';
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES[kind],
      subtitle: lowOnly
        ? `${KITCHEN_LOW_STOCK_THRESHOLD} adet ve altı — tedarik gerekli`
        : `Güncel depo · ${lowCount} ürün ${KITCHEN_LOW_STOCK_THRESHOLD} adet ve altında (kırmızı)`,
      meta: [
        ...nowMeta(),
        { label: 'Ürün sayısı', value: String(rows.length) },
        ...(lowOnly ? [] : [{ label: 'Tedarik / yetersiz', value: String(lowCount) }]),
      ],
      columns: [
        { key: 'name', label: 'Ürün', width: '20%' },
        { key: 'category', label: 'Kategori', width: '12%' },
        { key: 'qty', label: 'Mevcut', width: '10%', align: 'right' },
        { key: 'min', label: 'Eşik', width: '10%', align: 'right' },
        { key: 'status', label: 'Durum', width: '10%' },
        { key: 'action', label: 'İşlem', width: '12%' },
        { key: 'skt', label: 'SKT', width: '10%' },
        { key: 'barcode', label: 'Barkod', width: '16%' },
      ],
      rows,
      landscape: true,
      emptyMessage: lowOnly
        ? `Kritik stok yok (${KITCHEN_LOW_STOCK_THRESHOLD} adet altı ürün bulunmuyor).`
        : undefined,
    },
    kind
  );
}

type CariRow = { id: string; direction: string; amount: number; description: string | null; entry_date: string; category: string | null };

async function fetchCariLedger(direction?: string, since?: string): Promise<CariRow[]> {
  let q = supabase
    .from('kitchen_cari_ledger')
    .select('id, direction, amount, description, entry_date, category')
    .order('entry_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (direction) q = q.eq('direction', direction);
  if (since) q = q.gte('entry_date', since);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CariRow[];
}

async function buildCariReport(filter: 'all' | 'kitchen_owes_hotel' | 'hotel_owes_kitchen'): Promise<KitchenPrintPayload> {
  const [rows, net] = await Promise.all([
    fetchCariLedger(filter === 'all' ? undefined : filter),
    fetchCariNetBalance(),
  ]);
  const kind =
    filter === 'kitchen_owes_hotel' ? 'cari_debt' : filter === 'hotel_owes_kitchen' ? 'cari_receivable' : 'cari_all';
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const tableRows: KitchenPrintRow[] = rows.map((r) => ({
    date: formatDateShort(r.entry_date),
    direction: r.direction === 'kitchen_owes_hotel' ? 'Mutfak → Otel (borç)' : 'Otel → Mutfak (alacak)',
    amount: fmtKitchenMoney(Number(r.amount)),
    description: r.description ?? '—',
    category: r.category ?? '—',
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES[kind],
      subtitle: filter === 'all' ? 'Tüm cari hareketler' : CARI_DIR_LABELS[filter],
      meta: [...nowMeta(), { label: 'Net cari', value: fmtKitchenMoney(net) }],
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'direction', label: 'Yön', width: '28%' },
        { key: 'amount', label: 'Tutar', width: '16%', align: 'right' },
        { key: 'category', label: 'Kategori', width: '14%' },
        { key: 'description', label: 'Açıklama', width: '28%' },
      ],
      rows: tableRows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Liste toplamı', value: fmtKitchenMoney(total) },
        { label: 'Net bakiye', value: fmtKitchenMoney(net) },
      ],
    },
    kind
  );
}

async function buildCariWeeklyReport(): Promise<KitchenPrintPayload> {
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceStr = since.toISOString().slice(0, 10);
  const rows = await fetchCariLedger(undefined, sinceStr);
  const byDay = new Map<string, { debt: number; recv: number; count: number }>();
  for (const r of rows) {
    const day = r.entry_date.slice(0, 10);
    const cur = byDay.get(day) ?? { debt: 0, recv: 0, count: 0 };
    cur.count += 1;
    if (r.direction === 'kitchen_owes_hotel') cur.debt += Number(r.amount);
    else cur.recv += Number(r.amount);
    byDay.set(day, cur);
  }
  const days = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const tableRows: KitchenPrintRow[] = days.map((d) => {
    const v = byDay.get(d)!;
    return {
      date: formatDateShort(d),
      borc: fmtKitchenMoney(v.debt),
      alacak: fmtKitchenMoney(v.recv),
      hareket: String(v.count),
      net: fmtKitchenMoney(v.recv - v.debt),
    };
  });
  const net = await fetchCariNetBalance();
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.cari_weekly,
      subtitle: `Son 7 gün (${formatDateShort(sinceStr)} — ${formatDateShort(new Date())})`,
      meta: [...nowMeta(), { label: 'Net cari', value: fmtKitchenMoney(net) }],
      columns: [
        { key: 'date', label: 'Gün', width: '20%' },
        { key: 'borc', label: 'Mutfak borcu', width: '22%', align: 'right' },
        { key: 'alacak', label: 'Mutfak alacağı', width: '22%', align: 'right' },
        { key: 'net', label: 'Gün net', width: '18%', align: 'right' },
        { key: 'hareket', label: 'Hareket', width: '18%', align: 'center' },
      ],
      rows: tableRows,
      summary: [{ label: 'Haftalık hareket', value: String(rows.length) }],
    },
    'cari_weekly'
  );
}

async function buildSupplierDebtsReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_supplier_debts')
    .select('supplier_name, amount, paid_amount, due_date, status')
    .neq('status', 'paid')
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  let totalRemaining = 0;
  const rows: KitchenPrintRow[] = list.map((r) => {
    const remaining = Number(r.amount) - Number(r.paid_amount);
    totalRemaining += remaining;
    return {
      supplier: r.supplier_name,
      total: fmtKitchenMoney(Number(r.amount)),
      paid: fmtKitchenMoney(Number(r.paid_amount)),
      remaining: fmtKitchenMoney(remaining),
      due: r.due_date ? formatDateShort(r.due_date) : '—',
      status: SUPPLIER_STATUS[r.status as string] ?? r.status,
    };
  });
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.supplier_debts,
      subtitle: 'Açık tedarikçi borçları',
      meta: nowMeta(),
      columns: [
        { key: 'supplier', label: 'Tedarikçi', width: '24%' },
        { key: 'total', label: 'Toplam', width: '16%', align: 'right' },
        { key: 'paid', label: 'Ödenen', width: '16%', align: 'right' },
        { key: 'remaining', label: 'Kalan', width: '16%', align: 'right' },
        { key: 'due', label: 'Vade', width: '14%' },
        { key: 'status', label: 'Durum', width: '14%' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Toplam kalan borç', value: fmtKitchenMoney(totalRemaining) },
      ],
      landscape: true,
    },
    'supplier_debts'
  );
}

async function buildSettlementsReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_settlements')
    .select('payer_name, payee_name, amount, method, status, created_at')
    .order('created_at', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.created_at),
    payer: r.payer_name ?? '—',
    payee: r.payee_name ?? '—',
    amount: fmtKitchenMoney(Number(r.amount)),
    method: r.method,
    status: r.status,
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.settlements,
      subtitle: 'Ödeme ve mahsup kayıtları',
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'payer', label: 'Ödeyen', width: '20%' },
        { key: 'payee', label: 'Alan', width: '20%' },
        { key: 'amount', label: 'Tutar', width: '16%', align: 'right' },
        { key: 'method', label: 'Yöntem', width: '16%' },
        { key: 'status', label: 'Durum', width: '14%' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Toplam', value: fmtKitchenMoney(total) },
      ],
    },
    'settlements'
  );
}

async function buildExpensesReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_expenses')
    .select('entry_date, category, amount, description, supplier_name')
    .order('entry_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.entry_date),
    category: r.category,
    amount: fmtKitchenMoney(Number(r.amount)),
    description: r.description ?? '—',
    supplier: r.supplier_name ?? '—',
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.expenses,
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'category', label: 'Kategori', width: '18%' },
        { key: 'amount', label: 'Tutar', width: '14%', align: 'right' },
        { key: 'supplier', label: 'Tedarikçi', width: '18%' },
        { key: 'description', label: 'Açıklama', width: '36%' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Toplam gider', value: fmtKitchenMoney(total) },
      ],
      landscape: true,
    },
    'expenses'
  );
}

async function buildRevenueReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_revenues')
    .select('entry_date, description, amount, payment_type')
    .order('entry_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.entry_date),
    description: r.description,
    amount: fmtKitchenMoney(Number(r.amount)),
    payment: PAY_LABELS[r.payment_type] ?? r.payment_type,
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.revenue,
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '16%' },
        { key: 'description', label: 'Açıklama', width: '40%' },
        { key: 'payment', label: 'Ödeme', width: '22%' },
        { key: 'amount', label: 'Tutar', width: '22%', align: 'right' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Toplam hasılat', value: fmtKitchenMoney(total) },
      ],
    },
    'revenue'
  );
}

async function buildPersonnelReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_personnel_payments')
    .select('staff_name, staff_role, amount, payment_type, entry_date')
    .order('entry_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const total = list.reduce((s, r) => s + Number(r.amount), 0);
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.entry_date),
    name: r.staff_name,
    role: r.staff_role ?? '—',
    type: PERSONNEL_LABELS[r.payment_type] ?? r.payment_type,
    amount: fmtKitchenMoney(Number(r.amount)),
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.personnel,
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'name', label: 'Personel', width: '26%' },
        { key: 'role', label: 'Görev', width: '18%' },
        { key: 'type', label: 'Ödeme türü', width: '22%' },
        { key: 'amount', label: 'Tutar', width: '20%', align: 'right' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Toplam', value: fmtKitchenMoney(total) },
      ],
      landscape: true,
    },
    'personnel'
  );
}

async function buildPosReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_pos_transactions')
    .select('entry_date, amount, net_amount, description, status')
    .order('entry_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const totalGross = list.reduce((s, r) => s + Number(r.amount), 0);
  const totalNet = list.reduce((s, r) => s + Number(r.net_amount), 0);
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.entry_date),
    gross: fmtKitchenMoney(Number(r.amount)),
    net: fmtKitchenMoney(Number(r.net_amount)),
    status: POS_LABELS[r.status] ?? r.status,
    description: r.description ?? '—',
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.pos,
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'gross', label: 'Brüt', width: '16%', align: 'right' },
        { key: 'net', label: 'Net', width: '16%', align: 'right' },
        { key: 'status', label: 'Durum', width: '18%' },
        { key: 'description', label: 'Açıklama', width: '36%' },
      ],
      rows,
      summary: [
        { label: 'Kayıt', value: String(rows.length) },
        { label: 'Brüt toplam', value: fmtKitchenMoney(totalGross) },
        { label: 'Net toplam', value: fmtKitchenMoney(totalNet) },
      ],
      landscape: true,
    },
    'pos'
  );
}

async function buildFinanceReport(kind: KitchenPrintReportKind): Promise<KitchenPrintPayload> {
  const today = new Date().toISOString().slice(0, 10);
  const [summary, cariNet] = await Promise.all([fetchDaySummary(today), fetchCariNetBalance()]);
  const rows: KitchenPrintRow[] = [
    { kalem: 'Toplam hasılat', tutar: fmtKitchenMoney(summary.total_revenue) },
    { kalem: 'POS toplamı', tutar: fmtKitchenMoney(summary.total_pos) },
    { kalem: 'Nakit', tutar: fmtKitchenMoney(summary.total_cash) },
    { kalem: 'Toplam gider', tutar: fmtKitchenMoney(summary.total_expenses) },
    { kalem: 'Personel gideri', tutar: fmtKitchenMoney(summary.personnel_expenses) },
    { kalem: 'Tedarikçi borcu', tutar: fmtKitchenMoney(summary.supplier_debt) },
    { kalem: 'Mutfak → Otel (cari borç)', tutar: fmtKitchenMoney(summary.kitchen_owes_hotel) },
    { kalem: 'Otel → Mutfak (cari alacak)', tutar: fmtKitchenMoney(summary.hotel_owes_kitchen) },
    { kalem: 'Cari net', tutar: fmtKitchenMoney(cariNet) },
    { kalem: 'Net kalan', tutar: fmtKitchenMoney(summary.net_remaining) },
  ];
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES[kind],
      subtitle: `Tarih: ${formatDateShort(today)}`,
      meta: nowMeta(),
      columns: [
        { key: 'kalem', label: 'Kalem', width: '60%' },
        { key: 'tutar', label: 'Tutar', width: '40%', align: 'right' },
      ],
      rows,
      summary: [{ label: 'Net kalan', value: fmtKitchenMoney(summary.net_remaining) }],
    },
    kind
  );
}

async function buildHandoverListReport(): Promise<KitchenPrintPayload> {
  const { data, error } = await supabase
    .from('kitchen_handovers')
    .select('handover_date, handed_by_name, received_by_name, notes, created_at')
    .order('handover_date', { ascending: false })
    .limit(PRINT_LIMIT);
  if (error) throw error;
  const list = data ?? [];
  const rows: KitchenPrintRow[] = list.map((r) => ({
    date: formatDateShort(r.handover_date),
    from: r.handed_by_name,
    to: r.received_by_name,
    notes: r.notes ?? '—',
  }));
  return payloadFromInput(
    {
      reportTitle: KITCHEN_PRINT_REPORT_TITLES.handover_list,
      subtitle: 'Otel mutfağı → mutfakçı teslim kayıtları',
      meta: nowMeta(),
      columns: [
        { key: 'date', label: 'Tarih', width: '14%' },
        { key: 'from', label: 'Teslim eden', width: '26%' },
        { key: 'to', label: 'Teslim alan', width: '26%' },
        { key: 'notes', label: 'Not', width: '34%' },
      ],
      rows,
      summary: [{ label: 'Kayıt', value: String(rows.length) }],
      landscape: true,
    },
    'handover_list'
  );
}

/** Cari ekranı için çoklu rapor seçenekleri */
export const KITCHEN_CARI_PRINT_OPTIONS: { kind: KitchenPrintReportKind; label: string }[] = [
  { kind: 'cari_all', label: 'Toplu' },
  { kind: 'cari_debt', label: 'Borç' },
  { kind: 'cari_receivable', label: 'Alacak' },
  { kind: 'cari_weekly', label: 'Haftalık' },
];
