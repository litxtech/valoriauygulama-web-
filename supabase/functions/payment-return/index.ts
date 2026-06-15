// Stripe sonrası yönlendirme — HTML yerine 302 deep link (Supabase text/plain HTML sorunu)
const APP_SCHEME = Deno.env.get("PAYMENT_APP_SCHEME")?.trim() || "valoria";

function deepLink(status: "success" | "cancel", id: string, token: string): string {
  const q = new URLSearchParams();
  if (id) q.set("id", id);
  if (token) q.set("token", token);
  const qs = q.toString();
  return `${APP_SCHEME}://payment/${status}${qs ? `?${qs}` : ""}`;
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") === "cancel" ? "cancel" : "success";
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const target = deepLink(status, id, token);

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Cache-Control": "no-store",
    },
  });
});
