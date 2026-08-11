import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVideoRequest } from '../lib/yinhe-video.js';

const validRequest = {
  model: 'cheap-seedance-2.0',
  input: 'A cinematic sunrise over a calm ocean.',
};

test('normalizeVideoRequest creates a text-only Seedance task payload', () => {
  assert.deepEqual(
    normalizeVideoRequest(validRequest),
    {
      model: 'cheap-seedance-2.0',
      input: 'A cinematic sunrise over a calm ocean.',
      aspect_ratio: '9:16',
      resolution: '720p',
      duration_seconds: 15,
      mode: 'text_with_reference',
      audio: true,
    },
  );
});

test('normalizeVideoRequest rejects a model not enabled by the provider key', () => {
  assert.throws(
    () => normalizeVideoRequest({ model: 'not-enabled', input: 'A safe test prompt.' }),
    /not enabled/i,
  );
});

test('normalizeVideoRequest requires a non-empty video prompt', () => {
  assert.throws(
    () => normalizeVideoRequest({ model: 'cheap-seedance-2.0', input: '   ' }),
    /prompt/i,
  );
});

test('normalizeVideoRequest enforces the provider duration range', () => {
  assert.throws(
    () => normalizeVideoRequest({ ...validRequest, durationSeconds: 3 }),
    /4 to 15/i,
  );
});

test('normalizeVideoRequest rejects all caller-supplied remote media URLs', () => {
  const unsafeMediaInputs = [
    { referenceImages: ['https://cdn.example.com/reference.jpg'] },
    { referenceImages: ['http://[::1]/private'] },
    { referenceImages: ['http://localhost./private'] },
    {
      startImageUrl: 'https://cdn.example.com/start.png',
      endImageUrl: 'https://cdn.example.com/end.webp',
    },
  ];

  for (const input of unsafeMediaInputs) {
    assert.throws(
      () => normalizeVideoRequest({ ...validRequest, ...input }),
      /remote media URLs are disabled/i,
    );
  }
});

test('normalizeVideoRequest rejects unsupported output resolutions', () => {
  assert.throws(
    () => normalizeVideoRequest({ ...validRequest, resolution: '8K' }),
    /resolution/i,
  );
});

test('normalizeVideoRequest rejects unsupported aspect ratios', () => {
  assert.throws(
    () => normalizeVideoRequest({ ...validRequest, aspectRatio: '2:1' }),
    /aspect ratio/i,
  );
});

test('normalizeVideoRequest preserves an optional task name', () => {
  assert.equal(
    normalizeVideoRequest({ ...validRequest, name: 'launch-clip-01' }).name,
    'launch-clip-01',
  );
});
