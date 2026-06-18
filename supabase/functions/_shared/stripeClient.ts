import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key?.trim()) {
    throw new Error("STRIPE_SECRET_KEY yapılandırılmamış");
  }
  return new Stripe(key.trim(), {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function stripeWebhookSecret(): string {
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret?.trim()) {
    throw new Error("STRIPE_WEBHOOK_SECRET yapılandırılmamış");
  }
  return secret.trim();
}

/** Stripe smallest currency unit (TRY/USD/EUR → 2 ondalık) */
export function toStripeMinorUnits(amount: number, currency: string): number {
  const c = currency.toLowerCase();
  const zeroDecimal = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
  if (zeroDecimal.has(c)) return Math.round(amount);
  return Math.round(amount * 100);
}

export function defaultPaymentCurrency(): string {
  return (Deno.env.get("STRIPE_DEFAULT_CURRENCY") ?? "try").trim().toLowerCase();
}

function appScheme(): string {
  return Deno.env.get("PAYMENT_APP_SCHEME")?.trim() || "valoria";
}

/** Mobil uygulama deep link — HTML ara sayfa yok */
export function appPaymentDeepLink(
  kind: "success" | "cancel",
  requestId: string,
  publicToken: string
): string {
  const q = new URLSearchParams({ id: requestId, token: publicToken });
  return `${appScheme()}://payment/${kind}?${q.toString()}`;
}

function paymentReturnBaseUrl(): string {
  const explicit = Deno.env.get("PAYMENT_RETURN_BASE_URL")?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  if (supabaseUrl) return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/payment-return`;

  return "";
}

function useHtmlPaymentReturn(): boolean {
  if (Deno.env.get("PAYMENT_USE_APP_DEEP_LINK") === "true") return false;
  if (Deno.env.get("PAYMENT_USE_HTML_RETURN") === "false") return false;
  // Varsayılan: HTTPS payment-return (Stripe Checkout success_url uyumlulu)
  return true;
}

export function paymentSuccessUrl(requestId: string, publicToken: string): string {
  const custom = Deno.env.get("PAYMENT_SUCCESS_URL")?.trim();
  if (custom) {
    return custom
      .replace("{id}", requestId)
      .replace("{token}", publicToken)
      .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
  }

  if (useHtmlPaymentReturn()) {
    const base = paymentReturnBaseUrl();
    if (!base) {
      throw new Error("PAYMENT_RETURN_BASE_URL veya SUPABASE_URL yapılandırılmamış");
    }
    const q = new URLSearchParams({ status: "success", id: requestId, token: publicToken });
    return `${base}?${q.toString()}`;
  }

  return appPaymentDeepLink("success", requestId, publicToken);
}

export function paymentCancelUrl(requestId: string, publicToken: string): string {
  const custom = Deno.env.get("PAYMENT_CANCEL_URL")?.trim();
  if (custom) {
    return custom
      .replace("{id}", requestId)
      .replace("{token}", publicToken)
      .replace("{CHECKOUT_SESSION_ID}", "{CHECKOUT_SESSION_ID}");
  }

  if (useHtmlPaymentReturn()) {
    const base = paymentReturnBaseUrl();
    if (!base) {
      throw new Error("PAYMENT_RETURN_BASE_URL veya SUPABASE_URL yapılandırılmamış");
    }
    const q = new URLSearchParams({ status: "cancel", id: requestId, token: publicToken });
    return `${base}?${q.toString()}`;
  }

  return appPaymentDeepLink("cancel", requestId, publicToken);
}
