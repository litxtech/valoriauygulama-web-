import { proxyPaymentEdge } from './_lib/payment-proxy.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  return proxyPaymentEdge(request, 'open-payment');
}
