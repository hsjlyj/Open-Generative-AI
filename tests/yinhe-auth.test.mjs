import test from 'node:test';
import assert from 'node:assert/strict';

import {
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
