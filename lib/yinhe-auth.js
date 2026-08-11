import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safelyEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyStudioAccessToken(providedToken, configuredToken) {
  if (typeof providedToken !== 'string' || typeof configuredToken !== 'string') {
    return false;
  }

  return safelyEqual(providedToken, configuredToken);
}

export function signStudioSession({ secret, now = Math.floor(Date.now() / 1000), ttlSeconds = 60 * 60 * 12 }) {
  if (!secret) {
    throw new Error('A session signing secret is required.');
  }

  const expiresAt = Math.floor(now + ttlSeconds);
  const payload = `v1.${expiresAt}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyStudioSession(token, { secret, now = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== 'string' || !secret) {
    return false;
  }

  const [version, expiresAtText, receivedSignature, ...extra] = token.split('.');
  const expiresAt = Number(expiresAtText);
  const payload = `${version}.${expiresAtText}`;

  if (
    extra.length > 0
    || version !== 'v1'
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= now
    || !receivedSignature
  ) {
    return false;
  }

  return safelyEqual(receivedSignature, signature(payload, secret));
}
