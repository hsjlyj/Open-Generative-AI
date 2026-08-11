import test from 'node:test';
import assert from 'node:assert/strict';

import { getProviderSettings, isValidTaskId } from '../lib/yinhe-provider.js';

test('getProviderSettings normalizes a configured HTTPS provider URL', () => {
  assert.deepEqual(
    getProviderSettings({
      AIGC_API_BASE_URL: 'https://api-aigc.example.com///',
      AIGC_API_KEY: 'provider-key',
      AIGC_STUDIO_ACCESS_TOKEN: 'studio-access-token',
      AIGC_STUDIO_SESSION_SECRET: 'session-secret',
    }),
    {
      baseUrl: 'https://api-aigc.example.com',
      apiKey: 'provider-key',
      accessToken: 'studio-access-token',
      sessionSecret: 'session-secret',
    },
  );
});

test('getProviderSettings returns null when a required secret is missing', () => {
  assert.equal(getProviderSettings({ AIGC_API_BASE_URL: 'https://api-aigc.example.com' }), null);
});

test('isValidTaskId accepts provider task IDs but blocks route traversal', () => {
  assert.equal(isValidTaskId('vg-123_abc'), true);
  assert.equal(isValidTaskId('job_abc123'), true);
  assert.equal(isValidTaskId('../secrets'), false);
});
