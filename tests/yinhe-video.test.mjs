import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeVideoRequest } from '../lib/yinhe-video.js';

test('normalizeVideoRequest creates a valid default Seedance task payload', () => {
  assert.deepEqual(
    normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A cinematic sunrise over a calm ocean.',
      referenceImages: ['https://cdn.example.com/reference.jpg'],
    }),
    {
      model: 'cheap-seedance-2.0',
      input: 'A cinematic sunrise over a calm ocean.',
      aspect_ratio: '9:16',
      resolution: '720p',
      duration_seconds: 15,
      mode: 'text_with_reference',
      audio: true,
      reference_images: ['https://cdn.example.com/reference.jpg'],
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
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      durationSeconds: 3,
    }),
    /4 to 15/i,
  );
});

test('normalizeVideoRequest uses start/end-frame mode when both frame URLs are supplied', () => {
  assert.deepEqual(
    normalizeVideoRequest({
      model: 'cheap-seedance-2.0-fast',
      input: 'Transition from the first frame to the last frame.',
      startImageUrl: 'https://cdn.example.com/start.png',
      endImageUrl: 'https://cdn.example.com/end.webp',
      durationSeconds: 5,
    }),
    {
      model: 'cheap-seedance-2.0-fast',
      input: 'Transition from the first frame to the last frame.',
      aspect_ratio: '9:16',
      resolution: '720p',
      duration_seconds: 5,
      mode: 'start_end_frame',
      audio: true,
      start_image_url: 'https://cdn.example.com/start.png',
      end_image_url: 'https://cdn.example.com/end.webp',
    },
  );
});

test('normalizeVideoRequest requires both frame URLs for a frame-controlled task', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      startImageUrl: 'https://cdn.example.com/start.png',
    }),
    /together/i,
  );
});

test('normalizeVideoRequest accepts only public http(s) reference URLs', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      referenceImages: ['file:///etc/passwd'],
    }),
    /public http/i,
  );
});

test('normalizeVideoRequest rejects loopback reference URLs', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      referenceImages: ['http://127.0.0.1/private'],
    }),
    /public/i,
  );
});

test('normalizeVideoRequest rejects unsupported output resolutions', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      resolution: '8K',
    }),
    /resolution/i,
  );
});

test('normalizeVideoRequest rejects unsupported aspect ratios', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      aspectRatio: '2:1',
    }),
    /aspect ratio/i,
  );
});

test('normalizeVideoRequest accepts only public http(s) frame URLs', () => {
  assert.throws(
    () => normalizeVideoRequest({
      model: 'cheap-seedance-2.0',
      input: 'A safe test prompt.',
      startImageUrl: 'file:///etc/passwd',
      endImageUrl: 'https://cdn.example.com/end.webp',
    }),
    /public http/i,
  );
});

test('normalizeVideoRequest preserves an optional task name', () => {
  assert.equal(
    normalizeVideoRequest({
      model: 'cheap-seedance-2.0-mini',
      input: 'A safe test prompt.',
      name: 'launch-clip-01',
    }).name,
    'launch-clip-01',
  );
});
