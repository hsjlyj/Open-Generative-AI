import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyStudioSession } from '@/lib/yinhe-auth';
import { getProviderSettings } from '@/lib/yinhe-provider';
import { normalizeVideoRequest } from '@/lib/yinhe-video';

export const runtime = 'nodejs';

const COOKIE_NAME = 'yinhe_studio_session';

export async function POST(request) {
  const settings = getProviderSettings();
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (!settings || !sessionToken || !verifyStudioSession(sessionToken, { secret: settings.sessionSecret })) {
    return NextResponse.json({ error: 'Studio authentication is required.' }, { status: 401 });
  }

  let payload;
  try {
    payload = normalizeVideoRequest(await request.json());
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Invalid video request.' }, { status: 400 });
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
