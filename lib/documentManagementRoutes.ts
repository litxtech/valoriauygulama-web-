import { usePathname } from 'expo-router';

export type DocumentsBasePath = '/admin/documents' | '/staff/documents';

export function useDocumentsBasePath(): DocumentsBasePath {
  const pathname = usePathname();
  return pathname?.startsWith('/admin') ? '/admin/documents' : '/staff/documents';
}

export function documentDetailHref(base: DocumentsBasePath, id: string): string {
  return `${base}/${id}`;
}
