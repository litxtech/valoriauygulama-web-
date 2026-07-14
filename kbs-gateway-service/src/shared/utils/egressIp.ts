/** Railway kbs-core’un Jandarma’ya giden çıkış IPv4’ünü öğren. */
let cached: { ip: string; at: number } | null = null;
const CACHE_MS = 10 * 60_000;

export async function detectEgressIpv4(): Promise<string | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.ip;

  const urls = ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'];
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 6_000);
      try {
        const res = await fetch(url, { signal: controller.signal });
        const text = (await res.text()).trim();
        const m = text.match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
        if (m?.[1]) {
          cached = { ip: m[1], at: Date.now() };
          return m[1];
        }
      } finally {
        clearTimeout(t);
      }
    } catch {
      /* sonraki */
    }
  }
  return null;
}
