import i18n from '@/i18n';

/** Dinamik anahtarlar için güvenli çeviri */
export function tr(key: string, opts?: Record<string, string | number>): string {
  return i18n.t(key, opts);
}

export function roomStatusLabel(status: string): string {
  const k = `roomStatus_${status}`;
  const v = i18n.t(k);
  return v === k ? status : v;
}

export function guestStayStatusLabel(status: string): string {
  const k = `guestStayStatus_${status}`;
  const v = i18n.t(k);
  return v === k ? status : v;
}

export function idTypeLabel(type: string): string {
  const k = `idTypeLabel_${type}`;
  const v = i18n.t(k);
  return v === k ? type : v;
}

export function genderLabel(gender: string): string {
  const k = `genderLabel_${gender}`;
  const v = i18n.t(k);
  return v === k ? gender : v;
}

export function poiTypeLabel(type: string): string {
  const k = `poiType_${type}`;
  const v = i18n.t(k);
  return v === k ? type : v;
}

export function warningSeverityLabel(severity: string): string {
  const k = `warningSeverity_${severity}`;
  const v = i18n.t(k);
  return v === k ? severity : v;
}

export function personnelWarnSeverityLabel(severity: string): string {
  const k = `personnelWarnSeverity_${severity}`;
  const v = i18n.t(k);
  return v === k ? severity : v;
}

export function personnelWarnSeverityDesc(severity: string): string {
  const k = `personnelWarnSeverityDesc_${severity}`;
  const v = i18n.t(k);
  return v === k ? severity : v;
}

export function monthName(monthIndex: number): string {
  const keys = [
    'monthJan',
    'monthFeb',
    'monthMar',
    'monthApr',
    'monthMay',
    'monthJun',
    'monthJul',
    'monthAug',
    'monthSep',
    'monthOct',
    'monthNov',
    'monthDec',
  ] as const;
  const key = keys[monthIndex];
  return key ? i18n.t(key) : '';
}
