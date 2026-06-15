/** Ürün kartı / listede görünecek görsel: önce ürün image_url, yoksa hareket fotoğrafı. */
export function resolveStockProductImageUrl(
  imageUrl: string | null | undefined,
  fallbackFromMovement: string | null | undefined
): string | null {
  const primary = (imageUrl ?? '').trim();
  if (primary) return primary;
  const fb = (fallbackFromMovement ?? '').trim();
  return fb || null;
}

/** Hareket listesinden ürün başına en son photo_proof (created_at desc sıralı gelmeli). */
export function buildLatestPhotoProofByProductId(
  movements: Array<{ product_id: string; photo_proof: string | null }>
): Record<string, string> {
  const byProduct: Record<string, string> = {};
  for (const m of movements) {
    const pid = m.product_id;
    const url = (m.photo_proof ?? '').trim();
    if (pid && url && !(pid in byProduct)) byProduct[pid] = url;
  }
  return byProduct;
}

/** Stok girişi onayında ürün kapak görseli güncellemesi. */
export function stockProductImagePatchFromEntry(
  photoProof: string | null | undefined,
  movementType: string
): { image_url: string } | null {
  const url = (photoProof ?? '').trim();
  if (!url || movementType !== 'in') return null;
  return { image_url: url };
}
