import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyStudioSession } from '@/lib/yinhe-auth';
import { getMediaSettings, createMediaReadUrl } from '@/lib/yinhe-media';
import { getProviderSettings } from '@/lib/yinhe-provider';
import { buildProviderVideoPayload, normalizeVideoRequest } from '@/lib/yinhe-video';

export const runtime = 'nodejs';

const COOKIE_NAME = 'yinhe_studio_session';

function requestedMediaIds(normalized) {
  return [
    ...(normalized.referenceMediaIds || []),
    normalized.startMediaId,
    normalized.endMediaId,
  ].filter(Boolean);
}

async function verifyUploadedMedia(mediaIds, mediaSettings) {
  if (!mediaIds.length) return;
  if (!mediaSettings) throw new Error('Image storage is not configured.');

  let checks;
  try {
    checks = await Promise.all(mediaIds.map(async (mediaId) => {
      const response = await fetch(
        createMediaReadUrl(mediaId, mediaSettings, { method: 'HEAD', ttlSeconds: 60 }),
        {
          method: 'HEAD',
          cache: 'no-store',
          headers: { 'User-Agent': 'open-generative-ai-media-verifier/1.0' },
          signal: AbortSignal.timeout(10_000),
        },
      );
      return response.ok;
    }));
  } catch {
    throw new Error('Image storage could not be reached. Please try again.');
  }
  if (checks.some((available) => !available)) {
    throw new Error('One or more uploaded images are no longer available. Please upload them again.');
  }
}

export async function POST(request) {
  const settings = getProviderSettings();
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (!settings || !sessionToken || !verifyStudioSession(sessionToken, { secret: settings.sessionSecret })) {
    return NextResponse.json({ error: 'Studio authentication is required.' }, { status: 401 });
  }

  let normalized;
  try {
    normalized = normalizeVideoRequest(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Invalid video request.' }, { status: 400 });
  }

  const mediaSettings = getMediaSettings();
  const mediaIds = requestedMediaIds(normalized);
  let payload;
  try {
    await verifyUploadedMedia(mediaIds, mediaSettings);
    payload = buildProviderVideoPayload(normalized, {
      createMediaReadUrl: (mediaId) => createMediaReadUrl(mediaId, mediaSettings),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image storage is not configured.';
    const status = mediaIds.length && (!mediaSettings || /could not be reached/i.test(message)) ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  let upstream;
  let result;
  try {
    upstream = await fetch(`${settings.baseUrl}/video/generation/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': randomUUID(),
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    result = await upstream.json().catch(() => null);
  } catch {
    return NextResponse.json({ error: 'The video provider could not be reached.' }, { status: 502 });
  }

  if (!upstream.ok || result?.code !== 200 || !result?.data?.taskId) {
    return NextResponse.json(
      { error: result?.msg || 'The video provider rejected the request.' },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }

  return NextResponse.json({
    taskId: result.data.taskId,
    status: result.data.status,
    createdAt: result.data.createdAt,
  });
}
