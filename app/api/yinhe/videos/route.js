import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/yinhe-account';
import { dataRequest } from '@/lib/yinhe-data';
import { getMediaSettings, createMediaReadUrl } from '@/lib/yinhe-media';
import { getProviderSettings } from '@/lib/yinhe-provider';
import { buildProviderVideoPayload, normalizeVideoRequest } from '@/lib/yinhe-video';

export const runtime = 'nodejs';
function requestedMediaIds(normalized) { return [...(normalized.referenceMediaIds || []), normalized.startMediaId, normalized.endMediaId].filter(Boolean); }
async function verifyUploadedMedia(mediaIds, mediaSettings) {
  if (!mediaIds.length) return;
  if (!mediaSettings) throw new Error('图片存储尚未配置。');
  const checks = await Promise.all(mediaIds.map(async (mediaId) => (await fetch(createMediaReadUrl(mediaId, mediaSettings, { method: 'HEAD', ttlSeconds: 60 }), { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(10_000) })).ok));
  if (checks.some((available) => !available)) throw new Error('一张或多张上传图片已失效，请重新上传。');
}
export async function POST(request) {
  const settings = getProviderSettings();
  let account;
  try { account = requireAccount(request); } catch (error) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  if (!settings) return NextResponse.json({ error: 'Provider configuration is unavailable.' }, { status: 503 });
  let normalized;
  try { normalized = normalizeVideoRequest(await request.json()); } catch (error) { return NextResponse.json({ error: error.message || 'Invalid video request.' }, { status: 400 }); }
  console.log('[yinhe/videos POST] normalized', JSON.stringify({ model: normalized.model, duration_seconds: normalized.duration_seconds, typeof_dur: typeof normalized.duration_seconds, aspect_ratio: normalized.aspect_ratio, resolution: normalized.resolution }));
  const mediaSettings = getMediaSettings();
  try {
    await verifyUploadedMedia(requestedMediaIds(normalized), mediaSettings);
    console.log('[yinhe/videos POST] calling reserve, task=', JSON.stringify(normalized));
    const reservation = await dataRequest('reserve', { userId: account.id, task: normalized });
    console.log('[yinhe/videos POST] reserve result', JSON.stringify({ ok: !reservation.error, status: reservation.status, err: reservation.error, hasTask: !!reservation.task }));
    const payload = buildProviderVideoPayload(normalized, { createMediaReadUrl: (mediaId) => createMediaReadUrl(mediaId, mediaSettings) });
    let upstream; let result;
    try {
      upstream = await fetch(`${settings.baseUrl}/video/generation/tasks`, { method: 'POST', headers: { Authorization: `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(30_000) });
      result = await upstream.json().catch(() => null);
    } catch {
      await dataRequest('updateTask', { userId: account.id, taskId: reservation.task.id, status: 'FAILED', failReason: 'Provider could not be reached.' });
      return NextResponse.json({ error: 'The video provider could not be reached.' }, { status: 502 });
    }
    if (!upstream.ok || result?.code !== 200 || !result?.data?.taskId) {
      await dataRequest('updateTask', { userId: account.id, taskId: reservation.task.id, status: 'FAILED', failReason: result?.msg || 'Provider rejected the request.' });
      return NextResponse.json({ error: result?.msg || 'The video provider rejected the request.' }, { status: upstream.ok ? 502 : upstream.status });
    }
    await dataRequest('bindProviderTask', { userId: account.id, taskId: reservation.task.id, providerTaskId: result.data.taskId, status: result.data.status || 'PENDING' });
    return NextResponse.json({ taskId: result.data.taskId, status: result.data.status, createdAt: result.data.createdAt, credits: reservation.user.credits });
  } catch (error) { return NextResponse.json({ error: error.message || '生成任务提交失败。' }, { status: error.status || 500 }); }
}
