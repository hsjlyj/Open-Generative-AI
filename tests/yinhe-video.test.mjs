import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProviderVideoPayload, normalizeVideoRequest } from '../lib/yinhe-video.js';

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

test('normalizeVideoRequest rejects prompts longer than the provider limit', () => {
  assert.throws(
    () => normalizeVideoRequest({ ...validRequest, input: 'x'.repeat(1301) }),
    /1300/i,
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

test('buildProviderVideoPayload turns trusted media IDs into provider reference URLs', () => {
  const mediaId = 'media_0123456789abcdef0123456789abcdef';
  const normalized = normalizeVideoRequest({
    ...validRequest,
    input: 'Use @image1 as the visual reference.',
    referenceMediaIds: [mediaId],
  });

  assert.deepEqual(
    buildProviderVideoPayload(normalized, {
      createMediaReadUrl: (id) => `https://media.example.workers.dev/media/${id}?sig=trusted`,
    }),
    {
      model: 'cheap-seedance-2.0',
      input: 'Use @image1 as the visual reference.',
      aspect_ratio: '9:16',
      resolution: '720p',
      duration_seconds: 15,
      mode: 'text_with_reference',
      audio: true,
      reference_images: [`reference:https://media.example.workers.dev/media/${mediaId}?sig=trusted`],
    },
  );
});

test('buildProviderVideoPayload creates start/end-frame tasks from trusted media IDs', () => {
  const startMediaId = 'media_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const endMediaId = 'media_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const normalized = normalizeVideoRequest({
    ...validRequest,
    startMediaId,
    endMediaId,
  });

  assert.deepEqual(
    buildProviderVideoPayload(normalized, {
      createMediaReadUrl: (id) => `https://media.example.workers.dev/media/${id}?sig=trusted`,
    }),
    {
      model: 'cheap-seedance-2.0',
      input: validRequest.input,
      aspect_ratio: '9:16',
      resolution: '720p',
      duration_seconds: 15,
      mode: 'start_end_frame',
      audio: true,
      start_image_url: `https://media.example.workers.dev/media/${startMediaId}?sig=trusted`,
      end_image_url: `https://media.example.workers.dev/media/${endMediaId}?sig=trusted`,
    },
  );
});

test('normalizeVideoRequest requires both uploaded frame IDs', () => {
  assert.throws(
    () => normalizeVideoRequest({
      ...validRequest,
      startMediaId: 'media_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }),
    /together/i,
  );
});

test('normalizeVideoRequest keeps reference and start/end-frame modes separate', () => {
  assert.throws(
    () => normalizeVideoRequest({
      ...validRequest,
      referenceMediaIds: ['media_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
      startMediaId: 'media_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      endMediaId: 'media_cccccccccccccccccccccccccccccccc',
    }),
    /cannot be combined/i,
  );
});
