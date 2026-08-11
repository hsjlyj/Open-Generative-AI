const ORIGIN = 'https://open-generative-ai-beige.vercel.app';

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const upstream = new URL(request.url);
    upstream.protocol = 'https:';
    upstream.hostname = new URL(ORIGIN).hostname;
    upstream.port = '';

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('X-Forwarded-Host', incoming.host);
    headers.set('X-Forwarded-Proto', 'https');
    headers.set('X-Original-Host', incoming.host);

    const originRequest = new Request(upstream, {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });
    const isStaticAsset = upstream.pathname.startsWith('/_next/static/');
    const originResponse = await fetch(originRequest, isStaticAsset ? {
      cf: { cacheEverything: true, cacheTtl: 86_400 },
    } : undefined);

    const response = new Response(originResponse.body, originResponse);
    response.headers.set('X-Edge-Proxy', 'Cloudflare Worker');
    response.headers.set('X-Robots-Tag', 'noindex');
    return response;
  },
};
