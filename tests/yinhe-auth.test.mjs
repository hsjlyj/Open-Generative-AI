import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getAccountSession,
  getStudioSessionOwner,
  signAccountSession,
  signStudioSession,
  verifyStudioAccessToken,
  verifyStudioSession,
} from '../lib/yinhe-auth.js';

const secret = 'test-session-signing-secret';

test('signStudioSession creates a session that verifies before expiry', () => {
  const token = signStudioSession({ secret, now: 1_700_000_000, ttlSeconds: 60 });

  assert.equal(
    verifyStudioSession(token, { secret, now: 1_700_000_030 }),
    true,
  );
});

test('verifyStudioSession rejects altered and expired sessions', () => {
  const token = signStudioSession({ secret, now: 1_700_000_000, ttlSeconds: 60 });

  assert.equal(
    verifyStudioSession(`${token}x`, { secret, now: 1_700_000_030 }),
    false,
  );
  assert.equal(
    verifyStudioSession(token, { secret, now: 1_700_000_061 }),
    false,
  );
});

test('verifyStudioAccessToken accepts only the configured access token', () => {
  assert.equal(verifyStudioAccessToken('correct-token', 'correct-token'), true);
  assert.equal(verifyStudioAccessToken('wrong-token', 'correct-token'), false);
  assert.equal(verifyStudioAccessToken('', 'correct-token'), false);
});

test('a signed studio session exposes a stable random owner ID only after verification', () => {
  const owner = '0123456789abcdef0123456789abcdef';
  const token = signStudioSession({
    secret,
    now: 1_700_000_000,
    ttlSeconds: 60,
    sessionId: owner,
  });

  assert.equal(getStudioSessionOwner(token, { secret, now: 1_700_000_030 }), owner);
  assert.equal(getStudioSessionOwner(`${token}x`, { secret, now: 1_700_000_030 }), null);
});

test('account sessions accept database UUID user IDs and normalize media ownership', () => {
  const user = { id: 'be19b17c-d8b2-4001-b6dc-4ae1d7ec7bea', role: 'admin' };
  const token = signAccountSession({ user, secret, now: 1_700_000_000, ttlSeconds: 60 });
  assert.deepEqual(getAccountSession(token, { secret, now: 1_700_000_030 }), { id: user.id, role: 'admin', expiresAt: 1_700_000_060 });
  assert.equal(getStudioSessionOwner(token, { secret, now: 1_700_000_030 }), 'be19b17cd8b24001b6dc4ae1d7ec7bea');
});
