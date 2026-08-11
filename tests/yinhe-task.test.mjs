import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeProviderTask } from '../lib/yinhe-task.js';

test('normalizeProviderTask exposes a completed passthrough video URL as a successful result', () => {
  assert.deepEqual(
    normalizeProviderTask({
      taskId: 'job_4a0256031f197f81',
      status: 'completed',
      progress: 100,
      url: 'https://cdn.example.test/generated.mp4',
    }),
    {
      taskId: 'job_4a0256031f197f81',
      status: 'SUCCESS',
      progress: 100,
      resultUrl: 'https://cdn.example.test/generated.mp4',
      thumbnailUrl: null,
      failReason: null,
      createdAt: null,
    },
  );
});

test('normalizeProviderTask preserves the standard provider success response', () => {
  assert.deepEqual(
    normalizeProviderTask({
      taskId: 'job_standard',
      status: 'SUCCESS',
      resultUrl: 'https://cdn.example.test/standard.mp4',
      thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
      createdAt: 1_700_000_000,
    }),
    {
      taskId: 'job_standard',
      status: 'SUCCESS',
      progress: null,
      resultUrl: 'https://cdn.example.test/standard.mp4',
      thumbnailUrl: 'https://cdn.example.test/thumb.jpg',
      failReason: null,
      createdAt: 1_700_000_000,
    },
  );
});
