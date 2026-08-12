import { isMediaId } from './yinhe-media.js';

export const ENABLED_VIDEO_MODELS = Object.freeze([
  'cheap-seedance-2.0',
  'cheap-seedance-2.0-fast',
  'doubao-seedance-2.0-mini',
]);

const SUPPORTED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
const SUPPORTED_RESOLUTIONS = new Set(['480p', '720p', '1080p', '4K']);
const MAX_REFERENCE_IMAGES = 9;

function hasRemoteMedia(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
}

function normalizeReferenceMediaIds(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_IMAGES || value.some((id) => !isMediaId(id))) {
    throw new Error('Reference media must contain up to nine uploaded image IDs.');
  }
  return value;
}

function normalizeSingleMediaId(value, label) {
  if (value === undefined || value === null || value === '') return '';
  if (!isMediaId(value)) {
    throw new Error(`${label} must be an uploaded image ID.`);
  }
  return value;
}

export function normalizeVideoRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('A JSON video request is required.');
  }
  if (!ENABLED_VIDEO_MODELS.includes(input.model)) {
    throw new Error('The selected video model is not enabled for this API key.');
  }
  if (
    hasRemoteMedia(input.referenceImages)
    || hasRemoteMedia(input.startImageUrl)
    || hasRemoteMedia(input.endImageUrl)
  ) {
    throw new Error('Remote media URLs are disabled until a controlled media proxy is available.');
  }

  const prompt = typeof input.input === 'string' ? input.input.trim() : '';
  if (!prompt) {
    throw new Error('A video prompt is required.');
  }
  if (prompt.length > 1300) {
    throw new Error('Video prompts must be 1300 characters or fewer.');
  }

  const durationSeconds = input.durationSeconds ?? 15;
  const aspectRatio = input.aspectRatio || '9:16';
  const resolution = input.resolution || '720p';
  if (!SUPPORTED_ASPECT_RATIOS.has(aspectRatio)) {
    throw new Error('Unsupported aspect ratio.');
  }
  if (!SUPPORTED_RESOLUTIONS.has(resolution)) {
    throw new Error('Unsupported output resolution.');
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 4 || durationSeconds > 15) {
    throw new Error('Video duration must be an integer from 4 to 15 seconds.');
  }

  const referenceMediaIds = normalizeReferenceMediaIds(input.referenceMediaIds);
  const startMediaId = normalizeSingleMediaId(input.startMediaId, 'Start frame');
  const endMediaId = normalizeSingleMediaId(input.endMediaId, 'End frame');
  if (Boolean(startMediaId) !== Boolean(endMediaId)) {
    throw new Error('Start and end frames must be uploaded together.');
  }
  if (referenceMediaIds.length > 0 && startMediaId) {
    throw new Error('Reference images and start/end frame mode cannot be combined.');
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  return {
    model: input.model,
    input: prompt,
    aspect_ratio: aspectRatio,
    resolution,
    duration_seconds: durationSeconds,
    mode: startMediaId ? 'start_end_frame' : 'text_with_reference',
    audio: input.audio !== false,
    ...(name ? { name } : {}),
    ...(referenceMediaIds.length > 0 ? { referenceMediaIds } : {}),
    ...(startMediaId ? { startMediaId, endMediaId } : {}),
  };
}

export function buildProviderVideoPayload(request, { createMediaReadUrl } = {}) {
  const {
    model,
    input,
    aspect_ratio,
    resolution,
    duration_seconds,
    mode,
    audio,
    name,
    referenceMediaIds = [],
    startMediaId,
    endMediaId,
  } = request;
  const base = {
    model,
    input,
    aspect_ratio,
    resolution,
    duration_seconds,
    mode,
    audio,
    ...(name ? { name } : {}),
  };

  if (!referenceMediaIds.length && !startMediaId) return base;
  if (typeof createMediaReadUrl !== 'function') {
    throw new Error('Media storage is not configured.');
  }
  if (startMediaId) {
    return {
      ...base,
      start_image_url: createMediaReadUrl(startMediaId),
      end_image_url: createMediaReadUrl(endMediaId),
    };
  }
  return {
    ...base,
    reference_images: referenceMediaIds.map((id) => `reference:${createMediaReadUrl(id)}`),
  };
}
