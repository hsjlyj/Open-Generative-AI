import test from 'node:test';
import assert from 'node:assert/strict';

import { signMediaCapability } from '../lib/yinhe-media.js';
import { handleRequest } from '../cloudflare/yinhe-media-worker/src/index.js';

class MemoryKv {
  values = new Map();

  async put(key, value, options) {
    this.values.set(key, { value, metadata: options.metadata });
  }

  async getWithMetadata(key) {
    const record = this.values.get(key);
    return record ? { value: record.value, metadata: record.metadata } : { value: null, metadata: null };
  }
}

const mediaId = 'media_0123456789abcdef0123456789abcdef';
const owner = '0123456789abcdef0123456789abcdef';
const otherOwner = 'fedcba9876543210fedcba9876543210';
const secret = 'test-signing-secret';
const now = Math.floor(Date.now() / 1000);

function workerEnv(kv) {
  return {
    YINHE_MEDIA_KV: kv,
    AIGC_MEDIA_SIGNING_SECRET: secret,
    ALLOWED_ORIGIN: 'https://open-generative-ai-beige.vercel.app',
  };
}

function signedUrl(action, method, { mediaKey = mediaId, subject = owner, type = '', size = '' } = {}) {
  const expiresAt = now + 300;
  const sig = signMediaCapability({ method, mediaId: mediaKey, owner: subject, type, size, expiresAt }, secret);
  const url = new URL(`https://media.example/${action}/${mediaKey}`);
  url.searchParams.set('owner', subject);
  if (type) url.searchParams.set('type', type);
  if (size) url.searchParams.set('size', String(size));
  url.searchParams.set('expires', String(expiresAt));
  url.searchParams.set('sig', sig);
  return url;
}

test('handleRequest stores a signed browser image upload in KV under its session owner', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const request = new Request(signedUrl('upload', 'PUT', { type: 'image/png', size: bytes.byteLength }), {
    method: 'PUT',
    headers: {
      Origin: 'https://open-generative-ai-beige.vercel.app',
      'Content-Type': 'image/png',
    },
    body: bytes,
  });
  const kv = new MemoryKv();

  const response = await handleRequest(request, workerEnv(kv));

  assert.equal(response.status, 201);
  assert.equal(kv.values.get(mediaId).metadata.contentType, 'image/png');
  assert.equal(kv.values.get(mediaId).metadata.owner, owner);
  assert.deepEqual(new Uint8Array(kv.values.get(mediaId).value), bytes);
});

test('handleRequest serves an uploaded image only with a signed owner-bound read URL', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const kv = new MemoryKv();
  await kv.put(mediaId, bytes.buffer, { metadata: { contentType: 'image/png', owner } });

  const response = await handleRequest(
    new Request(signedUrl('media', 'GET')),
    workerEnv(kv),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('handleRequest verifies an uploaded image with a signed HEAD request', async () => {
  const kv = new MemoryKv();
  await kv.put(mediaId, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer, {
    metadata: { contentType: 'image/png', owner },
  });

  const response = await handleRequest(
    new Request(signedUrl('media', 'HEAD'), { method: 'HEAD' }),
    workerEnv(kv),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(await response.text(), '');
});

test('handleRequest prevents a different signed session owner from reading an uploaded image', async () => {
  const kv = new MemoryKv();
  await kv.put(mediaId, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer, {
    metadata: { contentType: 'image/png', owner },
  });

  const response = await handleRequest(
    new Request(signedUrl('media', 'GET', { subject: otherOwner })),
    workerEnv(kv),
  );

  assert.equal(response.status, 404);
});
