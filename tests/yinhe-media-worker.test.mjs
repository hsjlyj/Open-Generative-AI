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
const secret = 'test-signing-secret';
const now = Math.floor(Date.now() / 1000);

function workerEnv(kv) {
  return {
    YINHE_MEDIA_KV: kv,
    AIGC_MEDIA_SIGNING_SECRET: secret,
    ALLOWED_ORIGIN: 'https://open-generative-ai-beige.vercel.app',
  };
}

test('handleRequest stores a signed browser image upload in KV', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const expiresAt = now + 300;
  const sig = signMediaCapability({
    method: 'PUT', mediaId, type: 'image/png', size: bytes.byteLength, expiresAt,
  }, secret);
  const request = new Request(
    `https://media.example/upload/${mediaId}?type=image%2Fpng&size=${bytes.byteLength}&expires=${expiresAt}&sig=${sig}`,
    {
      method: 'PUT',
      headers: {
        Origin: 'https://open-generative-ai-beige.vercel.app',
        'Content-Type': 'image/png',
      },
      body: bytes,
    },
  );
  const kv = new MemoryKv();

  const response = await handleRequest(request, workerEnv(kv));

  assert.equal(response.status, 201);
  assert.equal(kv.values.get(mediaId).metadata.contentType, 'image/png');
  assert.deepEqual(new Uint8Array(kv.values.get(mediaId).value), bytes);
});

test('handleRequest serves an uploaded image only with a signed read URL', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const expiresAt = now + 300;
  const sig = signMediaCapability({ method: 'GET', mediaId, expiresAt }, secret);
  const kv = new MemoryKv();
  await kv.put(mediaId, bytes.buffer, { metadata: { contentType: 'image/png' } });

  const response = await handleRequest(
    new Request(`https://media.example/media/${mediaId}?expires=${expiresAt}&sig=${sig}`),
    workerEnv(kv),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
});

test('handleRequest verifies an uploaded image with a signed HEAD request', async () => {
  const expiresAt = now + 300;
  const sig = signMediaCapability({ method: 'HEAD', mediaId, expiresAt }, secret);
  const kv = new MemoryKv();
  await kv.put(mediaId, new Uint8Array([137, 80, 78, 71]).buffer, { metadata: { contentType: 'image/png' } });

  const response = await handleRequest(
    new Request(`https://media.example/media/${mediaId}?expires=${expiresAt}&sig=${sig}`, { method: 'HEAD' }),
    workerEnv(kv),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'image/png');
  assert.equal(await response.text(), '');
});
