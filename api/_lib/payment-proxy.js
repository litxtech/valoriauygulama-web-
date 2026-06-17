/** @param {Request} request @param {string} edgeFunction */
export async function proxyPaymentEdge(request, edgeFunction) {
  const supabaseUrl = (
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/$/, '');
  const anonKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    '';

  if (!supabaseUrl) {
    return new Response('Supabase URL yapılandırılmamış', { status: 500 });
  }

  const incoming = new URL(request.url);
  const target = new URL(`${supabaseUrl}/functions/v1/${edgeFunction}`);
  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const headers = new Headers();
  const ua = request.headers.get('user-agent');
  if (ua) headers.set('user-agent', ua);
  headers.set('accept', request.headers.get('accept') || 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8');
  if (anonKey) {
    headers.set('apikey', anonKey);
    headers.set('authorization', `Bearer ${anonKey}`);
  }

  const method =
    request.method === 'HEAD' ? 'HEAD' : request.method === 'POST' ? 'POST' : 'GET';

  /** @type {RequestInit} */
  const fetchInit = {
    method,
    headers,
    redirect: 'manual',
  };

  if (method === 'POST') {
    const contentType = request.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    fetchInit.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), fetchInit);
  } catch {
    return new Response('Ödeme sunucusuna ulaşılamadı. Lütfen tekrar deneyin.', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'transfer-encoding') return;
    outHeaders.set(key, value);
  });
  outHeaders.set('cache-control', 'no-store');

  if (method === 'HEAD' || upstream.status >= 300 && upstream.status < 400) {
    return new Response(null, { status: upstream.status, headers: outHeaders });
  }

  const bodyText = await upstream.text();
  const trimmed = bodyText.trimStart();
  const looksHtml =
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<HTML');

  if (looksHtml && !String(outHeaders.get('content-type') ?? '').includes('text/html')) {
    outHeaders.set('content-type', 'text/html; charset=utf-8');
  }

  return new Response(bodyText, {
    status: upstream.status,
    headers: outHeaders,
  });
}
