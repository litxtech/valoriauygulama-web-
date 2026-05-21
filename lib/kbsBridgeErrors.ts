/** Supabase Edge `KBS_GATEWAY_URL` — örnek / geçersiz host tespiti (mobil hata metni). */

const PLACEHOLDER_HOST_SNIPPETS = [
  'senin_sunucu_ip',
  'sunucu_ip',
  'your_static_ip',
  'your-server',
  'your_server',
  'sunucu-ip',
  'example.com',
  'placeholder',
  'changeme',
  'replace_me',
  'xxx.xxx',
] as const;

export function isPlaceholderKbsGatewayHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\s+/g, '');
  if (!h) return true;
  return PLACEHOLDER_HOST_SNIPPETS.some((p) => h.includes(p.replace(/\s+/g, '')));
}

/** Edge / fetch hata metninden köprü URL’si çıkar (gösterim için host maskeleme yok). */
export function extractUrlFromBridgeError(message: string): string | null {
  const m = message.match(/https?:\/\/[^\s)\]"']+/i);
  return m?.[0]?.replace(/[.,;]+$/, '') ?? null;
}

export function isDnsOrUnreachableBridgeError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /failed to lookup address|name or service not known|dns error|ENOTFOUND|ECONNREFUSED|connection refused|connect error|unable to resolve/i.test(
      m
    ) || isPlaceholderKbsGatewayError(message)
  );
}

export function isPlaceholderKbsGatewayError(message: string): boolean {
  const m = message.toLowerCase();
  if (PLACEHOLDER_HOST_SNIPPETS.some((p) => m.includes(p))) return true;
  const url = extractUrlFromBridgeError(message);
  if (!url) return false;
  try {
    return isPlaceholderKbsGatewayHost(new URL(url).hostname);
  } catch {
    return false;
  }
}
