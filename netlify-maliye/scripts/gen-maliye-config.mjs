/**
 * netlify-maliye Vercel build: public-maliye JSON icin maliye-config.js uretir.
 * Vercel Project Settings > Environment Variables:
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY (veya MALIYE_SUPABASE_ANON_KEY)
 *   EXPO_PUBLIC_SUPABASE_URL (opsiyonel; yoksa asagidaki varsayilan proje URL'i)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const supabaseOrigin = (process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const apiBase =
  (process.env.MALIYE_API_BASE || "").trim() ||
  (supabaseOrigin ? `${supabaseOrigin}/functions/v1/public-maliye` : "") ||
  "https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/public-maliye";

const anonKey =
  (process.env.MALIYE_SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

const payload = { apiBase, anonKey };
const out = `window.MALIYE_PUBLIC=${JSON.stringify(payload)};\n`;
fs.writeFileSync(path.join(root, "maliye-config.js"), out, "utf8");
console.log("[gen-maliye-config] maliye-config.js yazildi", {
  apiBase,
  hasAnon: !!anonKey,
});
