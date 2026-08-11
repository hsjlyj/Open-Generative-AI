import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;
const ACCOUNT_ID_PATTERN = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})$/;

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safelyEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseStudioSession(token, { secret, now = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== 'string' || !secret) return null;

  const [version, expiresAtText, sessionId, receivedSignature, ...extra] = token.split('.');
  const expiresAt = Number(expiresAtText);
  const payload = `${version}.${expiresAtText}.${sessionId}`;
  if (
    extra.length > 0
    || version !== 'v2'
    || !Number.isSafeInteger(expiresAt)
    || expiresAt <= now
    || !SESSION_ID_PATTERN.test(sessionId)
    || !receivedSignature
    || !safelyEqual(receivedSignature, signature(payload, secret))
  ) {
    return null;
  }
  return { expiresAt, sessionId };
}

export function verifyStudioAccessToken(providedToken, configuredToken) {
  if (typeof providedToken !== 'string' || typeof configuredToken !== 'string') {
    return false;
  }

  return safelyEqual(providedToken, configuredToken);
}

export function signStudioSession({
  secret,
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = 60 * 60 * 12,
  sessionId = randomUUID().replaceAll('-', ''),
}) {
  if (!secret) {
    throw new Error('A session signing secret is required.');
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error('A valid session ID is required.');
  }

  const expiresAt = Math.floor(now + ttlSeconds);
  const payload = `v2.${expiresAt}.${sessionId}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyStudioSession(token, options) {
  return Boolean(parseStudioSession(token, options) || getAccountSession(token, options));
}

export function getStudioSessionOwner(token, options) {
  const studioOwner = parseStudioSession(token, options)?.sessionId;
  if (studioOwner) return studioOwner;
  return getAccountSession(token, options)?.id.replaceAll('-', '') || null;
}

export function signAccountSession({ user, secret, now = Math.floor(Date.now() / 1000), ttlSeconds = 60 * 60 * 24 * 7 }) {
  if (!user?.id || !['user', 'admin'].includes(user.role) || !secret) throw new Error('A valid account and session secret are required.');
  const expiresAt = now + ttlSeconds;
  const payload = `v3.${expiresAt}.${user.id}.${user.role}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function getAccountSession(token, { secret, now = Math.floor(Date.now() / 1000) }) {
  if (typeof token !== 'string' || !secret) return null;
  const [version, expiresText, userId, role, receivedSignature, ...extra] = token.split('.');
  const expiresAt = Number(expiresText);
  const payload = `${version}.${expiresText}.${userId}.${role}`;
  if (extra.length || version !== 'v3' || !Number.isSafeInteger(expiresAt) || expiresAt <= now || !ACCOUNT_ID_PATTERN.test(userId) || !['user', 'admin'].includes(role) || !receivedSignature || !safelyEqual(receivedSignature, signature(payload, secret))) return null;
  return { id: userId, role, expiresAt };
}
