import * as DocumentPicker from 'expo-document-picker';

export type SafeDocumentPickOptions = {
  /** İlk denemede kullanılacak MIME / UTI listesi */
  type?: string | string[];
  multiple?: boolean;
  copyToCacheDirectory?: boolean;
};

export type SafeDocumentPickResult = DocumentPicker.DocumentPickerResult;

// expo-document-picker: joker MIME (text/image wildcard) veya uzun tip listelerinde bazı cihazlarda hata verir.
// Önce tercih edilen tipler denenir; hata olursa tüm dosya tipleriyle tekrar açılır.
export async function pickDocumentSafe(
  options: SafeDocumentPickOptions = {}
): Promise<SafeDocumentPickResult> {
  const base: DocumentPicker.DocumentPickerOptions = {
    multiple: options.multiple ?? false,
    copyToCacheDirectory: options.copyToCacheDirectory ?? true,
  };

  const preferred = options.type;
  if (!preferred || (Array.isArray(preferred) && preferred.length === 0)) {
    return DocumentPicker.getDocumentAsync({ ...base, type: '*/*' });
  }

  try {
    return await DocumentPicker.getDocumentAsync({ ...base, type: preferred });
  } catch {
    try {
      return await DocumentPicker.getDocumentAsync({ ...base, type: '*/*' });
    } catch {
      return { canceled: true, assets: null, output: null };
    }
  }
}

const BANK_STATEMENT_EXTENSIONS = new Set([
  'csv',
  'txt',
  'tsv',
  'xlsx',
  'xls',
  'pdf',
  'xml',
  '940',
  'mt940',
  'sta',
]);

const MIME_TO_BANK_EXT: Record<string, string> = {
  'text/csv': 'csv',
  'text/plain': 'txt',
  'text/comma-separated-values': 'csv',
  'application/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

export function resolveBankStatementFileName(
  name: string | undefined | null,
  mimeType?: string | null
): string {
  const base = name?.trim() || 'ekstre';
  if (isSupportedBankStatementFileName(base)) return base;

  const mime = mimeType?.split(';')[0]?.trim().toLowerCase();
  const ext = mime ? MIME_TO_BANK_EXT[mime] : undefined;
  if (!ext) return base;

  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  return `${stem}.${ext}`;
}

export function isSupportedBankStatementFileName(fileName: string): boolean {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return false;
  const ext = fileName.slice(i + 1).toLowerCase();
  return BANK_STATEMENT_EXTENSIONS.has(ext);
}

/** Banka ekstresi — seçim sonrası uzantı doğrulaması; picker joker MIME kullanmaz */
export const BANK_STATEMENT_PICKER_TYPES = [
  'text/csv',
  'text/plain',
  'text/comma-separated-values',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/xml',
  'text/xml',
  'application/octet-stream',
] as const;
