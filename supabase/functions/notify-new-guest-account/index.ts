// Valoria Hotel - Yeni misafir hesabı: admin bilgilendirme + misafire hoş geldin (push + in-app).
// Body: { guest_id: string }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Lang = "tr" | "en" | "ar" | "de" | "fr" | "ru" | "es";

const WELCOME_COPY: Record<Lang, { title: string; body: string }> = {
  tr: {
    title: "Hoş geldiniz!",
    body:
      "Odanızda sorun, personel şikayeti veya eksikler mi var? Bildiriminiz anında tüm otel sorumlularına ulaşır ve hızlıca işleme alınır. Merak ettiklerinizi uygulama içinden otel sorumlularına sorabilirsiniz.",
  },
  en: {
    title: "Welcome!",
    body:
      "Room issues, staff feedback, or missing items? Your report reaches all hotel responsible staff instantly and will be handled quickly. Ask hotel staff anything you're curious about right in the app.",
  },
  ar: {
    title: "مرحباً بكم!",
    body:
      "مشكلة في الغرفة أو شكوى على الموظفين أو نواقص؟ يصل بلاغكم فوراً إلى جميع مسؤولي الفندق ويُعالَج بسرعة. اسألوا مسؤولي الفندق عما يهمكم من داخل التطبيق.",
  },
  de: {
    title: "Willkommen!",
    body:
      "Zimmerproblem, Personal-Feedback oder fehlende Artikel? Ihre Meldung erreicht sofort alle zuständigen Hotelmitarbeiter. Fragen Sie Verantwortliche direkt in der App.",
  },
  fr: {
    title: "Bienvenue !",
    body:
      "Problème de chambre, retour sur le personnel ou manques ? Votre signalement atteint instantanément tous les responsables de l'hôtel. Posez vos questions dans l'application.",
  },
  ru: {
    title: "Добро пожаловать!",
    body:
      "Проблема в номере, жалоба на персонал или нехватка чего-либо? Сообщение сразу поступит ответственным сотрудникам отеля. Задавайте вопросы в приложении.",
  },
  es: {
    title: "¡Bienvenido!",
    body:
      "¿Problema en la habitación, queja del personal o faltantes? Su aviso llega al instante a todos los responsables del hotel. Pregunte lo que necesite dentro de la app.",
  },
};

function resolveLang(raw: string | null | undefined): Lang {
  const code = (raw ?? "tr").split("-")[0]?.toLowerCase() ?? "tr";
  if (code in WELCOME_COPY) return code as Lang;
  return "en";
}

async function sendGuestWelcome(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  guestId: string,
  lang: Lang
): Promise<{ ok: boolean; error?: string }> {
  const copy = WELCOME_COPY[lang] ?? WELCOME_COPY.en;
  const pushData = {
    screen: "customer",
    url: "/customer/complaints/new",
    notificationType: "guest_welcome_app",
  };

  const { error: insErr } = await supabase.from("notifications").insert({
    guest_id: guestId,
    staff_id: null,
    title: copy.title,
    body: copy.body,
    notification_type: "guest_welcome_app",
    category: "guest",
    data: pushData,
    sent_via: "both",
    sent_at: new Date().toISOString(),
  });
  if (insErr) return { ok: false, error: insErr.message };

  const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-expo-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      guestIds: [guestId],
      title: copy.title,
      body: copy.body,
      data: pushData,
    }),
  });
  if (!pushRes.ok) {
    const errText = await pushRes.text();
    return { ok: false, error: "Push: " + errText.slice(0, 200) };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { guest_id } = (await req.json()) as { guest_id?: string };
    if (!guest_id?.trim()) {
      return new Response(JSON.stringify({ error: "guest_id gerekli" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const gid = guest_id.trim();
    const { data: guest, error: guestErr } = await supabase
      .from("guests")
      .select(
        "id, email, full_name, contract_lang, is_guest_app_account, welcome_email_sent_at, welcome_guest_notification_sent_at"
      )
      .eq("id", gid)
      .maybeSingle();

    if (guestErr || !guest) {
      return new Response(JSON.stringify({ error: "Misafir bulunamadı" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const isGuestApp = !!guest.is_guest_app_account;
    if (!isGuestApp) {
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: "not_guest_app" }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const lang = resolveLang(guest.contract_lang as string | null);
    let guestWelcome: { sent?: boolean; error?: string } = {};

    if (!guest.welcome_guest_notification_sent_at) {
      const welcomeResult = await sendGuestWelcome(supabase, supabaseUrl, serviceKey, gid, lang);
      if (welcomeResult.ok) {
        await supabase
          .from("guests")
          .update({ welcome_guest_notification_sent_at: new Date().toISOString() })
          .eq("id", gid);
        guestWelcome = { sent: true };
      } else {
        guestWelcome = { error: welcomeResult.error };
      }
    } else {
      guestWelcome = { sent: false, skipped: true };
    }

    let adminNotified = false;
    if (!guest.welcome_email_sent_at) {
      const title = "Yeni misafir hesabı";
      const body = `E-posta: ${guest.email ?? "-"}, Ad: ${guest.full_name ?? "Misafir"}`;
      const fnUrl = `${supabaseUrl}/functions/v1/notify-admins`;
      const res = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          title,
          body,
          data: { url: "/admin/guests", screen: "admin" },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({
            error: "Admin bildirimi gönderilemedi: " + errText,
            guestWelcome,
          }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }
      await supabase.from("guests").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", gid);
      adminNotified = true;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        adminNotified,
        guestWelcome,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
