/**
 * Vercel Edge Middleware — eski valoria.tr /payment/* → Supabase Edge (HTML düzgün render).
 */
import { proxyPaymentEdge } from './api/_lib/payment-proxy.js';

export const config = {
  matcher: [
    '/payment/qr',
    '/payment/qr/',
    '/payment',
    '/payment/',
    '/odeme/qr',
    '/odeme/qr/',
    '/odeme',
    '/odeme/',
  ],
};

/** @param {string} pathname */
function edgeFunctionFromPath(pathname) {
  const p = (pathname || '').replace(/\/$/, '') || '/';
  if (p === '/payment/qr' || p === '/odeme/qr') return 'open-payment-qr';
  return 'open-payment';
}

/** @param {import('@vercel/edge').NextRequest} request */
export default async function middleware(request) {
  const pathname = new URL(request.url).pathname;
  return proxyPaymentEdge(request, edgeFunctionFromPath(pathname));
}
