export const ENABLED_VIDEO_MODELS = Object.freeze([
  'cheap-seedance-2.0',
  'cheap-seedance-2.0-fast',
  'cheap-seedance-2.0-mini',
]);

const SUPPORTED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
const SUPPORTED_RESOLUTIONS = new Set(['480p', '720p', '1080p', '4K']);

function hasRemoteMedia(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== undefined && value !== null;
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

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  return {
    model: input.model,
    input: prompt,
    aspect_ratio: aspectRatio,
    resolution,
    duration_seconds: durationSeconds,
    mode: 'text_with_reference',
    audio: input.audio !== false,
    ...(name ? { name } : {}),
  };
}
