'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

const MODELS = [
  { id: 'cheap-seedance-2.0', label: 'Seedance 2.0', hint: '标准质量' },
  { id: 'cheap-seedance-2.0-fast', label: 'Seedance 2.0 Fast', hint: '更快迭代' },
  { id: 'cheap-seedance-2.0-mini', label: 'Seedance 2.0 Mini', hint: '轻量经济' },
];

const FINAL_STATUSES = new Set(['SUCCESS', 'FAILED', 'CANCELLED']);
const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '4:3', '3:4', '21:9'];
const RESOLUTIONS = ['480p', '720p', '1080p', '4K'];
const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp';
const MAX_REFERENCE_IMAGES = 9;

const initialForm = {
  model: MODELS[0].id,
  input: '',
  aspectRatio: '9:16',
  resolution: '720p',
  durationSeconds: 5,
  audio: true,
  name: '',
};

function readableStatus(status) {
  const labels = {
    queued: '排队中',
    PENDING: '等待中',
    RUNNING: '生成中',
    in_progress: '生成中',
    SUCCESS: '已完成',
    completed: '已完成',
    FAILED: '失败',
    failed: '失败',
    CANCELLED: '已取消',
    cancelled: '已取消',
  };
  return labels[status] || status || '处理中';
}

function MediaTile({ asset, label, onRemove }) {
  if (!asset) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 text-[11px] text-white/25">未上传</div>;
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <Image unoptimized src={asset.previewUrl} alt={label} width={640} height={480} className="aspect-[4/3] w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-7">
        <p className="truncate text-[11px] text-white/75">{asset.name}</p>
      </div>
      <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-full border border-white/20 bg-black/70 px-2 py-1 text-[10px] text-white/75 opacity-100 transition hover:border-rose-300/50 hover:text-rose-200 sm:opacity-0 sm:group-hover:opacity-100">移除</button>
    </div>
  );
}

export default function YinheVideoStudio() {
  const [session, setSession] = useState({ loading: true, configured: false, authenticated: false, mediaConfigured: false });
  const [accessToken, setAccessToken] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [mediaMode, setMediaMode] = useState('reference');
  const [referenceImages, setReferenceImages] = useState([]);
  const [startFrame, setStartFrame] = useState(null);
  const [endFrame, setEndFrame] = useState(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [task, setTask] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedModel = useMemo(
    () => MODELS.find((model) => model.id === form.model) || MODELS[0],
    [form.model],
  );
  const taskId = task?.taskId;
  const taskIsFinal = Boolean(task?.status && FINAL_STATUSES.has(task.status));
  const isUploading = uploadingCount > 0;

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const loadSession = async () => {
    try {
      const response = await fetch('/api/yinhe/session', { cache: 'no-store' });
      const data = await response.json();
      setSession({
        loading: false,
        configured: Boolean(data.configured),
        authenticated: Boolean(data.authenticated),
        mediaConfigured: Boolean(data.mediaConfigured),
      });
    } catch {
      setSession({ loading: false, configured: false, authenticated: false, mediaConfigured: false });
      setError('无法读取工作室配置。');
    }
  };

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (!taskId || taskIsFinal) return undefined;

    let cancelled = false;
    let timer;
    const poll = async () => {
      try {
        const response = await fetch(`/api/yinhe/videos/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '查询任务失败。');
        if (!cancelled) {
          setTask(data);
          if (!FINAL_STATUSES.has(data.status)) timer = setTimeout(poll, 4000);
        }
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError.message);
          timer = setTimeout(poll, 6000);
        }
      }
    };

    timer = setTimeout(poll, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [taskId, taskIsFinal]);

  const uploadImage = async (file) => {
    if (!session.mediaConfigured) {
      throw new Error('图片存储尚未配置。');
    }

    setUploadingCount((count) => count + 1);
    try {
      const capabilityResponse = await fetch('/api/yinhe/media/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
      });
      const capability = await capabilityResponse.json();
      if (!capabilityResponse.ok) throw new Error(capability.error || '无法创建图片上传。');

      const uploadResponse = await fetch(capability.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const uploadResult = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok || uploadResult.mediaId !== capability.mediaId) {
        throw new Error(uploadResult.error || '图片上传失败。');
      }
      return {
        mediaId: capability.mediaId,
        name: file.name,
        previewUrl: URL.createObjectURL(file),
      };
    } finally {
      setUploadingCount((count) => Math.max(0, count - 1));
    }
  };

  const handleReferenceFiles = async (files) => {
    const capacity = MAX_REFERENCE_IMAGES - referenceImages.length;
    if (capacity < 1) {
      setError(`最多只能上传 ${MAX_REFERENCE_IMAGES} 张参考图。`);
      return;
    }

    setError('');
    for (const file of files.slice(0, capacity)) {
      try {
        const asset = await uploadImage(file);
        setReferenceImages((current) => [...current, asset]);
      } catch (uploadError) {
        setError(uploadError.message);
        break;
      }
    }
  };

  const handleFrameFile = async (file, frame) => {
    if (!file) return;
    setError('');
    try {
      const asset = await uploadImage(file);
      if (frame === 'start') {
        setStartFrame((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return asset;
        });
      } else {
        setEndFrame((current) => {
          if (current) URL.revokeObjectURL(current.previewUrl);
          return asset;
        });
      }
    } catch (uploadError) {
      setError(uploadError.message);
    }
  };

  const removeReference = (mediaId) => {
    setReferenceImages((current) => {
      const asset = current.find((item) => item.mediaId === mediaId);
      if (asset) URL.revokeObjectURL(asset.previewUrl);
      return current.filter((item) => item.mediaId !== mediaId);
    });
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (!accessToken.trim()) return;
    setLoginBusy(true);
    setError('');
    try {
      const response = await fetch('/api/yinhe/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: accessToken.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '访问口令无效。');
      setAccessToken('');
      setSession((current) => ({ ...current, authenticated: true }));
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/yinhe/session', { method: 'DELETE' });
    setSession((current) => ({ ...current, authenticated: false }));
    setTask(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (mediaMode === 'frames' && (!startFrame || !endFrame)) {
      setError('首帧和尾帧必须同时上传。');
      return;
    }

    setBusy(true);
    setError('');
    setTask(null);
    try {
      const response = await fetch('/api/yinhe/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: form.model,
          input: form.input,
          aspectRatio: form.aspectRatio,
          resolution: form.resolution,
          durationSeconds: Number(form.durationSeconds),
          audio: form.audio,
          name: form.name,
          referenceMediaIds: mediaMode === 'reference' ? referenceImages.map((asset) => asset.mediaId) : [],
          startMediaId: mediaMode === 'frames' ? startFrame?.mediaId || '' : '',
          endMediaId: mediaMode === 'frames' ? endFrame?.mediaId || '' : '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '提交生成任务失败。');
      setTask({ taskId: data.taskId, status: data.status || 'queued', progress: 0 });
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  if (session.loading) {
    return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-cyan-300">正在连接工作室…</div>;
  }

  if (!session.configured) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-red-400/20 bg-white/[0.04] p-8 shadow-2xl">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-red-300">Configuration required</p>
          <h1 className="text-2xl font-semibold">工作室尚未配置</h1>
          <p className="mt-3 text-sm leading-6 text-white/55">请在 Vercel Production 环境设置 provider API 和工作室访问密钥后重新部署。</p>
        </div>
      </div>
    );
  }

  if (!session.authenticated) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center px-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-cyan-300/15 bg-gradient-to-b from-cyan-300/[0.08] to-white/[0.03] p-8 shadow-2xl shadow-cyan-950/30">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/75">Private generation workspace</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Seedance Studio</h1>
            <p className="mt-3 text-sm leading-6 text-white/55">输入工作室访问口令。Provider API Key 与图片签名密钥只保存在服务端，不会发送到浏览器。</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="工作室访问口令" autoComplete="current-password" className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-300/50" />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={loginBusy || !accessToken.trim()} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-semibold text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{loginBusy ? '验证中…' : '进入工作室'}</button>
          </form>
        </div>
      </div>
    );
  }

  const progress = Math.max(0, Math.min(100, Number(task?.progress || 0)));

  return (
    <main className="min-h-screen bg-[#050505] px-4 py-5 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/70">HC-ATOM · private API</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Seedance Studio</h1>
          </div>
          <button onClick={handleLogout} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/50 transition hover:border-white/25 hover:text-white">退出</button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl shadow-black/30 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-white/35">Create video</p>
                <h2 className="mt-2 text-xl font-medium">生成视频</h2>
              </div>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] text-cyan-200">{selectedModel.hint}</span>
            </div>

            <label className="block text-xs text-white/45">模型</label>
            <select value={form.model} onChange={(event) => updateForm('model', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-cyan-300/50">
              {MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.hint}</option>)}
            </select>

            <label className="mt-6 block text-xs text-white/45">提示词 <span className="text-white/25">最多 1300 字符</span></label>
            <textarea required maxLength={1300} value={form.input} onChange={(event) => updateForm('input', event.target.value)} rows={7} placeholder="描述画面、主体动作、镜头运动、光线与声音…" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/20 focus:border-cyan-300/50" />
            <div className="mt-1 text-right text-[11px] text-white/25">{form.input.length}/1300</div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="text-xs text-white/45">画幅<select value={form.aspectRatio} onChange={(event) => updateForm('aspectRatio', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50">{ASPECT_RATIOS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-xs text-white/45">分辨率<select value={form.resolution} onChange={(event) => updateForm('resolution', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50">{RESOLUTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="text-xs text-white/45">时长（秒）<input type="number" min="4" max="15" step="1" value={form.durationSeconds} onChange={(event) => updateForm('durationSeconds', event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50" /></label>
            </div>

            <label className="mt-5 flex items-center gap-3 text-sm text-white/65"><input type="checkbox" checked={form.audio} onChange={(event) => updateForm('audio', event.target.checked)} className="h-4 w-4 accent-cyan-300" />生成同步音频</label>

            <section className="mt-6 border-t border-white/10 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-white/75">图片引导</p>
                  <p className="mt-1 text-[11px] leading-5 text-white/35">仅接受本工作室上传的 JPG、PNG、WebP（单张最大 10 MiB）。素材临时保存 7 天，并通过短时签名 URL 提供给模型。</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] ${session.mediaConfigured ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>{session.mediaConfigured ? '安全存储已连接' : '图片存储未配置'}</span>
              </div>

              <div className="mt-4 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
                <button type="button" onClick={() => setMediaMode('reference')} className={`rounded-lg px-3 py-2 transition ${mediaMode === 'reference' ? 'bg-cyan-300 text-black' : 'text-white/45 hover:text-white'}`}>参考图模式</button>
                <button type="button" onClick={() => setMediaMode('frames')} className={`rounded-lg px-3 py-2 transition ${mediaMode === 'frames' ? 'bg-cyan-300 text-black' : 'text-white/45 hover:text-white'}`}>首帧 / 尾帧</button>
              </div>

              {mediaMode === 'reference' ? (
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between text-xs text-white/45"><span>最多 {MAX_REFERENCE_IMAGES} 张，提示词可用 @image1、@image2… 引用。</span><span>{referenceImages.length}/{MAX_REFERENCE_IMAGES}</span></div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {referenceImages.map((asset) => <MediaTile key={asset.mediaId} asset={asset} label="参考图" onRemove={() => removeReference(asset.mediaId)} />)}
                    {referenceImages.length < MAX_REFERENCE_IMAGES && (
                      <label className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cyan-300/25 bg-cyan-300/[0.035] px-3 text-center transition hover:border-cyan-300/55 hover:bg-cyan-300/[0.08] ${!session.mediaConfigured || isUploading ? 'pointer-events-none opacity-45' : ''}`}>
                        <span className="text-xl text-cyan-200">＋</span><span className="mt-1 text-[11px] text-cyan-100/70">{isUploading ? '上传中…' : '上传参考图'}</span>
                        <input type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ''; handleReferenceFiles(files); }} />
                      </label>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div><p className="mb-2 text-xs text-white/45">首帧图</p><MediaTile asset={startFrame} label="首帧图" onRemove={() => setStartFrame((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return null; })} /><label className={`mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cyan-300/25 px-3 py-2 text-xs text-cyan-100/70 transition hover:border-cyan-300/55 ${!session.mediaConfigured || isUploading ? 'pointer-events-none opacity-45' : ''}`}>{isUploading ? '上传中…' : '上传 / 替换首帧'}<input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; handleFrameFile(file, 'start'); }} /></label></div>
                  <div><p className="mb-2 text-xs text-white/45">尾帧图</p><MediaTile asset={endFrame} label="尾帧图" onRemove={() => setEndFrame((current) => { if (current) URL.revokeObjectURL(current.previewUrl); return null; })} /><label className={`mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-cyan-300/25 px-3 py-2 text-xs text-cyan-100/70 transition hover:border-cyan-300/55 ${!session.mediaConfigured || isUploading ? 'pointer-events-none opacity-45' : ''}`}>{isUploading ? '上传中…' : '上传 / 替换尾帧'}<input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; handleFrameFile(file, 'end'); }} /></label></div>
                  <p className="sm:col-span-2 text-[11px] leading-5 text-white/35">首尾帧模式会控制视频的起始与结束画面；两张图必须同时上传，且不能与参考图模式混用。</p>
                </div>
              )}
            </section>

            <label className="mt-5 block text-xs text-white/45">任务名称（可选）<input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="我的测试片段" className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/20 focus:border-cyan-300/50" /></label>

            {error && <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/5 px-4 py-3 text-sm text-rose-200">{error}</div>}
            <button type="submit" disabled={busy || isUploading || !form.input.trim()} className="mt-7 w-full rounded-xl bg-cyan-300 px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{busy ? '提交中…' : isUploading ? '图片上传中…' : '开始生成'}</button>
            <p className="mt-3 text-center text-[11px] text-white/25">费用按分辨率与时长计算；画幅比例不影响价格。</p>
          </form>

          <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-5 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs uppercase tracking-[0.25em] text-white/35">Task monitor</p><h2 className="mt-2 text-xl font-medium">任务状态</h2></div>
              {task && <span className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-white/55">{readableStatus(task.status)}</span>}
            </div>

            {!task ? (
              <div className="mt-16 rounded-2xl border border-dashed border-white/10 p-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-300/10 text-2xl text-cyan-200">✦</div><p className="mt-5 text-sm text-white/55">提交一个任务后，进度和结果会显示在这里。</p></div>
            ) : (
              <div className="mt-8 space-y-6">
                <div><div className="mb-2 flex justify-between text-xs text-white/45"><span>{readableStatus(task.status)}</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-cyan-300 transition-all duration-500" style={{ width: `${progress}%` }} /></div></div>
                <div className="rounded-xl bg-black/25 p-4 text-xs text-white/40"><p>任务 ID</p><p className="mt-2 break-all font-mono text-white/65">{task.taskId}</p></div>
                {task.status === 'FAILED' || task.status === 'failed' ? <div className="rounded-xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-200">{task.failReason || 'Provider 返回生成失败。'}</div> : null}
                {task.resultUrl ? <div className="overflow-hidden rounded-2xl border border-white/10 bg-black"><video controls playsInline className="aspect-video w-full" src={task.resultUrl} poster={task.thumbnailUrl || undefined} /><a href={task.resultUrl} target="_blank" rel="noreferrer" className="block px-4 py-3 text-center text-xs text-cyan-200 transition hover:bg-white/5">打开 / 下载结果视频 ↗</a></div> : <p className="text-sm leading-6 text-white/35">视频生成通常需要一些时间。此页面会自动轮询，不需要手动刷新。</p>}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
