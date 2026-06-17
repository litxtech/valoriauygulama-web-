import type { Href } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { destinationById, isDirectVideoUrl } from '@/lib/staffNotificationActions';
import { isStaffIntroUploadedVideo } from '@/lib/staffIntroNotificationVideo';

export type StaffIntroTemplateDraft = {
  label: string;
  category: string;
  title: string;
  body: string;
  destinationId?: string | null;
  actionLabel?: string | null;
  videoUrl?: string | null;
  videoTitle?: string | null;
};

export type StaffIntroTemplateItem = StaffIntroTemplateDraft & {
  id: string;
  isSystem: boolean;
  isPreset: boolean;
  createdAt?: string | null;
};

type StaffIntroMetadata = {
  staff_intro?: boolean;
  display_label?: string;
  destination_id?: string | null;
  action_label?: string | null;
  video_url?: string | null;
  video_title?: string | null;
  action_enabled?: boolean;
};

/** Tüm otellerde hazır — veritabanına yazılmaz */
export const STAFF_INTRO_PRESET_TEMPLATES: Array<StaffIntroTemplateDraft & { presetId: string }> = [
  {
    presetId: 'facility_journal_training',
    label: 'Kullanım kaydı eğitimi',
    category: 'info',
    title: 'Otel eşyası kullanım kaydı',
    body:
      'Bundan sonra oda içi eşya kullanımını «Otel kullanım kayıtları» ekranından girmeniz gerekiyor. Tanıtım videosunu izleyin ve ardından kayıt ekranına gidin.',
    destinationId: 'facility_journal',
    actionLabel: 'Kullanım kayıtlarını aç',
    videoUrl: '',
    videoTitle: 'Kullanım kaydı nasıl girilir?',
  },
  {
    presetId: 'facility_journal_new_record',
    label: 'Yeni kullanım kaydı hatırlatması',
    category: 'reminder',
    title: 'Yeni kullanım kaydı',
    body: 'Otel eşyası kullandığınızda hemen «Yeni kullanım kaydı» ekranından giriş yapın.',
    destinationId: 'facility_journal_new',
    actionLabel: 'Yeni kayıt ekranını aç',
    videoUrl: '',
    videoTitle: '',
  },
  {
    presetId: 'tasks_intro',
    label: 'Görevler tanıtımı',
    category: 'info',
    title: 'Görevlerinizi uygulamadan takip edin',
    body: 'Size atanan görevler «Görevlerim» sekmesinde listelenir. Bildirime dokunarak doğrudan görev ekranına gidebilirsiniz.',
    destinationId: 'tasks',
    actionLabel: 'Görevlerime git',
    videoUrl: '',
    videoTitle: '',
  },
];

function metadataFromDraft(draft: StaffIntroTemplateDraft): StaffIntroMetadata {
  const hasAction = Boolean(draft.destinationId || draft.videoUrl?.trim());
  return {
    staff_intro: true,
    display_label: draft.label.trim() || draft.title.trim(),
    destination_id: draft.destinationId ?? null,
    action_label: draft.actionLabel?.trim() || null,
    video_url: draft.videoUrl?.trim() || null,
    video_title: draft.videoTitle?.trim() || null,
    action_enabled: hasAction,
  };
}

function rowToItem(row: {
  id: string;
  title?: string | null;
  body?: string | null;
  title_template?: string | null;
  body_template?: string | null;
  category?: string | null;
  metadata?: StaffIntroMetadata | null;
  created_at?: string | null;
}): StaffIntroTemplateItem {
  const meta = (row.metadata ?? {}) as StaffIntroMetadata;
  return {
    id: row.id,
    label: meta.display_label?.trim() || row.title?.trim() || row.title_template?.trim() || 'Şablon',
    category: row.category ?? 'info',
    title: row.title?.trim() || row.title_template?.trim() || '',
    body: row.body?.trim() || row.body_template?.trim() || '',
    destinationId: meta.destination_id ?? null,
    actionLabel: meta.action_label ?? null,
    videoUrl: meta.video_url ?? null,
    videoTitle: meta.video_title ?? null,
    isSystem: false,
    isPreset: false,
    createdAt: row.created_at ?? null,
  };
}

export function presetToItem(preset: (typeof STAFF_INTRO_PRESET_TEMPLATES)[number]): StaffIntroTemplateItem {
  return {
    id: `preset:${preset.presetId}`,
    label: preset.label,
    category: preset.category,
    title: preset.title,
    body: preset.body,
    destinationId: preset.destinationId ?? null,
    actionLabel: preset.actionLabel ?? null,
    videoUrl: preset.videoUrl ?? null,
    videoTitle: preset.videoTitle ?? null,
    isSystem: true,
    isPreset: true,
  };
}

export async function listStaffIntroTemplates(organizationId: string | null): Promise<StaffIntroTemplateItem[]> {
  const presets = STAFF_INTRO_PRESET_TEMPLATES.map(presetToItem);
  if (!organizationId) return presets;

  const { data, error } = await supabase
    .from('notification_templates')
    .select('id, title, body, title_template, body_template, category, metadata, created_at')
    .eq('organization_id', organizationId)
    .eq('template_kind', 'staff_intro')
    .order('created_at', { ascending: false });

  if (error) return presets;
  const custom = ((data ?? []) as Array<Record<string, unknown>>).map((row) =>
    rowToItem({
      id: String(row.id),
      title: typeof row.title === 'string' ? row.title : null,
      body: typeof row.body === 'string' ? row.body : null,
      title_template: typeof row.title_template === 'string' ? row.title_template : null,
      body_template: typeof row.body_template === 'string' ? row.body_template : null,
      category: typeof row.category === 'string' ? row.category : null,
      metadata: (row.metadata as StaffIntroMetadata) ?? null,
      created_at: typeof row.created_at === 'string' ? row.created_at : null,
    })
  );

  return [...presets, ...custom];
}

export async function saveStaffIntroTemplate(params: {
  organizationId: string;
  staffId: string;
  draft: StaffIntroTemplateDraft;
}): Promise<{ id?: string; error?: string }> {
  const { organizationId, staffId, draft } = params;
  const title = draft.title.trim();
  const body = draft.body.trim();
  const label = draft.label.trim() || title;
  if (!title) return { error: 'Başlık gerekli.' };
  if (!body) return { error: 'Mesaj gerekli.' };

  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const code = `staff_intro_${slug || 'custom'}_${Date.now()}`;
  const templateKey = `staff_intro_${Date.now()}`;

  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      organization_id: organizationId,
      code,
      template_kind: 'staff_intro',
      template_key: templateKey,
      target_audience: 'staff',
      category: draft.category || 'info',
      title,
      body,
      title_template: title,
      body_template: body,
      target_role: 'all_staff',
      active: false,
      repeat_type: 'once',
      metadata: metadataFromDraft({ ...draft, label }),
      is_system: false,
      sort_order: 0,
      created_by_staff_id: staffId,
      updated_by_staff_id: staffId,
    })
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  return { id: data?.id as string | undefined };
}

export async function deleteStaffIntroTemplate(templateId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('notification_templates').delete().eq('id', templateId);
  if (error) return { error: error.message };
  return {};
}

export function staffIntroTemplateSummary(item: StaffIntroTemplateItem): string {
  const parts: string[] = [];
  const dest = destinationById(item.destinationId);
  if (dest) parts.push(dest.label);
  const video = item.videoUrl?.trim() || '';
  if (video) {
    if (isStaffIntroUploadedVideo(video)) parts.push('Yüklenen video');
    else if (isDirectVideoUrl(video)) parts.push('Video dosyası');
    else parts.push('Harici video');
  }
  if (parts.length === 0) return 'Yalnızca metin';
  return parts.join(' · ');
}

export function staffIntroTemplateBulkQuery(item: StaffIntroTemplateItem): string {
  const q = new URLSearchParams();
  q.set('audience', 'staff');
  q.set('category', item.category || 'info');
  q.set('title', item.title);
  q.set('body', item.body);
  const hasAction = Boolean(item.destinationId || item.videoUrl?.trim());
  if (hasAction) {
    q.set('actionEnabled', '1');
    if (item.destinationId) q.set('actionDestination', item.destinationId);
    if (item.actionLabel?.trim()) q.set('actionLabel', item.actionLabel.trim());
    if (item.videoUrl?.trim()) q.set('actionVideoUrl', item.videoUrl.trim());
    if (item.videoTitle?.trim()) q.set('actionVideoTitle', item.videoTitle.trim());
  }
  return q.toString();
}

export function staffIntroTemplateBulkHref(item: StaffIntroTemplateItem): Href {
  return `/admin/notifications/bulk?${staffIntroTemplateBulkQuery(item)}` as Href;
}

export function draftFromBulkForm(input: {
  label: string;
  category: string;
  title: string;
  body: string;
  actionEnabled: boolean;
  actionDestinationId: string | null;
  actionLabel: string;
  actionVideoUrl: string;
  actionVideoTitle: string;
}): StaffIntroTemplateDraft {
  return {
    label: input.label.trim() || input.title.trim(),
    category: input.category,
    title: input.title.trim(),
    body: input.body.trim(),
    destinationId: input.actionEnabled ? input.actionDestinationId : null,
    actionLabel: input.actionEnabled ? input.actionLabel.trim() || null : null,
    videoUrl: input.actionEnabled ? input.actionVideoUrl.trim() || null : null,
    videoTitle: input.actionEnabled ? input.actionVideoTitle.trim() || null : null,
  };
}
