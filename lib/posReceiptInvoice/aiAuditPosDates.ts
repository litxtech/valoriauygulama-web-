import { supabase } from '@/lib/supabase';
import { invokeSupabaseEdgeFunction } from '@/lib/edgeInvokeTimeout';
import { validateBatchReceiptDates } from '@/lib/posReceiptInvoice/validatePosDates';
import type { BatchReceiptItem } from '@/lib/posReceiptInvoice/batchScanPosReceipts';
import type { ParsedPosReceipt } from '@/lib/posReceiptInvoice/types';

export type AiDateAuditResult = {
  key: string;
  date: string | null;
  time: string | null;
  confidence: 'high' | 'medium' | 'low';
  action: 'keep' | 'fix' | 'fill' | 'flag';
  reason: string;
  flags: string[];
};

function toIsoDateTime(date: string | null, time: string | null): string | null {
  if (!date) return null;
  const t = time || '12:00:00';
  const d = new Date(`${date}T${t}+03:00`);
  if (Number.isNaN(d.getTime())) return `${date}T${t}+03:00`;
  return d.toISOString();
}

function applyDateToParsed(
  parsed: ParsedPosReceipt | null | undefined,
  date: string,
  time: string | null
): ParsedPosReceipt | null {
  if (!parsed) return null;
  return {
    ...parsed,
    receiptDate: date,
    receiptTime: time ?? parsed.receiptTime,
    receiptAt: toIsoDateTime(date, time ?? parsed.receiptTime),
    invoiceDueOn: date,
    paymentReceivedOn: date,
    warnings: [
      ...(parsed.warnings ?? []).filter((w) => !/tarih/i.test(w)),
      'AI ile tarih doğrulandı',
    ],
  };
}

/**
 * Batch fişlerinde AI ile tarih kontrolü.
 * Eksik/yanlış tarihleri düzeltir; şüphelileri uyarıya yazar.
 */
export async function aiAuditBatchReceiptDates(opts: {
  items: BatchReceiptItem[];
  onProgress?: (done: number, total: number) => void;
}): Promise<{
  items: BatchReceiptItem[];
  fixed: number;
  flagged: number;
  results: AiDateAuditResult[];
}> {
  const items = opts.items.map((x) => ({ ...x }));
  const targets = items
    .map((it, index) => ({ it, index }))
    .filter(
      ({ it }) =>
        (it.status === 'review' || it.status === 'error') &&
        (!!it.parsed?.rawText || !!it.receiptDate || !it.receiptDate)
    );

  if (!targets.length) {
    return { items, fixed: 0, flagged: 0, results: [] };
  }

  const qa = validateBatchReceiptDates(
    targets.map(({ it }) => ({
      key: it.key,
      receiptDate: it.invoiceDueOn || it.receiptDate,
      warnings: it.warnings,
    }))
  );
  const consensus =
    qa.find((q) => q.suggestedDate)?.suggestedDate ??
    targets.map(({ it }) => it.invoiceDueOn || it.receiptDate).find((d) => !!d) ??
    null;

  opts.onProgress?.(0, targets.length);

  const payload = targets.map(({ it }) => ({
    key: it.key,
    rawText: it.parsed?.rawText ?? null,
    currentDate: it.invoiceDueOn || it.receiptDate || null,
    batchConsensusDate: consensus,
  }));

  const { data, error } = await invokeSupabaseEdgeFunction(
    'pos-receipt-date-check',
    {
      body: { items: payload, batchConsensusDate: consensus },
    },
    90_000
  );

  if (error) {
    const msg =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: string }).message)
        : 'AI tarih kontrolü başarısız';
    throw new Error(msg);
  }

  const body = data as {
    ok?: boolean;
    results?: AiDateAuditResult[];
    error?: { message?: string };
    summary?: { fixed?: number; flagged?: number };
  };

  if (!body?.ok || !Array.isArray(body.results)) {
    throw new Error(body?.error?.message ?? 'AI tarih kontrolü yanıtı geçersiz');
  }

  const byKey = new Map(body.results.map((r) => [r.key, r]));
  let fixed = 0;
  let flagged = 0;

  for (const { it, index } of targets) {
    const r = byKey.get(it.key);
    if (!r) continue;

    const warnings = [...(it.warnings ?? [])].filter((w) => !w.startsWith('🤖'));
    const apply =
      (r.action === 'fix' || r.action === 'fill') &&
      r.date &&
      (r.confidence === 'high' || r.confidence === 'medium');

    if (apply && r.date) {
      fixed += 1;
      const parsed = applyDateToParsed(it.parsed, r.date, r.time);
      items[index] = {
        ...it,
        receiptDate: r.date,
        invoiceDueOn: r.date,
        parsed,
        warnings: [
          ...warnings,
          `🤖 AI tarih: ${r.date}${r.reason ? ` — ${r.reason}` : ''}`,
        ],
        error: undefined,
        status: it.status === 'error' && parsed ? 'review' : it.status,
      };
    } else if (r.action === 'flag' || r.flags?.length) {
      flagged += 1;
      items[index] = {
        ...it,
        warnings: [
          ...warnings,
          `🤖 ${r.reason || 'Tarih kontrol edilmeli'}${r.date ? ` (öneri: ${r.date})` : ''}`,
        ],
      };
    } else if (r.action === 'keep' && r.reason) {
      // sessiz bırak veya hafif not
    }
  }

  opts.onProgress?.(targets.length, targets.length);

  // Yerel QA bayraklarını da ekle
  const afterQa = validateBatchReceiptDates(
    items.map((it) => ({
      key: it.key,
      receiptDate: it.invoiceDueOn || it.receiptDate,
      warnings: it.warnings,
    }))
  );
  const withQa = afterQa.reduce((acc, q) => {
    if (!q.message) return acc;
    const i = acc.findIndex((x) => x.key === q.key);
    if (i < 0) return acc;
    const warnings = [...(acc[i].warnings ?? [])];
    if (!warnings.some((w) => w.includes(q.message!))) {
      warnings.unshift(`🗓 ${q.message}`);
    }
    acc[i] = { ...acc[i], warnings };
    return acc;
  }, items);

  return {
    items: withQa,
    fixed: body.summary?.fixed ?? fixed,
    flagged: body.summary?.flagged ?? flagged,
    results: body.results,
  };
}

/** Tek fiş OCR metninden AI tarih (editör / yeniden okuma) */
export async function aiAuditSingleReceiptDate(args: {
  key?: string;
  rawText: string;
  currentDate?: string | null;
}): Promise<AiDateAuditResult | null> {
  const key = args.key ?? 'single';
  const { data, error } = await invokeSupabaseEdgeFunction(
    'pos-receipt-date-check',
    {
      body: {
        items: [
          {
            key,
            rawText: args.rawText,
            currentDate: args.currentDate ?? null,
          },
        ],
      },
    },
    60_000
  );
  if (error) {
    const msg =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: string }).message)
        : 'AI tarih kontrolü başarısız';
    throw new Error(msg);
  }
  const body = data as { ok?: boolean; results?: AiDateAuditResult[]; error?: { message?: string } };
  if (!body?.ok || !body.results?.[0]) {
    throw new Error(body?.error?.message ?? 'AI tarih bulunamadı');
  }
  return body.results[0];
}

/** Oturum token'ının edge'e gittiğinden emin ol (supabase client zaten ekler) */
export async function ensurePosDateAiReady(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data.session?.access_token;
}
