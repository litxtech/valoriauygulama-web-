/** Yerel takvim günü — UTC kayması olmadan YYYY-MM-DD */
export function localDateIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localTomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localDateIso(d);
}

export function localYesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateIso(d);
}
