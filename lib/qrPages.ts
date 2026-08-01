import { supabase } from '@/lib/supabase';
import { getShareablePublicOrigin } from '@/lib/appPublicUrl';
import { PUBLIC_QR_PAGE_PATH } from '@/constants/publicWebPaths';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

export const QR_PAGE_MEDIA_BUCKET = 'qr-page-media';

export type QrPageBlockType = 'text' | 'image' | 'video';

export type QrPageRow = {
  id: string;
  organization_id: string;
  title: string;
  public_token: string;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type QrPageBlockRow = {
  id: string;
  page_id: string;
  sort_order: number;
  block_type: QrPageBlockType;
  body: string | null;
  media_url: string | null;
  created_at: string;
};

export type PublicQrPageBlock = {
  id: string;
  sort_order: number;
  block_type: QrPageBlockType;
  body: string | null;
  media_url: string | null;
};

export type PublicQrPage = {
  id: string;
  title: string;
  updated_at: string;
  blocks: PublicQrPageBlock[];
};

export function buildPublicQrPageUrl(
  publicToken: string | null | undefined,
  origin?: string | null
): string {
  const base = getShareablePublicOrigin(origin).replace(/\/$/, '');
  const token = String(publicToken ?? '').trim();
  if (!token) return `${base}/${PUBLIC_QR_PAGE_PATH}`;
  return `${base}/${PUBLIC_QR_PAGE_PATH}/${encodeURIComponent(token)}`;
}

function normalizeBlocks(raw: unknown): PublicQrPageBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const row = item as Partial<PublicQrPageBlock>;
      const blockType = row.block_type;
      if (blockType !== 'text' && blockType !== 'image' && blockType !== 'video') return null;
      return {
        id: String(row.id ?? ''),
        sort_order: Number(row.sort_order ?? 0),
        block_type: blockType,
        body: row.body ?? null,
        media_url: row.media_url ?? null,
      } satisfies PublicQrPageBlock;
    })
    .filter((b): b is PublicQrPageBlock => !!b?.id);
}

export async function fetchPublicQrPage(
  publicToken: string
): Promise<{ data: PublicQrPage | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_public_qr_page', { p_token: publicToken });
  if (error) return { data: null, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; title: string; updated_at: string; blocks: unknown }
    | null
    | undefined;
  if (!row?.id) return { data: null, error: null };
  return {
    data: {
      id: row.id,
      title: row.title,
      updated_at: row.updated_at,
      blocks: normalizeBlocks(row.blocks),
    },
    error: null,
  };
}

export async function listQrPages(
  organizationId: string
): Promise<{ data: QrPageRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('qr_pages')
    .select('*')
    .eq('organization_id', organizationId)
    .order('updated_at', { ascending: false });
  if (error) return { data: [], error: error.message };
  return { data: (data as QrPageRow[]) ?? [], error: null };
}

export async function createQrPage(input: {
  organizationId: string;
  title?: string;
  createdByStaffId?: string | null;
}): Promise<{ data: QrPageRow | null; error: string | null }> {
  const title = (input.title ?? '').trim() || 'Yeni sayfa';
  const { data, error } = await supabase
    .from('qr_pages')
    .insert({
      organization_id: input.organizationId,
      title,
      is_published: true,
      created_by: input.createdByStaffId ?? null,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  return { data: data as QrPageRow, error: null };
}

export async function fetchQrPage(
  pageId: string
): Promise<{ data: QrPageRow | null; error: string | null }> {
  const { data, error } = await supabase.from('qr_pages').select('*').eq('id', pageId).maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: (data as QrPageRow | null) ?? null, error: null };
}

export async function updateQrPage(
  pageId: string,
  patch: Partial<Pick<QrPageRow, 'title' | 'is_published'>>
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('qr_pages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', pageId);
  return { error: error?.message ?? null };
}

export async function deleteQrPage(pageId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('qr_pages').delete().eq('id', pageId);
  return { error: error?.message ?? null };
}

export async function listQrPageBlocks(
  pageId: string
): Promise<{ data: QrPageBlockRow[]; error: string | null }> {
  const { data, error } = await supabase
    .from('qr_page_blocks')
    .select('*')
    .eq('page_id', pageId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return { data: [], error: error.message };
  return { data: (data as QrPageBlockRow[]) ?? [], error: null };
}

async function touchQrPage(pageId: string): Promise<void> {
  await supabase.from('qr_pages').update({ updated_at: new Date().toISOString() }).eq('id', pageId);
}

export async function addQrPageTextBlock(
  pageId: string,
  body: string,
  sortOrder: number
): Promise<{ data: QrPageBlockRow | null; error: string | null }> {
  const text = body.trim();
  if (!text) return { data: null, error: 'Metin boş olamaz.' };
  const { data, error } = await supabase
    .from('qr_page_blocks')
    .insert({
      page_id: pageId,
      sort_order: sortOrder,
      block_type: 'text',
      body: text,
      media_url: null,
    })
    .select('*')
    .single();
  if (error) return { data: null, error: error.message };
  await touchQrPage(pageId);
  return { data: data as QrPageBlockRow, error: null };
}

export async function addQrPageMediaBlock(input: {
  pageId: string;
  organizationId: string;
  blockType: 'image' | 'video';
  uri: string;
  sortOrder: number;
}): Promise<{ data: QrPageBlockRow | null; error: string | null }> {
  try {
    const uploaded = await uploadUriToPublicBucket({
      bucketId: QR_PAGE_MEDIA_BUCKET,
      uri: input.uri,
      subfolder: `${input.organizationId}/${input.pageId}`,
      kind: input.blockType,
    });
    const { data, error } = await supabase
      .from('qr_page_blocks')
      .insert({
        page_id: input.pageId,
        sort_order: input.sortOrder,
        block_type: input.blockType,
        body: null,
        media_url: uploaded.publicUrl,
      })
      .select('*')
      .single();
    if (error) return { data: null, error: error.message };
    await touchQrPage(input.pageId);
    return { data: data as QrPageBlockRow, error: null };
  } catch (e) {
    return { data: null, error: (e as Error)?.message || 'Medya yüklenemedi.' };
  }
}

export async function updateQrPageTextBlock(
  blockId: string,
  pageId: string,
  body: string
): Promise<{ error: string | null }> {
  const text = body.trim();
  if (!text) return { error: 'Metin boş olamaz.' };
  const { error } = await supabase
    .from('qr_page_blocks')
    .update({ body: text })
    .eq('id', blockId)
    .eq('page_id', pageId);
  if (error) return { error: error.message };
  await touchQrPage(pageId);
  return { error: null };
}

export async function deleteQrPageBlock(
  blockId: string,
  pageId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('qr_page_blocks')
    .delete()
    .eq('id', blockId)
    .eq('page_id', pageId);
  if (error) return { error: error.message };
  await touchQrPage(pageId);
  return { error: null };
}

export async function reorderQrPageBlocks(
  pageId: string,
  orderedIds: string[]
): Promise<{ error: string | null }> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('qr_page_blocks')
      .update({ sort_order: i })
      .eq('id', orderedIds[i])
      .eq('page_id', pageId);
    if (error) return { error: error.message };
  }
  await touchQrPage(pageId);
  return { error: null };
}
