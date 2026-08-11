import test from 'node:test';
import assert from 'node:assert/strict';

import { createMediaReadUrl, createMediaUploadCapability, signMediaCapability } from '../lib/yinhe-media.js';

const settings = {
  workerUrl: 'https://yinhe-media-store.example.workers.dev',
  signingSecret: 'test-signing-secret',
};

test('createMediaUploadCapability creates a time-limited signed image upload URL', () => {
  const capability = createMediaUploadCapability({
    name: 'reference.png',
    type: 'image/png',
    size: 1024,
  }, settings, {
    now: 1_700_000_000,
    idFactory: () => 'media_0123456789abcdef0123456789abcdef',
  });

  assert.equal(capability.mediaId, 'media_0123456789abcdef0123456789abcdef');
  const url = new URL(capability.uploadUrl);
  assert.equal(url.origin, settings.workerUrl);
  assert.equal(url.pathname, '/upload/media_0123456789abcdef0123456789abcdef');
  assert.equal(url.searchParams.get('type'), 'image/png');
  assert.equal(url.searchParams.get('size'), '1024');
  assert.equal(url.searchParams.get('expires'), '1700000600');
  assert.match(url.searchParams.get('sig'), /^[A-Za-z0-9_-]{43}$/);
});

test('createMediaUploadCapability rejects unsupported or oversized uploads', () => {
  assert.throws(
    () => createMediaUploadCapability({ name: 'payload.svg', type: 'image/svg+xml', size: 1024 }, settings),
    /JPG, PNG, and WebP/i,
  );
  assert.throws(
    () => createMediaUploadCapability({ name: 'large.png', type: 'image/png', size: 10 * 1024 * 1024 + 1 }, settings),
    /10 MiB/i,
  );
});

test('createMediaReadUrl can mint a signed HEAD verification URL', () => {
  const mediaId = 'media_0123456789abcdef0123456789abcdef';
  const url = new URL(createMediaReadUrl(mediaId, settings, {
    method: 'HEAD',
    now: 1_700_000_000,
    ttlSeconds: 120,
  }));

  assert.equal(
    url.searchParams.get('sig'),
    signMediaCapability({ method: 'HEAD', mediaId, expiresAt: 1_700_000_120 }, settings.signingSecret),
  );
});
