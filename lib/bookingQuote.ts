import type { BookingCampaign } from '@/lib/onlineBooking';

export type BookingPartyMember = {
  full_name: string;
  id_number: string;
  phone?: string;
  birth_date?: string;
  is_student?: boolean;
};

export type BookingQuoteInput = {
  pricePerNight: number | null;
  nights: number;
  /** Booker + party members */
  members: BookingPartyMember[];
  isStudentParty: boolean;
  /** Grup rezervasyonu (öğrenci değilse %3) */
  isGroup?: boolean;
  campaign: BookingCampaign | null;
};

export type BookingQuoteResult = {
  listTotal: number | null;
  discountAmount: number;
  payable: number | null;
  memberCount: number;
  studentCount: number;
  label: string | null;
};

const STUDENT_DISCOUNT_PCT = 10;
const GROUP_DISCOUNT_PCT = 3;

/** Misafir UI ile sunucu indirim mantığını hizalar */
export function computeBookingQuoteClient(input: BookingQuoteInput): BookingQuoteResult {
  const nights = Math.max(0, input.nights);
  const listTotal =
    input.pricePerNight != null && nights >= 1 ? input.pricePerNight * nights : null;
  const memberCount = Math.max(1, input.members.length);
  let studentCount = input.members.filter((m) => m.is_student).length;
  if (input.isStudentParty) studentCount = Math.max(studentCount, 1);
  const isGroup = !!input.isGroup || memberCount >= 2;

  if (listTotal == null || listTotal <= 0) {
    return {
      listTotal,
      discountAmount: 0,
      payable: listTotal,
      memberCount,
      studentCount,
      label: null,
    };
  }

  let discount = 0;
  let label: string | null = null;
  const c = input.campaign;

  if (c) {
    let ok = true;
    if (nights < (c.min_nights || 1)) ok = false;
    if (memberCount < (c.min_members || 1)) ok = false;
    if (c.audience === 'student' && !input.isStudentParty && studentCount < 1) ok = false;
    if (c.audience === 'group' && memberCount < 2) ok = false;

    if (ok) {
      if (c.discount_type === 'percent') {
        discount = Math.round(listTotal * (Number(c.discount_value) / 100) * 100) / 100;
      } else {
        discount = Math.min(listTotal, Number(c.discount_value) || 0);
      }
      if ((c.student_extra_percent || 0) > 0 && (input.isStudentParty || studentCount > 0)) {
        discount += Math.round(listTotal * (Number(c.student_extra_percent) / 100) * 100) / 100;
      }
      label = c.name;
    }
  } else if (input.isStudentParty || studentCount > 0) {
    discount = Math.round(listTotal * (STUDENT_DISCOUNT_PCT / 100) * 100) / 100;
    label = `Öğrenci %${STUDENT_DISCOUNT_PCT}`;
  } else if (isGroup) {
    discount = Math.round(listTotal * (GROUP_DISCOUNT_PCT / 100) * 100) / 100;
    label = `Grup %${GROUP_DISCOUNT_PCT}`;
  }

  discount = Math.min(listTotal, Math.max(0, discount));
  return {
    listTotal,
    discountAmount: discount,
    payable: Math.max(0, listTotal - discount),
    memberCount,
    studentCount,
    label,
  };
}

export { STUDENT_DISCOUNT_PCT, GROUP_DISCOUNT_PCT };
