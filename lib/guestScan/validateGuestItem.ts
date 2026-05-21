import type { GuestScanItem, FieldValidationIssue } from '@/lib/guestScan/types';

function has(v: string | null | undefined): boolean {
  return !!(v && String(v).trim());
}

/** KBS zorunlu alan kontrolü; eksikler kırmızı, düşük güven sarı (lowConfidenceFields). */
export function validateGuestScanItem(item: GuestScanItem): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];

  if (!has(item.firstName)) issues.push({ field: 'firstName', messageKey: 'kbsGuestMissingFirstName' });
  if (!has(item.lastName)) issues.push({ field: 'lastName', messageKey: 'kbsGuestMissingLastName' });
  if (!has(item.birthDate)) issues.push({ field: 'birthDate', messageKey: 'kbsGuestMissingBirthDate' });

  if (item.guestType === 'tc_citizen') {
    if (!has(item.identityNo) || String(item.identityNo).replace(/\D/g, '').length !== 11) {
      issues.push({ field: 'identityNo', messageKey: 'kbsGuestMissingTc' });
    }
    if (!has(item.documentSerialNo)) {
      issues.push({ field: 'documentSerialNo', messageKey: 'kbsGuestMissingSerial' });
    }
    if (!has(item.fatherName)) issues.push({ field: 'fatherName', messageKey: 'kbsGuestMissingFather' });
    if (!has(item.motherName)) issues.push({ field: 'motherName', messageKey: 'kbsGuestMissingMother' });
  } else if (item.guestType === 'ykn_foreign') {
    if (!has(item.identityNo)) issues.push({ field: 'identityNo', messageKey: 'kbsGuestMissingYkn' });
    if (!has(item.nationality) && !has(item.country)) {
      issues.push({ field: 'nationality', messageKey: 'kbsGuestMissingNationality' });
    }
  } else {
    if (!has(item.passportNo) && !has(item.identityNo)) {
      issues.push({ field: 'passportNo', messageKey: 'kbsGuestMissingPassport' });
    }
    if (!has(item.nationality) && !has(item.country)) {
      issues.push({ field: 'nationality', messageKey: 'kbsGuestMissingNationality' });
    }
    if (!item.gender) issues.push({ field: 'gender', messageKey: 'kbsGuestMissingGender' });
    if (item.documentType === 'passport' && !has(item.passportExpiryDate)) {
      issues.push({ field: 'passportExpiryDate', messageKey: 'kbsGuestMissingExpiry' });
    }
  }

  return issues;
}

export function canSubmitGuestItem(item: GuestScanItem, roomNo: string | null, checkinAt: string | null): boolean {
  if (validateGuestScanItem(item).length > 0) return false;
  return has(roomNo) && has(checkinAt);
}
