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
  if (anonKey) headers.set('apikey', anonKey);

  const upstream = await fetch(target.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    redirect: 'manual',
  });

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
