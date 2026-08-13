import { createHmac, randomUUID } from 'node:crypto';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_SECONDS = 10 * 60;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXTENSIONS_BY_TYPE = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
};
const OWNER_PATTERN = /^[a-f0-9]{32}$/;

function normalizeWorkerUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isMediaId(value) {
  return typeof value === 'string' && /^media_[a-f0-9]{32}$/.test(value);
}

function isMediaOwner(value) {
  return typeof value === 'string' && OWNER_PATTERN.test(value);
}

function signaturePayload({ method, mediaId, owner = '', type = '', size = '', expiresAt }) {
  return [method, mediaId, owner, type, String(size), String(expiresAt)].join('\n');
}

export function signMediaCapability(capability, signingSecret) {
  return createHmac('sha256', signingSecret)
    .update(signaturePayload(capability))
    .digest('base64url');
}

export function getMediaSettings(env = process.env) {
  const workerUrl = normalizeWorkerUrl(env.AIGC_MEDIA_WORKER_URL);
  const signingSecret = typeof env.AIGC_MEDIA_SIGNING_SECRET === 'string'
    ? env.AIGC_MEDIA_SIGNING_SECRET
    : '';
  return workerUrl && signingSecret ? { workerUrl, signingSecret } : null;
}

export function validateImageUpload({ name, type, size }) {
  const extension = typeof name === 'string' ? name.trim().split('.').pop()?.toLowerCase() : '';
  if (!IMAGE_TYPES.has(type) || !EXTENSIONS_BY_TYPE[type].has(extension)) {
    throw new Error('Only JPG, PNG, and WebP image uploads are supported.');
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) {
    throw new Error('Images must be between 1 byte and 10 MiB.');
  }
}

export function createMediaUploadCapability(file, settings, {
  owner,
  now = Math.floor(Date.now() / 1000),
  idFactory = () => `media_${randomUUID().replaceAll('-', '')}`,
} = {}) {
  if (!settings?.workerUrl || !settings?.signingSecret) {
    throw new Error('Media storage is not configured.');
  }
  if (!isMediaOwner(owner)) {
    throw new Error('A verified studio session is required for image uploads.');
  }
  validateImageUpload(file);

  const mediaId = idFactory();
  if (!isMediaId(mediaId)) {
    throw new Error('The media ID generator returned an invalid ID.');
  }

  const expiresAt = now + UPLOAD_TTL_SECONDS;
  const type = file.type;
  const size = file.size;
  const sig = signMediaCapability({ method: 'PUT', mediaId, owner, type, size, expiresAt }, settings.signingSecret);
  const url = new URL(`${settings.workerUrl}/upload/${mediaId}`);
  url.searchParams.set('owner', owner);
  url.searchParams.set('type', type);
  url.searchParams.set('size', String(size));
  url.searchParams.set('expires', String(expiresAt));
  url.searchParams.set('sig', sig);

  return { mediaId, uploadUrl: url.toString(), expiresAt };
}

export function createMediaReadUrl(mediaId, settings, {
  owner,
  method = 'GET',
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = 30 * 60,
} = {}) {
  if (!settings?.workerUrl || !settings?.signingSecret || !isMediaId(mediaId) || !isMediaOwner(owner) || !['GET', 'HEAD'].includes(method)) {
    console.error('[createMediaReadUrl] Validation failed:', {
      hasWorkerUrl: !!settings?.workerUrl,
      hasSigningSecret: !!settings?.signingSecret,
      mediaId,
      isValidMediaId: isMediaId(mediaId),
      owner,
      isValidOwner: isMediaOwner(owner),
      method,
      isValidMethod: ['GET', 'HEAD'].includes(method),
    });
    throw new Error('Invalid media read request.');
  }
  const expiresAt = now + ttlSeconds;
  const sig = signMediaCapability({ method, mediaId, owner, expiresAt }, settings.signingSecret);
  const url = new URL(`${settings.workerUrl}/media/${mediaId}`);
  url.searchParams.set('owner', owner);
  url.searchParams.set('expires', String(expiresAt));
  url.searchParams.set('sig', sig);
  return url.toString();
}

export { isMediaId };
