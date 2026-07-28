/**
 * Gelecek yıl değerlendirmesi — olay geçmişi ve tek puana dayalı kurumsal analiz.
 */
import { supabase } from '@/lib/supabase';
import { getPerfBand } from '@/lib/staffPerfBands';
import type { StaffPerfDossier, StaffPerfEvent } from '@/lib/staffPerfSystem';

export type StaffPerfAiPayload = {
  retain_next_year: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  promotion_eligible: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  can_be_supervisor: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  salary_increase: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  needs_training: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  department_change: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  attrition_risk: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  long_term_contribution: { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string };
  guest_impact: string;
  team_impact: string;
  risk_analysis: string;
  general_manager_comment: string;
  score: number;
  band: string;
  positive_events: number;
  negative_events: number;
  net_delta: number;
  category_breakdown: { name: string; net: number; count: number }[];
};

function yesNo(
  answer: boolean,
  confidence: 'high' | 'medium' | 'low',
  rationale: string
): { answer: boolean; confidence: 'high' | 'medium' | 'low'; rationale: string } {
  return { answer, confidence, rationale };
}

function categoryNet(events: StaffPerfEvent[]): Map<string, { net: number; count: number }> {
  const map = new Map<string, { net: number; count: number }>();
  for (const e of events) {
    const key = e.category_id ?? 'genel';
    const cur = map.get(key) ?? { net: 0, count: 0 };
    cur.net += e.delta_points;
    cur.count += 1;
    map.set(key, cur);
  }
  return map;
}

export function buildStaffPerfAiEvaluation(input: {
  score: number;
  events: StaffPerfEvent[];
  categoryNames?: Record<string, string>;
  warningsCount?: number;
  fullName?: string | null;
  department?: string | null;
}): StaffPerfAiPayload {
  const score = Math.max(0, Math.min(100, Math.round(input.score)));
  const band = getPerfBand(score);
  const events = input.events ?? [];
  const positive = events.filter((e) => e.delta_points > 0);
  const negative = events.filter((e) => e.delta_points < 0);
  const net = events.reduce((s, e) => s + e.delta_points, 0);
  const warn = input.warningsCount ?? 0;
  const recentNeg = negative.filter(
    (e) => Date.now() - new Date(e.conducted_at).getTime() < 90 * 24 * 60 * 60 * 1000
  ).length;

  const cats = categoryNet(events);
  const category_breakdown = [...cats.entries()].map(([id, v]) => ({
    name: input.categoryNames?.[id] ?? id,
    net: v.net,
    count: v.count,
  }));

  const guestNet = category_breakdown
    .filter((c) => /misafir|guest/i.test(c.name))
    .reduce((s, c) => s + c.net, 0);
  const teamNet = category_breakdown
    .filter((c) => /takım|team|davranış|disiplin/i.test(c.name))
    .reduce((s, c) => s + c.net, 0);

  const retain = score >= 60 && recentNeg < 5 && warn < 3;
  const promo = score >= 85 && positive.length >= 3 && negative.length <= positive.length;
  const supervisor = score >= 88 && teamNet >= 0 && warn === 0;
  const raise = score >= 80 && net >= 0;
  const training = score < 75 || recentNeg >= 3;
  const deptChange = score >= 50 && score < 70 && recentNeg >= 4;
  const attrition = score < 55 || (recentNeg >= 5 && net < -8);
  const longTerm = score >= 75 && net >= -2;

  const name = input.fullName?.trim() || 'Personel';
  const dept = input.department?.trim() || 'atanmamış departman';

  return {
    retain_next_year: yesNo(
      retain,
      score >= 70 ? 'high' : 'medium',
      retain
        ? `${name} mevcut puanı (${score}) ve olay profili gelecek yıl istihdam için uygundur.`
        : `${name} için puan/disiplin profili gelecek yıl istihdam kararını riskli kılmaktadır.`
    ),
    promotion_eligible: yesNo(
      promo,
      promo ? 'medium' : 'high',
      promo
        ? 'Üstün/başarılı bant ve olumlu olay yoğunluğu terfi değerlendirmesini destekler.'
        : 'Terfi için puan ve olumlu katkı eşiği henüz karşılanmamıştır.'
    ),
    can_be_supervisor: yesNo(
      supervisor,
      supervisor ? 'medium' : 'high',
      supervisor
        ? 'Liderlik potansiyeli; takım etkisi ve disiplin geçmişi şeflik için elverişlidir.'
        : 'Şeflik için yeterli istikrar ve liderlik göstergesi oluşmamıştır.'
    ),
    salary_increase: yesNo(
      raise,
      'medium',
      raise
        ? 'Performans bandı ve net katkı maaş artışı önerisini destekler.'
        : 'Maaş artışı öncesi performans iyileştirmesi önerilir.'
    ),
    needs_training: yesNo(
      training,
      'high',
      training
        ? 'Eğitim planı (iş kalitesi, misafir iletişimi veya disiplin) önerilir.'
        : 'Mevcut eğitim seviyesi yeterli görünmektedir; gelişim programı isteğe bağlıdır.'
    ),
    department_change: yesNo(
      deptChange,
      'low',
      deptChange
        ? `${dept} içinde tekrarlayan olumsuz olaylar nedeniyle rotasyon değerlendirilebilir.`
        : 'Departman değişikliği için zorunlu gerekçe görülmemektedir.'
    ),
    attrition_risk: yesNo(
      attrition,
      attrition ? 'high' : 'medium',
      attrition
        ? 'Düşük puan ve yoğun olumsuz olaylar işten ayrılma / işten çıkarma riskini artırmaktadır.'
        : 'İşten ayrılma riski düşük-orta seviyededir.'
    ),
    long_term_contribution: yesNo(
      longTerm,
      'medium',
      longTerm
        ? 'Uzun vadeli otel katkısı potansiyeli yüksektir.'
        : 'Uzun vadeli katkı için istikrarlı iyileşme gerekir.'
    ),
    guest_impact:
      guestNet > 0
        ? 'Misafir memnuniyetine net olumlu katkı gözlenmektedir.'
        : guestNet < 0
          ? 'Misafir tarafında olumsuz olaylar puanı düşürmüştür; yakın takip gerekir.'
          : 'Misafir etkisi nötr veya kayıt yetersizdir.',
    team_impact:
      teamNet > 0
        ? 'Takım içi davranış ve işbirliği olumlu yöndedir.'
        : teamNet < 0
          ? 'Takım ve disiplin kayıtlarında risk sinyalleri vardır.'
          : 'Takım etkisi için daha fazla gözlem kaydı önerilir.',
    risk_analysis: [
      `Bant: ${band.labelTr} (${score}/100).`,
      `Net olay etkisi: ${net > 0 ? '+' : ''}${net}; +${positive.length} / −${negative.length}.`,
      warn > 0 ? `Resmi uyarı sayısı: ${warn}.` : 'Resmi uyarı kaydı yok.',
      recentNeg >= 3 ? 'Son 90 günde yoğun olumsuz olay.' : 'Son 90 gün risk yoğunluğu kabul edilebilir.',
    ].join(' '),
    general_manager_comment: `${name} (${dept}) için resmi performans puanı ${score}/100 — ${band.labelTr}. ${
      retain
        ? 'Gelecek yıl planlamasında kadroda tutulması önerilir.'
        : 'Gelecek yıl için iyileştirme planı veya yeniden değerlendirme şarttır.'
    } ${training ? 'Eğitim aksiyonu tanımlanmalıdır.' : ''} ${
      promo ? 'Terfi / sorumluluk artışı görüşülebilir.' : ''
    }`.trim(),
    score,
    band: band.labelTr,
    positive_events: positive.length,
    negative_events: negative.length,
    net_delta: net,
    category_breakdown,
  };
}

export async function saveStaffPerfAiEvaluation(params: {
  organizationId: string;
  staffId: string;
  evaluationYear: number;
  payload: StaffPerfAiPayload;
  preparedByStaffId: string;
}): Promise<{ data: { id: string; report_number: string } | null; error?: string }> {
  const { data: reportNo, error: rnErr } = await supabase.rpc('staff_perf_next_ai_report_number', {
    p_org_id: params.organizationId,
  });
  if (rnErr) return { data: null, error: rnErr.message };

  const row = {
    organization_id: params.organizationId,
    staff_id: params.staffId,
    evaluation_year: params.evaluationYear,
    report_number: String(reportNo),
    payload: params.payload,
    overall_recommendation: params.payload.general_manager_comment,
    prepared_by_staff_id: params.preparedByStaffId,
  };

  const { data, error } = await supabase
    .from('staff_perf_ai_evaluations')
    .upsert(row, { onConflict: 'staff_id,evaluation_year' })
    .select('id, report_number')
    .single();

  if (error) return { data: null, error: error.message };
  return { data: data as { id: string; report_number: string } };
}

export function buildAiFromDossier(
  dossier: StaffPerfDossier,
  categoryNames?: Record<string, string>
): StaffPerfAiPayload {
  const staff = dossier.staff;
  return buildStaffPerfAiEvaluation({
    score: Number(staff.performance_score ?? 100),
    events: dossier.events,
    categoryNames,
    warningsCount: dossier.warnings?.length ?? 0,
    fullName: (staff.full_name as string) ?? null,
    department: (staff.department as string) ?? null,
  });
}
