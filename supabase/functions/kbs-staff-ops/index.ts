/**
 * KBS personel: oda listesi + oda ataması + Bildir (VPS/Railway JWT gerekmez).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { postKbsCoreGateway } from "../_shared/kbsCoreGateway.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RpcEnvelope = {
  ok?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function fromRpcEnvelope(raw: unknown): Response | null {
  if (raw == null || typeof raw !== "object") return null;
  const e = raw as RpcEnvelope;
  if (e.ok === false && e.error) {
    return json({
      ok: false,
      error: { code: e.error.code ?? "DB", message: e.error.message ?? "RPC error" },
    });
  }
  if (e.ok === true) return null;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ ok: false, error: { code: "AUTH", message: "Oturum gerekli" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json({ ok: false, error: { code: "CONFIG", message: "Supabase yapılandırması eksik" } });
    }

    let meta: {
      action?: string;
      guestDocumentId?: string;
      roomId?: string;
      roomNumber?: string;
      assignments?: { guestDocumentId: string }[];
    };
    try {
      meta = (await req.json()) as typeof meta;
    } catch {
      return json({ ok: false, error: { code: "BAD_REQUEST", message: "Geçersiz JSON" } });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) {
      return json({ ok: false, error: { code: "AUTH", message: "Geçersiz oturum" } });
    }

    const userId = userData.user.id;
    const action = meta.action ?? "list_rooms";

    if (action === "list_rooms") {
      const { data, error } = await admin.rpc("kbs_edge_list_rooms", { p_user_id: userId });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/285_kbs_edge_rooms_and_assign.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? [] });
    }

    if (action === "ensure_room") {
      const roomNumber = meta.roomNumber;
      if (!roomNumber || !String(roomNumber).trim()) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "roomNumber gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_ensure_room", {
        p_user_id: userId,
        p_room_number: String(roomNumber).trim(),
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/337_kbs_edge_ensure_room.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? null });
    }

    if (action === "deactivate_room") {
      const roomId = meta.roomId;
      if (!roomId) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "roomId gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_deactivate_room", {
        p_user_id: userId,
        p_room_id: roomId,
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: supabase/migrations/532_kbs_edge_deactivate_room.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? { id: roomId } });
    }

    if (action === "assign_room") {
      const guestDocumentId = meta.guestDocumentId;
      const roomId = meta.roomId;
      if (!guestDocumentId || !roomId) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "guestDocumentId ve roomId gerekli" } });
      }
      const { data, error } = await admin.rpc("kbs_edge_assign_room", {
        p_user_id: userId,
        p_guest_document_id: guestDocumentId,
        p_room_id: roomId,
      });
      if (error) {
        return json({
          ok: false,
          error: {
            code: "RPC",
            message: `${error.message}. SQL: 285_kbs_edge_rooms_and_assign.sql`,
          },
        });
      }
      const fail = fromRpcEnvelope(data);
      if (fail) return fail;
      const env = data as RpcEnvelope;
      return json({ ok: true, data: env.data ?? null });
    }

    if (action === "assign_rooms_batch") {
      const roomId = meta.roomId;
      const assignments = meta.assignments;
      if (!roomId || !Array.isArray(assignments) || assignments.length === 0) {
        return json({
          ok: false,
          error: { code: "BAD_REQUEST", message: "roomId ve assignments[] gerekli" },
        });
      }
      let assigned = 0;
      const errors: string[] = [];
      for (const row of assignments) {
        const guestDocumentId = row?.guestDocumentId;
        if (!guestDocumentId) continue;
        const { data, error } = await admin.rpc("kbs_edge_assign_room", {
          p_user_id: userId,
          p_guest_document_id: guestDocumentId,
          p_room_id: roomId,
        });
        if (error) {
          errors.push(error.message);
          continue;
        }
        const fail = fromRpcEnvelope(data);
        if (fail) {
          errors.push("assign failed");
          continue;
        }
        assigned += 1;
      }
      if (assigned === 0) {
        return json({
          ok: false,
          error: { code: "ASSIGN_FAILED", message: errors[0] ?? "Oda atanamadı" },
        });
      }
      return json({ ok: true, data: { assigned, total: assignments.length } });
    }

    /** Bildir: Railway JWT yok — Edge doğrular, kbs-core HMAC ile Jandarma’ya gider. */
    if (action === "submit_check_in") {
      const guestDocumentId = meta.guestDocumentId;
      if (!guestDocumentId) {
        return json({ ok: false, error: { code: "BAD_REQUEST", message: "guestDocumentId gerekli" } });
      }

      const { data: ctxRaw, error: ctxErr } = await admin.rpc("kbs_edge_resolve_app_user", {
        p_user_id: userId,
      });
      if (ctxErr) {
        return json({ ok: false, error: { code: "RPC", message: ctxErr.message } });
      }
      const ctxFail = fromRpcEnvelope(ctxRaw);
      if (ctxFail) return ctxFail;
      const hotelId = String((ctxRaw as RpcEnvelope)?.data &&
        typeof (ctxRaw as RpcEnvelope).data === "object"
        ? ((ctxRaw as RpcEnvelope).data as { hotel_id?: string }).hotel_id
        : "") || "";
      if (!hotelId) {
        return json({ ok: false, error: { code: "AUTH", message: "ops otel bağlamı yok" } });
      }

      const { data: staff } = await admin
        .from("staff")
        .select("role, app_permissions, is_active")
        .eq("auth_id", userId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      const opsRole = String(
        ((ctxRaw as RpcEnvelope).data as { role?: string } | undefined)?.role ?? "",
      );
      const perms = (staff?.app_permissions ?? {}) as Record<string, unknown>;
      const canBildir =
        opsRole === "admin" ||
        opsRole === "manager" ||
        staff?.role === "admin" ||
        perms.kbs_bildir === true ||
        perms.kbs_bildir === "true";
      if (!canBildir) {
        return json({
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Bildir izni yok. Admin → Personel → KBS Bildir açın.",
          },
        });
      }

      const { data: doc, error: docErr } = await admin
        .schema("ops")
        .from("guest_documents")
        .select(
          "id, hotel_id, guest_id, document_number, nationality_code, issuing_country_code, parsed_payload, document_series, usage_kind, kbs_person_kind, plate_number, guest_phone_submitted, forward_dated, expiry_date, document_type, scan_status",
        )
        .eq("id", guestDocumentId)
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (docErr || !doc) {
        return json({ ok: false, error: { code: "NOT_FOUND", message: "Belge bulunamadı" } });
      }

      const { data: guest, error: guestErr } = await admin
        .schema("ops")
        .from("guests")
        .select(
          "id, full_name, first_name, last_name, middle_name, birth_date, gender, nationality_code, father_name, mother_name",
        )
        .eq("id", doc.guest_id)
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (guestErr || !guest) {
        return json({ ok: false, error: { code: "NOT_FOUND", message: "Misafir bulunamadı" } });
      }

      const { data: stay, error: stayErr } = await admin
        .schema("ops")
        .from("stay_assignments")
        .select("id, hotel_id, room_id, check_in_at, check_out_at")
        .eq("hotel_id", hotelId)
        .eq("guest_id", doc.guest_id)
        .in("stay_status", ["assigned", "checked_in", "checkout_pending"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (stayErr || !stay) {
        return json({
          ok: false,
          error: { code: "CONFLICT", message: "Önce oda atayın" },
        });
      }

      const { data: room, error: roomErr } = await admin
        .schema("ops")
        .from("rooms")
        .select("id, room_number")
        .eq("id", stay.room_id)
        .eq("hotel_id", hotelId)
        .maybeSingle();
      if (roomErr || !room) {
        return json({ ok: false, error: { code: "NOT_FOUND", message: "Oda bulunamadı" } });
      }

      await admin
        .schema("ops")
        .from("guest_documents")
        .update({ scan_status: "ready_to_submit" })
        .eq("id", guestDocumentId);

      const idempotencyKey = `${guestDocumentId}:${stay.id}:check_in`;
      let txId: string | null = null;
      let idempotent = false;
      const { data: txIns, error: txErr } = await admin
        .schema("ops")
        .from("official_submission_transactions")
        .insert({
          hotel_id: hotelId,
          guest_id: doc.guest_id,
          guest_document_id: guestDocumentId,
          stay_assignment_id: stay.id,
          transaction_type: "check_in",
          provider: "gateway",
          status: "processing",
          idempotency_key: idempotencyKey,
          created_by: userId,
        })
        .select("id")
        .single();
      if (!txErr && txIns?.id) {
        txId = String(txIns.id);
      } else {
        const { data: existing } = await admin
          .schema("ops")
          .from("official_submission_transactions")
          .select("id, status")
          .eq("hotel_id", hotelId)
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (!existing?.id) {
          return json({
            ok: false,
            error: { code: "CONFLICT", message: txErr?.message ?? "İşlem oluşturulamadı" },
          });
        }
        txId = String(existing.id);
        idempotent = existing.status === "submitted" || existing.status === "success";
      }

      if (idempotent) {
        return json({ ok: true, data: { transactionId: txId, idempotent: true } });
      }

      const parsed = (doc.parsed_payload ?? {}) as Record<string, unknown>;
      const birthDate =
        (typeof parsed.birthDate === "string" ? parsed.birthDate : null) ??
        (guest.birth_date ? String(guest.birth_date) : null);
      const genderRaw =
        (typeof parsed.gender === "string" ? parsed.gender : null) ??
        (guest.gender ? String(guest.gender) : null);
      const gender =
        genderRaw === "M" || genderRaw === "F" || genderRaw === "X" ? genderRaw : null;
      const seriesFromParsed =
        typeof parsed.documentSeries === "string"
          ? parsed.documentSeries
          : typeof parsed.document_series === "string"
            ? parsed.document_series
            : null;
      const documentNumber = doc.document_number ??
        (typeof parsed.documentNumber === "string" ? parsed.documentNumber : null);
      let documentSeries = doc.document_series ?? seriesFromParsed;
      // Pasaportta seri yoksa belge no ile doldur (KBS BELGESERI).
      if (!documentSeries && documentNumber) documentSeries = documentNumber;

      let kbsPersonKind = doc.kbs_person_kind ? String(doc.kbs_person_kind) : null;
      if (!kbsPersonKind) {
        const docType = String(doc.document_type ?? parsed.documentType ?? "");
        const digits = String(documentNumber ?? "").replace(/\D/g, "");
        if (docType === "passport") kbsPersonKind = "foreign";
        else if (digits.startsWith("99") && digits.length >= 9) kbsPersonKind = "ykn_foreign";
        else if (/^[1-9]\d{10}$/.test(digits)) kbsPersonKind = "tc_citizen";
        else kbsPersonKind = "foreign";
      }

      const gwPayload = {
        hotelId,
        guestDocumentId,
        stayAssignmentId: stay.id,
        transactionId: txId,
        fullName: guest.full_name ?? null,
        firstName: guest.first_name ?? null,
        lastName: guest.last_name ?? null,
        middleName:
          guest.middle_name ??
          (typeof parsed.middleName === "string" ? parsed.middleName : null),
        documentNumber,
        documentSeries,
        nationalityCode: doc.nationality_code ?? guest.nationality_code ?? null,
        issuingCountryCode: doc.issuing_country_code ?? null,
        birthDate,
        gender,
        roomNumber: room.room_number ?? null,
        checkInAt: stay.check_in_at ? String(stay.check_in_at) : new Date().toISOString(),
        checkOutAt: stay.check_out_at ? String(stay.check_out_at) : null,
        documentExpiryDate: doc.expiry_date ? String(doc.expiry_date) : null,
        usageKind: doc.usage_kind ? String(doc.usage_kind) : "konaklama",
        kbsPersonKind,
        plateNumber: doc.plate_number ?? null,
        phone: doc.guest_phone_submitted ?? null,
        forwardDated: Boolean(doc.forward_dated),
        fatherName: guest.father_name ?? null,
        motherName: guest.mother_name ?? null,
        maritalStatus:
          typeof parsed.maritalStatus === "string"
            ? parsed.maritalStatus
            : typeof parsed.marital_status === "string"
              ? parsed.marital_status
              : null,
      };

      const now = new Date().toISOString();
      await admin
        .schema("ops")
        .from("official_submission_transactions")
        .update({ kbs_status: "pending", kbs_last_attempt_at: now })
        .eq("id", txId);

      const gwRes = await postKbsCoreGateway<{ externalReference?: string }>("/gateway/check-in", gwPayload);
      if (!gwRes.ok) {
        await admin
          .schema("ops")
          .from("official_submission_transactions")
          .update({
            status: "failed",
            error_message: gwRes.message,
            kbs_status: "failed",
            kbs_last_attempt_at: now,
            kbs_error_code: gwRes.code,
            kbs_error_message: gwRes.message,
          })
          .eq("id", txId);
        return json({
          ok: false,
          error: { code: gwRes.code, message: gwRes.message, details: gwRes.details },
        });
      }

      const sentAt = new Date().toISOString();
      await admin
        .schema("ops")
        .from("official_submission_transactions")
        .update({
          status: "submitted",
          external_reference: gwRes.data?.externalReference ?? null,
          submitted_at: sentAt,
          kbs_status: "success",
          kbs_last_attempt_at: sentAt,
          kbs_sent_at: sentAt,
          kbs_error_code: null,
          kbs_error_message: null,
          kbs_response_payload: gwRes.data as object,
        })
        .eq("id", txId);

      await admin
        .schema("ops")
        .from("guest_documents")
        .update({
          scan_status: "submitted",
          submitted_at: sentAt,
          document_series: documentSeries,
          kbs_person_kind: kbsPersonKind,
        })
        .eq("id", guestDocumentId);
      await admin
        .schema("ops")
        .from("stay_assignments")
        .update({ stay_status: "checked_in" })
        .eq("id", stay.id);

      return json({ ok: true, data: { transactionId: txId, idempotent: false } });
    }

    return json({
      ok: false,
      error: {
        code: "BAD_REQUEST",
        message:
          "action: list_rooms | ensure_room | deactivate_room | assign_room | assign_rooms_batch | submit_check_in",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[kbs-staff-ops]", message, e);
    return json({ ok: false, error: { code: "INTERNAL", message: message || "Edge internal error" } });
  }
});
