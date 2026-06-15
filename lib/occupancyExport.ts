import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { exportContractPdf, loadGuestForPdf, shareContractPdf, type GuestForPdf } from '@/lib/contractPdf';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import type { OccupancyGuest, OccupancySnapshot } from '@/lib/occupancyOpsLoad';

function csvEscape(s: string): string {
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function shareOccupancySnapshotCsv(snapshot: OccupancySnapshot, fileLabel = 'konaklama'): Promise<void> {
  const rows: string[] = [];
  rows.push('Valoria Hotel - Konaklama operasyon özeti');
  rows.push(`Toplam oda,${snapshot.stats.totalRooms}`);
  rows.push(`Dolu,${snapshot.stats.occupiedRooms}`);
  rows.push(`Boş,${snapshot.stats.vacantRooms}`);
  rows.push(`Doluluk %,${snapshot.stats.occupancyPct}`);
  rows.push(`Odada,${snapshot.stats.guestsInHouse}`);
  rows.push(`Giriş bekleyen,${snapshot.stats.pendingCount}`);
  rows.push('');
  rows.push('Odalar');
  rows.push('Oda,Durum,Misafir,Giriş,Gece,Sözleşme');
  for (const room of snapshot.rooms) {
    if (room.guests.length === 0) {
      rows.push([csvEscape(room.room_number), csvEscape(room.status), '', '', '', ''].join(','));
      continue;
    }
    for (const g of room.guests) {
      rows.push(
        [
          csvEscape(room.room_number),
          csvEscape(room.status),
          csvEscape(g.full_name),
          csvEscape(g.check_in_at ?? ''),
          g.nights_count ?? '',
          g.signature_data ? 'imzalı' : 'eksik',
        ].join(',')
      );
    }
  }
  rows.push('');
  rows.push('Giriş bekleyenler');
  rows.push('Ad,Telefon,Sözleşme onayı');
  snapshot.pendingGuests.forEach((g) => {
    rows.push([csvEscape(g.full_name), csvEscape(g.phone ?? ''), csvEscape(g.contract_accepted_at ?? '')].join(','));
  });

  const path = `${FileSystem.cacheDirectory}${fileLabel}-${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(path, '\uFEFF' + rows.join('\r\n'), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Konaklama raporu (Excel)' });
  }
}

export async function shareGuestContractPdf(
  client: SupabaseClient,
  guestId: string
): Promise<{ ok: boolean; error?: string }> {
  const guest = await loadGuestForPdf(client, guestId);
  if (!guest) return { ok: false, error: 'Misafir veya sözleşme bulunamadı.' };
  try {
    await shareContractPdf(guest);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'PDF oluşturulamadı' };
  }
}

export async function sendGuestContractToPrinter(
  client: SupabaseClient,
  guestId: string,
  guestName: string
): Promise<{ ok: boolean; error?: string }> {
  const guest = await loadGuestForPdf(client, guestId);
  if (!guest) return { ok: false, error: 'Misafir veya sözleşme bulunamadı.' };
  try {
    const uri = await exportContractPdf(guest);
    await sendPdfToPrinterEmail({
      pdfUri: uri,
      subject: `Sözleşme - ${guestName}`,
      fileName: `SOZLESME-${guestName.replace(/\s+/g, '-')}.pdf`,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? 'Yazıcıya gönderilemedi' };
  }
}

export async function runBulkGuestContractAction(
  guests: OccupancyGuest[],
  action: 'pdf' | 'printer',
  onProgress?: (done: number, total: number) => void
): Promise<{ succeeded: number; failed: string[] }> {
  const failed: string[] = [];
  let succeeded = 0;
  let i = 0;
  for (const g of guests) {
    onProgress?.(i, guests.length);
    const res =
      action === 'pdf'
        ? await shareGuestContractPdf(supabase, g.id)
        : await sendGuestContractToPrinter(supabase, g.id, g.full_name);
    if (res.ok) succeeded++;
    else failed.push(`${g.full_name}: ${res.error ?? 'Hata'}`);
    i++;
  }
  onProgress?.(guests.length, guests.length);
  return { succeeded, failed };
}
