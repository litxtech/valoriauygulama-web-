import { DocumentManagementHub } from '@/components/documents/DocumentManagementHub';

export default function AdminDocumentsHome() {
  return <DocumentManagementHub basePath="/admin/documents" showRecent />;
}
