type WatermarkProcessor = (uri: string) => Promise<string>;

let processor: WatermarkProcessor | null = null;

export const KBS_CAPTURE_WATERMARK_LABEL = 'Valoria KBS';

export function setKbsCaptureWatermarkProcessor(fn: WatermarkProcessor | null): void {
  processor = fn;
}

/** Kimlik görseline Valoria KBS filigranı — host yoksa orijinal URI döner. */
export async function applyKbsCaptureWatermark(uri: string): Promise<string> {
  if (!processor) return uri;
  try {
    return await processor(uri);
  } catch {
    return uri;
  }
}
