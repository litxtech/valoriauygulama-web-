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
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
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

  return new Response(upstream.body, {
    status: upstream.status,
    headers: outHeaders,
  });
}
