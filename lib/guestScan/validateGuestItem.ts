import type { GuestScanItem, FieldValidationIssue } from '@/lib/guestScan/types';
import { KBS_REQUIRED_BY_KIND, type KbsFormField } from '@/lib/kbsRequiredFields';

function has(v: string | null | undefined): boolean {
  return !!(v && String(v).trim());
}

function countryOf(item: GuestScanItem): string | null {
  return item.country || item.nationality || null;
}

function valueForField(item: GuestScanItem, field: KbsFormField): string | null {
  switch (field) {
    case 'identityNo':
      return item.identityNo;
    case 'passportNo':
      return item.passportNo || item.identityNo;
    case 'documentSerialNo':
      return item.documentSerialNo;
    case 'firstName':
      return item.firstName;
    case 'lastName':
      return item.lastName;
    case 'birthDate':
      return item.birthDate;
    case 'country':
    case 'nationality':
      return countryOf(item);
    case 'fatherName':
      return item.fatherName;
    case 'motherName':
      return item.motherName;
    case 'gender':
      return item.gender;
    case 'maritalStatus':
      return item.parsed?.maritalStatus ?? null;
    case 'plateNumber':
      return item.plateNumber;
    case 'phone':
      return item.guestPhone;
    case 'usageKind':
      return item.usageKind;
    case 'roomNo':
    case 'checkinAt':
      return null; // oda/giriş session seviyesinde
    default:
      return null;
  }
}

const MESSAGE_KEY: Partial<Record<KbsFormField, string>> = {
  identityNo: 'kbsGuestMissingTc',
  passportNo: 'kbsGuestMissingPassport',
  documentSerialNo: 'kbsGuestMissingSerial',
  firstName: 'kbsGuestMissingFirstName',
  lastName: 'kbsGuestMissingLastName',
  birthDate: 'kbsGuestMissingBirthDate',
  country: 'kbsGuestMissingNationality',
  nationality: 'kbsGuestMissingNationality',
  fatherName: 'kbsGuestMissingFather',
  motherName: 'kbsGuestMissingMother',
  gender: 'kbsGuestMissingGender',
  usageKind: 'kbsGuestMissingUsage',
};

/** KBS zorunlu alan kontrolü — Jandarma form yıldızlı alanlar. */
export function validateGuestScanItem(item: GuestScanItem): FieldValidationIssue[] {
  const issues: FieldValidationIssue[] = [];
  const required = KBS_REQUIRED_BY_KIND[item.guestType] ?? KBS_REQUIRED_BY_KIND.foreign;

  for (const field of required) {
    if (field === 'roomNo' || field === 'checkinAt') continue;

    if (field === 'identityNo' && item.guestType === 'tc_citizen') {
      const digits = String(item.identityNo ?? '').replace(/\D/g, '');
      if (digits.length !== 11) {
        issues.push({ field: 'identityNo', messageKey: 'kbsGuestMissingTc' });
      }
      continue;
    }

    if (field === 'identityNo' && item.guestType === 'ykn_foreign') {
      if (!has(item.identityNo)) {
        issues.push({ field: 'identityNo', messageKey: 'kbsGuestMissingYkn' });
      }
      continue;
    }

    if (field === 'passportNo') {
      if (!has(item.passportNo) && !has(item.identityNo)) {
        issues.push({ field: 'passportNo', messageKey: 'kbsGuestMissingPassport' });
      }
      continue;
    }

    if (field === 'country' || field === 'nationality') {
      if (!has(countryOf(item))) {
        issues.push({ field: 'nationality', messageKey: 'kbsGuestMissingNationality' });
      }
      continue;
    }

    const val = valueForField(item, field);
    if (!has(val)) {
      issues.push({
        field: field === 'nationality' ? 'nationality' : field,
        messageKey: MESSAGE_KEY[field] ?? `kbsGuestMissing_${field}`,
      });
    }
  }

  return issues;
}

export function canSubmitGuestItem(
  item: GuestScanItem,
  roomNo: string | null,
  checkinAt: string | null
): boolean {
  if (validateGuestScanItem(item).length > 0) return false;
  return has(roomNo) && has(checkinAt) && has(item.usageKind);
}
