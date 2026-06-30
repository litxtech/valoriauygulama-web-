/** Sunucu 503/522 sonrası gereksiz istekleri kısa süre atla — UI donmasını azaltır. */
const DEFAULT_COOLDOWN_MS = 12_000;

let unhealthyUntil = 0;

export function markSupabaseUnhealthy(cooldownMs = DEFAULT_COOLDOWN_MS): void {
  unhealthyUntil = Date.now() + cooldownMs;
}

export function clearSupabaseHealthCooldown(): void {
  unhealthyUntil = 0;
}

export function isSupabaseInCooldown(): boolean {
  return Date.now() < unhealthyUntil;
}

/** Kritik olmayan işler için: cooldown aktifse false döner. */
export function shouldRunOptionalSupabaseWork(): boolean {
  return !isSupabaseInCooldown();
}
