import { ACCOMMODATION_TAX_RATE, VAT_RATE } from '@/constants/hmbHotel';

export type StayAmounts = {
  totalNet: number;
  vatAmount: number;
  accommodationTaxAmount: number;
};

/** Gece fiyatı × gece sayısı → net, KDV ve konaklama vergisi (Maliye satırlarıyla uyumlu). */
export function computeStayAmounts(pricePerNight: number, nights: number): StayAmounts {
  const totalNet = pricePerNight * nights;
  const vatAmount = Math.round(totalNet * VAT_RATE * 100) / 100;
  const accommodationTaxAmount = Math.round(totalNet * ACCOMMODATION_TAX_RATE * 100) / 100;
  return { totalNet, vatAmount, accommodationTaxAmount };
}

export function effectiveNightlyRate(totalNet: number | null | undefined, nights: number | null | undefined): number | null {
  const n = nights != null && nights > 0 ? nights : 0;
  const t = totalNet != null && !Number.isNaN(Number(totalNet)) ? Number(totalNet) : 0;
  if (n <= 0 || t <= 0) return null;
  return Math.round((t / n) * 100) / 100;
}
