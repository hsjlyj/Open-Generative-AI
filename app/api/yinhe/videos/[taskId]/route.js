import { NextResponse } from 'next/server';
import { verifyStudioSession } from '@/lib/yinhe-auth';
import { getProviderSettings, isValidTaskId } from '@/lib/yinhe-provider';

export const runtime = 'nodejs';

const COOKIE_NAME = 'yinhe_studio_session';

export async function GET(request, { params }) {
  const settings = getProviderSettings();
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;
  const taskId = (await params).taskId;

  if (!settings || !sessionToken || !verifyStudioSession(sessionToken, { secret: settings.sessionSecret })) {
    return NextResponse.json({ error: 'Studio authentication is required.' }, { status: 401 });
  }
  if (!isValidTaskId(taskId)) {
    return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });
  }

  let upstream;
  let result;
  try {
    upstream = await fetch(
      `${settings.baseUrl}/video/generation/tasks/${encodeURIComponent(taskId)}`,
      {
        headers: { Authorization: `Bearer ${settings.apiKey}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
      },
    );
    result = await upstream.json().catch(() => null);
  } catch {
    return NextResponse.json({ error: 'The video provider could not be reached.' }, { status: 502 });
  }

  if (!upstream.ok || result?.code !== 200 || !result?.data) {
    return NextResponse.json(
      { error: result?.msg || 'The video provider rejected the status request.' },
      { status: upstream.ok ? 502 : upstream.status },
    );
  }

  const data = result.data;
  return NextResponse.json({
    taskId: data.taskId,
    status: data.status,
    progress: data.progress ?? null,
    resultUrl: data.resultUrl ?? null,
    thumbnailUrl: data.thumbnailUrl ?? null,
    failReason: data.failReason ?? null,
    createdAt: data.createdAt ?? null,
  });
}
