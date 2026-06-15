import { supabase } from '@/lib/supabase';
import {
  notifyAdminPanel,
  sendBulkToGuests,
  sendNotificationToStaffIds,
} from '@/lib/notificationService';
import { log } from '@/lib/logger';
import type { TechAssetDetail, TechAssetStatus } from '@/lib/technicalAssets';
import { TECH_CATEGORY_GROUPS } from '@/lib/technicalAssets';
import type { HotelPulseConfigRow } from '@/lib/hotelPulseAdmin';

const ADMIN_FAULTS_HREF = '/admin/technical-assets/faults';
const ADMIN_ASSETS_HREF = '/admin/technical-assets/assets';
const STAFF_FAULTS_HREF = '/staff/technical-assets/faults';
const GUEST_HOME_HREF = '/customer';

export function techAssetStatusLabelTr(status: TechAssetStatus | string): string {
  switch (status) {
    case 'active':
      return 'Çalışıyor';
    case 'inactive':
      return 'Kapalı';
    case 'maintenance':
      return 'Bakımda';
    case 'fault':
      return 'Arızalı';
    default:
      return String(status);
  }
}

export function techCategoryGroupLabelTr(group: string): string {
  return TECH_CATEGORY_GROUPS.find((g) => g.value === group)?.label ?? group;
}

function formatTimeTr(iso?: string | null): string {
  return new Date(iso ?? Date.now()).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function assetLocationLine(asset?: TechAssetDetail | null): string {
  const parts: string[] = [];
  if (asset?.buildingName?.trim()) parts.push(asset.buildingName.trim());
  if (asset?.locationName?.trim()) {
    const loc = asset.locationFloor?.trim()
      ? `${asset.locationName.trim()} (${asset.locationFloor.trim()})`
      : asset.locationName.trim();
    parts.push(loc);
  }
  return parts.length ? parts.join(' · ') : 'Konum belirtilmedi';
}

function isGuestRelevantCategory(categoryGroup: string): boolean {
  return ['heating', 'water', 'electric', 'internet', 'security'].includes(categoryGroup);
}

function guestNotifyCategory(status: TechAssetStatus | string): 'info' | 'warning' {
  return status === 'fault' || status === 'maintenance' || status === 'inactive' ? 'warning' : 'info';
}

async function fetchTechnicalStaffIds(organizationId: string, excludeStaffId?: string | null): Promise<string[]> {
  const { data: staffRows, error } = await supabase
    .from('staff')
    .select('id, role, app_permissions')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (error) {
    log.warn('technicalAssetNotifications', 'staff fetch', error.message);
    return [];
  }
  const ids = (staffRows ?? [])
    .filter((s) => {
      const row = s as { role: string; app_permissions?: Record<string, boolean> | null };
      const p = row.app_permissions ?? {};
      return (
        row.role === 'admin' ||
        p.teknik_varliklar === true ||
        p.teknik_varlik_yonetimi === true ||
        p.teknik_varliklar_okuma === true
      );
    })
    .map((s) => (s as { id: string }).id);
  return [...new Set(ids)].filter((id) => id && id !== excludeStaffId);
}

async function notifyTechnicalStaffInOrg(params: {
  organizationId: string;
  title: string;
  body: string;
  createdByStaffId: string;
  notificationType: string;
  data?: Record<string, unknown>;
  excludeStaffId?: string | null;
}): Promise<void> {
  const staffIds = await fetchTechnicalStaffIds(params.organizationId, params.excludeStaffId);
  if (staffIds.length === 0) return;
  await sendNotificationToStaffIds({
    staffIds,
    title: params.title,
    body: params.body,
    createdByStaffId: params.createdByStaffId,
    notificationType: params.notificationType,
    category: 'admin',
    data: params.data,
  });
}

async function notifyCheckedInGuests(params: {
  organizationId: string;
  title: string;
  body: string;
  category: 'info' | 'warning';
  createdByStaffId: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { count, error } = await sendBulkToGuests({
    target: 'all_guests',
    organizationId: params.organizationId,
    title: params.title,
    body: params.body,
    category: params.category,
    createdByStaffId: params.createdByStaffId,
    notificationType: 'hotel_facility_status',
    data: params.data ?? {
      notificationType: 'hotel_facility_status',
      url: GUEST_HOME_HREF,
      screen: GUEST_HOME_HREF,
    },
  });
  if (error) log.warn('technicalAssetNotifications', 'guest bulk', error);
  else if (count > 0) {
    log.info('technicalAssetNotifications', 'guest bulk sent', { count });
  }
}

/** Yeni arıza bildirimi — admin panel + teknik personel. */
export async function notifyTechFaultCreated(params: {
  organizationId: string;
  faultId: string;
  title: string;
  description?: string | null;
  isEmergency: boolean;
  asset?: TechAssetDetail | null;
  createdByStaffId: string;
  createdAt?: string;
}): Promise<void> {
  const {
    organizationId,
    faultId,
    title,
    description,
    isEmergency,
    asset,
    createdByStaffId,
    createdAt,
  } = params;
  const when = formatTimeTr(createdAt);
  const where = asset ? assetLocationLine(asset) : 'Genel tesis';
  const assetLine = asset ? `${asset.name} (${asset.asset_code})` : null;
  const prefix = isEmergency ? '🚨 ACİL · ' : '';
  const pushTitle = `${prefix}Teknik arıza`;
  const pushBody = [
    title.trim(),
    assetLine,
    where,
    when,
    description?.trim() ? description.trim().slice(0, 120) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const data = {
    notificationType: 'tech_fault_report',
    url: STAFF_FAULTS_HREF,
    screen: STAFF_FAULTS_HREF,
    faultId,
    assetId: asset?.id ?? null,
    isEmergency,
  };

  try {
    await notifyAdminPanel({
      title: pushTitle,
      body: pushBody,
      href: ADMIN_FAULTS_HREF,
      notificationType: 'tech_fault_report',
    });
    await notifyTechnicalStaffInOrg({
      organizationId,
      title: pushTitle,
      body: pushBody,
      createdByStaffId,
      notificationType: 'tech_fault_report',
      data,
      excludeStaffId: createdByStaffId,
    });

    if (isEmergency || (asset && isGuestRelevantCategory(asset.category_group))) {
      const guestTitle = isEmergency ? 'Otel tesis uyarısı' : 'Tesis durumu';
      const guestBody = asset
        ? `${asset.name}: ${title.trim()}. ${where}. Ekibimiz bilgilendirildi.`
        : `${title.trim()}. Ekibimiz bilgilendirildi.`;
      await notifyCheckedInGuests({
        organizationId,
        title: guestTitle,
        body: guestBody,
        category: isEmergency ? 'warning' : 'info',
        createdByStaffId,
        data: {
          notificationType: 'hotel_facility_status',
          url: GUEST_HOME_HREF,
          screen: GUEST_HOME_HREF,
        },
      });
    }
  } catch (e) {
    log.warn('technicalAssetNotifications', 'notifyTechFaultCreated', e);
  }
}

/** Arıza durumu güncellendi (çözüldü, iptal, üzerinde çalışılıyor). */
export async function notifyTechFaultStatusChanged(params: {
  organizationId: string;
  faultId: string;
  title: string;
  status: string;
  asset?: TechAssetDetail | null;
  resolutionNote?: string | null;
  updatedByStaffId: string;
}): Promise<void> {
  const { organizationId, faultId, title, status, asset, resolutionNote, updatedByStaffId } = params;
  const statusTr =
    status === 'resolved'
      ? 'Çözüldü'
      : status === 'in_progress'
        ? 'Üzerinde çalışılıyor'
        : status === 'cancelled'
          ? 'İptal'
          : status;
  const when = formatTimeTr();
  const where = asset ? assetLocationLine(asset) : 'Genel tesis';
  const pushTitle = `Arıza · ${statusTr}`;
  const pushBody = [title.trim(), where, when, resolutionNote?.trim()].filter(Boolean).join(' · ');

  const data = {
    notificationType: 'tech_fault_report',
    url: STAFF_FAULTS_HREF,
    screen: STAFF_FAULTS_HREF,
    faultId,
    status,
  };

  try {
    await notifyAdminPanel({
      title: pushTitle,
      body: pushBody,
      href: ADMIN_FAULTS_HREF,
      notificationType: 'tech_fault_report',
    });
    await notifyTechnicalStaffInOrg({
      organizationId,
      title: pushTitle,
      body: pushBody,
      createdByStaffId: updatedByStaffId,
      notificationType: 'tech_fault_report',
      data,
      excludeStaffId: updatedByStaffId,
    });

    if (status === 'resolved' && asset && isGuestRelevantCategory(asset.category_group)) {
      await notifyCheckedInGuests({
        organizationId,
        title: 'Tesis güncellemesi',
        body: `${asset.name} ile ilgili bildirilen durum giderildi. ${where}.`,
        category: 'info',
        createdByStaffId: updatedByStaffId,
        data: {
          notificationType: 'hotel_facility_status',
          url: GUEST_HOME_HREF,
          screen: GUEST_HOME_HREF,
        },
      });
    }
  } catch (e) {
    log.warn('technicalAssetNotifications', 'notifyTechFaultStatusChanged', e);
  }
}

/** Teknik varlık çalışma durumu değişti. */
export async function notifyTechAssetStatusChanged(params: {
  organizationId: string;
  asset: TechAssetDetail;
  previousStatus: TechAssetStatus;
  newStatus: TechAssetStatus;
  updatedByStaffId: string;
}): Promise<void> {
  const { organizationId, asset, previousStatus, newStatus, updatedByStaffId } = params;
  if (previousStatus === newStatus) return;

  const when = formatTimeTr();
  const where = assetLocationLine(asset);
  const cat = techCategoryGroupLabelTr(asset.category_group);
  const pushTitle = `Kur / tesis · ${techAssetStatusLabelTr(newStatus)}`;
  const pushBody = `${asset.name} (${asset.asset_code}) · ${cat} · ${where} · ${when}`;

  const data = {
    notificationType: 'tech_asset_status',
    url: `${ADMIN_ASSETS_HREF}/${asset.id}`,
    screen: `/staff/technical-assets/${asset.id}`,
    assetId: asset.id,
    previousStatus,
    newStatus,
  };

  try {
    await notifyAdminPanel({
      title: pushTitle,
      body: pushBody,
      href: `${ADMIN_ASSETS_HREF}/${asset.id}`,
      notificationType: 'tech_asset_status',
    });
    await notifyTechnicalStaffInOrg({
      organizationId,
      title: pushTitle,
      body: pushBody,
      createdByStaffId: updatedByStaffId,
      notificationType: 'tech_asset_status',
      data,
      excludeStaffId: updatedByStaffId,
    });

    if (!isGuestRelevantCategory(asset.category_group)) return;

    const recovered =
      (previousStatus === 'fault' || previousStatus === 'maintenance' || previousStatus === 'inactive') &&
      newStatus === 'active';
    const degraded = newStatus === 'fault' || newStatus === 'maintenance' || newStatus === 'inactive';

    if (!recovered && !degraded) return;

    let guestTitle = 'Otel tesis bilgisi';
    let guestBody: string;
    if (recovered) {
      guestBody = `${asset.name} tekrar normal çalışma durumunda. ${where}.`;
    } else if (newStatus === 'fault') {
      guestBody = `${asset.name} arızalı durumda. Teknik ekip müdahale ediyor. ${where}.`;
    } else if (newStatus === 'maintenance') {
      guestBody = `${asset.name} üzerinde planlı bakım çalışması var. ${where}. Kısa süreli etki olabilir.`;
    } else {
      guestBody = `${asset.name} geçici olarak devre dışı. ${where}.`;
    }

    if (asset.category_group === 'heating') {
      guestTitle = recovered ? 'Isıtma / kazan' : 'Isıtma sistemi';
      if (recovered) {
        guestBody = `Kazan ve ısıtma sistemi otel genelinde çalışmaktadır. ${where}.`;
      } else if (newStatus === 'fault') {
        guestBody = `Kazan / ısıtma sisteminde arıza bildirimi var. Sıcak su ve ısıtma kısa süre etkilenebilir. ${where}.`;
      } else if (newStatus === 'maintenance') {
        guestBody = `Kazan / ısıtma sisteminde planlı bakım çalışması var. ${where}.`;
      }
    }

    await notifyCheckedInGuests({
      organizationId,
      title: guestTitle,
      body: guestBody,
      category: guestNotifyCategory(newStatus),
      createdByStaffId: updatedByStaffId,
      data: {
        notificationType: 'hotel_facility_status',
        url: GUEST_HOME_HREF,
        screen: GUEST_HOME_HREF,
        assetId: asset.id,
      },
    });
  } catch (e) {
    log.warn('technicalAssetNotifications', 'notifyTechAssetStatusChanged', e);
  }
}

const GUEST_RELEVANT_LOG_ACTIONS = new Set([
  'Arıza bildirildi',
  'Sigorta atıldı',
  'Vana kapatıldı',
  'Teknik personele devredildi',
]);

/** Önemli müdahale kayıtları — admin ve teknik ekip. */
export async function notifyTechMaintenanceLog(params: {
  organizationId: string;
  asset: TechAssetDetail;
  actionType: string;
  note?: string | null;
  staffId: string;
  staffName?: string | null;
}): Promise<void> {
  const { organizationId, asset, actionType, note, staffId, staffName } = params;
  if (!GUEST_RELEVANT_LOG_ACTIONS.has(actionType.trim())) return;

  const when = formatTimeTr();
  const where = assetLocationLine(asset);
  const pushTitle = 'Tesis müdahalesi';
  const pushBody = [
    `${asset.name} · ${actionType.trim()}`,
    where,
    when,
    staffName?.trim(),
    note?.trim()?.slice(0, 80),
  ]
    .filter(Boolean)
    .join(' · ');

  const data = {
    notificationType: 'tech_maintenance_log',
    url: `/staff/technical-assets/${asset.id}`,
    screen: `/staff/technical-assets/${asset.id}`,
    assetId: asset.id,
    actionType,
  };

  try {
    await notifyAdminPanel({
      title: pushTitle,
      body: pushBody,
      href: `${ADMIN_ASSETS_HREF}/${asset.id}`,
      notificationType: 'tech_maintenance_log',
    });
    await notifyTechnicalStaffInOrg({
      organizationId,
      title: pushTitle,
      body: pushBody,
      createdByStaffId: staffId,
      notificationType: 'tech_maintenance_log',
      data,
      excludeStaffId: staffId,
    });

    if (isGuestRelevantCategory(asset.category_group) && actionType.trim() === 'Arıza bildirildi') {
      await notifyCheckedInGuests({
        organizationId,
        title: 'Otel tesis bilgisi',
        body: `${asset.name} için teknik müdahale kaydı oluşturuldu. ${where}.`,
        category: 'warning',
        createdByStaffId: staffId,
        data: {
          notificationType: 'hotel_facility_status',
          url: GUEST_HOME_HREF,
          screen: GUEST_HOME_HREF,
        },
      });
    }
  } catch (e) {
    log.warn('technicalAssetNotifications', 'notifyTechMaintenanceLog', e);
  }
}

/** Otel nabzı tesis alanları kaydedildiğinde misafirlere kurumsal bildirim. */
export async function notifyHotelPulseFacilitiesIfChanged(params: {
  organizationId: string;
  previous: HotelPulseConfigRow | null;
  next: HotelPulseConfigRow;
  updatedByStaffId: string;
}): Promise<void> {
  const { organizationId, previous, next, updatedByStaffId } = params;
  if (!next.is_enabled) return;

  const messages: { title: string; body: string; category: 'info' | 'warning' }[] = [];

  const prevBoiler = previous?.manual_boiler_active ?? true;
  const nextBoiler = next.manual_boiler_active ?? true;
  const boilerLabel = (next.manual_boiler_label ?? 'Kazan / ısıtma').trim() || 'Kazan / ısıtma';

  if (prevBoiler !== nextBoiler) {
    if (nextBoiler) {
      messages.push({
        title: 'Isıtma sistemi',
        body: `${boilerLabel}: Otel genelinde ısıtma ve sıcak su hizmeti normal çalışmaktadır.`,
        category: 'info',
      });
    } else {
      messages.push({
        title: 'Isıtma sistemi',
        body: `${boilerLabel}: Planlı bakım veya arıza çalışması nedeniyle ısıtma/sıcak su kısa süre etkilenebilir.`,
        category: 'warning',
      });
    }
  } else if (
    previous &&
    (previous.manual_boiler_label ?? '').trim() !== boilerLabel &&
    boilerLabel.length > 2
  ) {
    messages.push({
      title: 'Tesis güncellemesi',
      body: `${boilerLabel} durumu güncellendi.`,
      category: 'info',
    });
  }

  const prevAnn = (previous?.manual_announcement_label ?? '').trim();
  const nextAnn = (next.manual_announcement_label ?? '').trim();
  if (nextAnn && nextAnn !== prevAnn) {
    messages.push({
      title: 'Otel duyurusu',
      body: nextAnn.slice(0, 240),
      category: 'info',
    });
  }

  const prevElev = (previous?.manual_elevator_label ?? '').trim();
  const nextElev = (next.manual_elevator_label ?? '').trim();
  if (nextElev && nextElev !== prevElev) {
    messages.push({
      title: 'Asansör / erişim',
      body: nextElev.slice(0, 240),
      category: nextElev.toLowerCase().includes('arız') ? 'warning' : 'info',
    });
  }

  const textField = (
    title: string,
    prevVal: string | null | undefined,
    nextVal: string | null | undefined,
    category: 'info' | 'warning' = 'info'
  ) => {
    const p = (prevVal ?? '').trim();
    const n = (nextVal ?? '').trim();
    if (n && n !== p) {
      messages.push({ title, body: n.slice(0, 240), category });
    }
  };

  textField('Wi‑Fi durumu', previous?.manual_wifi_status, next.manual_wifi_status);
  textField('Wi‑Fi ağı', previous?.manual_wifi_network, next.manual_wifi_network);
  if ((previous?.manual_wifi_password ?? '').trim() !== (next.manual_wifi_password ?? '').trim()) {
    messages.push({
      title: 'Wi‑Fi şifresi',
      body: 'Otel Wi‑Fi şifresi güncellendi. Nabız kartından veya resepsiyondan yeni şifreyi alabilirsiniz.',
      category: 'info',
    });
  }
  textField('Kahvaltı saati', previous?.manual_breakfast_hours, next.manual_breakfast_hours);
  textField('Spa / hamam', previous?.manual_spa_label, next.manual_spa_label);
  textField('Restoran', previous?.manual_restaurant_label, next.manual_restaurant_label);
  textField('Otopark', previous?.manual_parking_label, next.manual_parking_label);
  textField('Hava durumu', previous?.manual_weather_label, next.manual_weather_label);

  if (messages.length === 0) return;

  try {
    for (const msg of messages) {
      await notifyCheckedInGuests({
        organizationId,
        title: msg.title,
        body: msg.body,
        category: msg.category,
        createdByStaffId: updatedByStaffId,
        data: {
          notificationType: 'hotel_facility_status',
          url: GUEST_HOME_HREF,
          screen: GUEST_HOME_HREF,
        },
      });
    }
    const summary = messages.map((m) => m.title).join(', ');
    await notifyAdminPanel({
      title: 'Misafir tesis bildirimi gönderildi',
      body: summary,
      href: '/admin/hotel-pulse',
      notificationType: 'hotel_facility_status',
    });
  } catch (e) {
    log.warn('technicalAssetNotifications', 'notifyHotelPulseFacilitiesIfChanged', e);
  }
}
