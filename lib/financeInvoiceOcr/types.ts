export type InvoiceLineItem = {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  total: number;
};

export type ParsedSupplierInvoice = {
  rawText: string;
  ocrEngine: string | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  supplierName: string | null;
  supplierTaxId: string | null;
  buyerName: string | null;
  lineItems: InvoiceLineItem[];
  subtotal: number | null;
  taxAmount: number | null;
  grandTotal: number | null;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  sourceKind: 'image' | 'pdf' | 'xml' | 'text' | 'mixed';
};

export type InvoiceScanResult = ParsedSupplierInvoice & {
  sourceUri: string;
  sourceFileName: string | null;
  sourceUris?: string[];
};
