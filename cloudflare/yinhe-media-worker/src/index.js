const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MEDIA_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_CAPABILITY_WINDOW_SECONDS = 60 * 60;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MEDIA_ID_PATTERN = /^media_[a-f0-9]{32}$/;

function capabilityPayload({ method, mediaId, type = '', size = '', expiresAt }) {
  return [method, mediaId, type, String(size), String(expiresAt)].join('\n');
}

function decodeBase64Url(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '=';
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function verifyCapability(capability, signature, secret) {
  const signatureBytes = decodeBase64Url(signature);
  if (!signatureBytes || !secret) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(capabilityPayload(capability)),
  );
}

function isAllowedOrigin(request, env) {
  return request.headers.get('Origin') === env.ALLOWED_ORIGIN;
}

function corsHeaders(request, env) {
  const headers = new Headers({ Vary: 'Origin' });
  if (isAllowedOrigin(request, env)) {
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN);
    headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

function json(request, env, body, status) {
  const headers = corsHeaders(request, env);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function parsePath(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  return parts.length === 2 ? { action: parts[0], mediaId: parts[1] } : null;
}

function parseExpires(value) {
  const expiresAt = Number(value);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + MAX_CAPABILITY_WINDOW_SECONDS) {
    return null;
  }
  return expiresAt;
}

async function putMedia(request, env, url, mediaId) {
  if (!isAllowedOrigin(request, env)) return json(request, env, { error: 'Origin is not allowed.' }, 403);

  const type = url.searchParams.get('type') || '';
  const size = Number(url.searchParams.get('size'));
  const expiresAt = parseExpires(url.searchParams.get('expires'));
  const signature = url.searchParams.get('sig');
  if (
    !MEDIA_ID_PATTERN.test(mediaId)
    || !IMAGE_TYPES.has(type)
    || !Number.isSafeInteger(size)
    || size < 1
    || size > MAX_IMAGE_BYTES
    || !expiresAt
    || request.headers.get('Content-Type') !== type
  ) {
    return json(request, env, { error: 'Invalid upload capability.' }, 400);
  }
  const valid = await verifyCapability({ method: 'PUT', mediaId, type, size, expiresAt }, signature, env.AIGC_MEDIA_SIGNING_SECRET);
  if (!valid) return json(request, env, { error: 'Invalid upload capability.' }, 403);

  const content = await request.arrayBuffer();
  if (content.byteLength !== size) {
    return json(request, env, { error: 'Uploaded size does not match the approved file.' }, 400);
  }
  await env.YINHE_MEDIA_KV.put(mediaId, content, {
    expirationTtl: MEDIA_TTL_SECONDS,
    metadata: { contentType: type },
  });
  return json(request, env, { mediaId }, 201);
}

async function getMedia(request, env, url, mediaId) {
  const expiresAt = parseExpires(url.searchParams.get('expires'));
  const signature = url.searchParams.get('sig');
  if (!MEDIA_ID_PATTERN.test(mediaId) || !expiresAt) {
    return new Response('Not found.', { status: 404 });
  }
  const valid = await verifyCapability({ method: request.method, mediaId, expiresAt }, signature, env.AIGC_MEDIA_SIGNING_SECRET);
  if (!valid) return new Response('Not found.', { status: 404 });

  const { value, metadata } = await env.YINHE_MEDIA_KV.getWithMetadata(mediaId, 'arrayBuffer');
  if (!value || !IMAGE_TYPES.has(metadata?.contentType)) {
    return new Response('Not found.', { status: 404 });
  }
  return new Response(request.method === 'HEAD' ? null : value, {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Type': metadata.contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return isAllowedOrigin(request, env)
      ? new Response(null, { status: 204, headers: corsHeaders(request, env) })
      : new Response(null, { status: 403 });
  }

  const path = parsePath(url);
  if (!path) return new Response('Not found.', { status: 404 });
  if (path.action === 'upload' && request.method === 'PUT') return putMedia(request, env, url, path.mediaId);
  if (path.action === 'media' && (request.method === 'GET' || request.method === 'HEAD')) return getMedia(request, env, url, path.mediaId);
  return new Response('Method not allowed.', { status: 405 });
}

export default {
  fetch(request, env) {
    return handleRequest(request, env).catch(() => new Response('Internal error.', { status: 500 }));
  },
};
