import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/yinhe-account';
import { dataRequest } from '@/lib/yinhe-data';
import { getProviderSettings, isValidTaskId } from '@/lib/yinhe-provider';
import { normalizeProviderTask } from '@/lib/yinhe-task';
export const runtime = 'nodejs';
export async function GET(request, { params }) {
  const settings = getProviderSettings();
  let account;
  try { account = requireAccount(request); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  const taskId = (await params).taskId;
  if (!settings) return NextResponse.json({ error: 'Provider configuration is unavailable.' }, { status: 503 });
  if (!isValidTaskId(taskId)) return NextResponse.json({ error: 'Invalid task ID.' }, { status: 400 });
  try {
    const upstream = await fetch(`${settings.baseUrl}/video/generation/tasks/${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${settings.apiKey}` }, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const result = await upstream.json().catch(() => null);
    if (!upstream.ok || result?.code !== 200 || !result?.data) return NextResponse.json({ error: result?.msg || 'The video provider rejected the status request.' }, { status: upstream.ok ? 502 : upstream.status });
    const task = normalizeProviderTask(result.data);
    const persisted = await dataRequest('syncProviderTask', { userId: account.id, providerTaskId: taskId, status: task.status, resultUrl: task.resultUrl, thumbnailUrl: task.thumbnailUrl, failReason: task.failReason });
    return NextResponse.json({ ...task, resultUrl: persisted.task?.videoUrl || task.resultUrl, credits: persisted.user?.credits });
  } catch (error) { return NextResponse.json({ error: error.message || 'The video provider could not be reached.' }, { status: error.status || 502 }); }
}
