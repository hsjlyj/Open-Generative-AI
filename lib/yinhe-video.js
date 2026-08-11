export const ENABLED_VIDEO_MODELS = Object.freeze([
  'cheap-seedance-2.0',
  'cheap-seedance-2.0-fast',
  'cheap-seedance-2.0-mini',
]);

const SUPPORTED_ASPECT_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']);
const SUPPORTED_RESOLUTIONS = new Set(['480p', '720p', '1080p', '4K']);

function isPrivateHostname(hostname) {
  const host = hostname.toLowerCase();
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || /^127(?:\.\d{1,3}){3}$/.test(host)
    || /^10(?:\.\d{1,3}){3}$/.test(host)
    || /^192\.168(?:\.\d{1,3}){2}$/.test(host)
    || /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/.test(host)
    || /^169\.254(?:\.\d{1,3}){2}$/.test(host);
}

function normalizeReferenceUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const prefix = ['reference:', 'start:', 'end:'].find((item) => text.startsWith(item)) || '';
  const urlText = prefix ? text.slice(prefix.length) : text;

  try {
    const url = new URL(urlText);
    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:')
      || !url.hostname
      || isPrivateHostname(url.hostname)
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('Reference URLs must be public http(s) URLs.');
  }

  return text;
}

export function normalizeVideoRequest(input) {
  if (!ENABLED_VIDEO_MODELS.includes(input.model)) {
    throw new Error('The selected video model is not enabled for this API key.');
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

  const references = Array.isArray(input.referenceImages)
    ? input.referenceImages.map(normalizeReferenceUrl)
    : [];
  const startImageUrl = typeof input.startImageUrl === 'string' && input.startImageUrl.trim()
    ? normalizeReferenceUrl(input.startImageUrl)
    : '';
  const endImageUrl = typeof input.endImageUrl === 'string' && input.endImageUrl.trim()
    ? normalizeReferenceUrl(input.endImageUrl)
    : '';
  if (Boolean(startImageUrl) !== Boolean(endImageUrl)) {
    throw new Error('Start-frame and end-frame URLs must be provided together.');
  }
  const hasFramePair = Boolean(startImageUrl);

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const payload = {
    model: input.model,
    input: prompt,
    aspect_ratio: aspectRatio,
    resolution,
    duration_seconds: durationSeconds,
    mode: hasFramePair ? 'start_end_frame' : 'text_with_reference',
    audio: input.audio !== false,
    ...(name ? { name } : {}),
    ...(hasFramePair ? {
      start_image_url: startImageUrl,
      end_image_url: endImageUrl,
    } : {}),
    ...(references.length > 0 ? { reference_images: references } : {}),
  };

  return payload;
}
