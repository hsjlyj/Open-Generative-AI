'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const TABS = [
  { id: 'overview', label: '概览', icon: '▦' },
  { id: 'history', label: '生成历史', icon: '◷' },
  { id: 'admin', label: '管理后台', icon: '⌘' },
];

const statusMeta = {
  SUCCESS: { label: '已完成', className: 'border-emerald-300/20 bg-emerald-300/10 text-emerald-200' },
  FAILED: { label: '失败', className: 'border-rose-300/20 bg-rose-300/10 text-rose-200' },
  RUNNING: { label: '生成中', className: 'border-cyan-300/20 bg-cyan-300/10 text-cyan-200' },
  PENDING: { label: '排队中', className: 'border-amber-300/20 bg-amber-300/10 text-amber-200' },
};

function StatusBadge({ status }) {
  const meta = statusMeta[status] || { label: status || '处理中', className: 'border-white/10 bg-white/5 text-white/55' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${meta.className}`}>
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
   </span>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[.02] px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-xl text-cyan-200">◷</div>
      <h3 className="mt-4 text-sm font-medium text-white/80">还没有生成记录</h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-white/40">完成第一次视频生成后，提示词、模型、消耗积分和播放链接会出现在这里</p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-5 min-h-11 rounded-xl bg-cyan-300 px-4 text-xs font-semibold text-[#061013] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
      >
        开始创建视频
     </button>
   </div>
  );
}

export default function YinheAccountDashboard({ session, onCreate }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [history, setHistory] = useState([]);
  const [admin, setAdmin] = useState(null);
  const [priceEdits, setPriceEdits] = useState({});
  const [creditEdits, setCreditEdits] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState('');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const historyResponse = await fetch('/api/yinhe/history', { cache: 'no-store' });
      const historyData = await historyResponse.json();
      if (!historyResponse.ok) throw new Error(historyData.error || '无法读取历史记录。');
      setHistory(historyData.tasks || []);
      const adminResponse = await fetch('/api/yinhe/admin', { cache: 'no-store' });
      const adminData = await adminResponse.json();
      if (adminResponse.ok && !adminData.error) {
        setAdmin(adminData);
        setPriceEdits(Object.fromEntries((adminData.prices || []).map((item) => [`${item.model}::${item.resolution}`, String(item.credits_per_second)])));
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (session.authenticated) load(); }, [session.authenticated, load]);

  const completedCount = useMemo(() => history.filter((item) => item.status === 'SUCCESS').length, [history]);
  const totalSpent = useMemo(() => history.reduce((sum, item) => sum + Number(item.credits_reserved || 0), 0), [history]);

  const savePrice = async (model, resolution) => {
    const creditsPerSecond = Number(priceEdits[`${model}::${resolution}`]);
    if (!Number.isInteger(creditsPerSecond) || creditsPerSecond < 0) {
      setNotice({ type: 'error', text: '价格必须是大于等于 0 的整数。' });
      return;
    }
    setSaving(`price:${model}::${resolution}`);
    setNotice(null);
    try {
      const response = await fetch('/api/yinhe/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setPrice', model, resolution, creditsPerSecond }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '价格保存失败。');
      setAdmin((current) => ({ ...current, prices: data.prices }));
      setNotice({ type: 'success', text: '模型价格已更新。' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSaving('');
    }
  };

  const adjustCredits = async (userId) => {
    const amount = Number(creditEdits[userId]);
    if (!Number.isInteger(amount) || amount === 0) {
      setNotice({ type: 'error', text: '请输入非零整数积分。' });
      return;
    }
    setSaving(`credit:${userId}`);
    setNotice(null);
    try {
      const response = await fetch('/api/yinhe/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'adjustCredits', targetUserId: userId, amount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '积分调整失败。');
      setAdmin((current) => ({ ...current, users: current.users.map((user) => user.id === userId ? data.user : user) }));
      setCreditEdits((current) => ({ ...current, [userId]: '' }));
      setNotice({ type: 'success', text: '积分已更新。' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSaving('');
    }
  };

  const renderHistory = () => {
    if (!history.length) return <EmptyState onCreate={onCreate} />;
    return (
      <div className="space-y-3">
        {history.map((task) => (
          <article key={task.id} className="rounded-2xl border border-white/10 bg-[#0d1518] p-4 transition hover:border-white/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/85">{task.name || task.prompt}</p>
                <p className="mt-1 text-xs text-white/35">{task.model} · {task.duration_seconds} 秒 · {task.resolution} · {task.created_at?.slice(0, 16) || '刚刚'}</p>
             </div>
              <StatusBadge status={task.status} />
           </div>
            {task.fail_reason && <p className="mt-3 rounded-lg bg-rose-300/5 px-3 py-2 text-xs text-rose-200">{task.fail_reason}</p>}
            {task.videoUrl && (
              <a
                href={task.videoUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-cyan-300/20 px-3 text-xs text-cyan-200 transition hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
              >
                播放结果视频 ↗
             </a>
            )}
         </article>
        ))}
     </div>
    );
  };

  const renderPriceCard = (item) => {
    const priceKey = `${item.model}::${item.resolution}`;
    const editValue = priceEdits[priceKey] ?? String(item.credits_per_second);
    return (
      <div key={priceKey} className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="truncate text-xs font-medium text-white/75" title={item.model}>{item.model}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wider text-cyan-200/55">{item.resolution}</p>
        <label className="mt-3 block text-[11px] text-white/40">
          积分 / 秒
          <input
            type="number"
            min="0"
            step="1"
            value={editValue}
            onChange={(event) => setPriceEdits((current) => ({ ...current, [priceKey]: event.target.value }))}
            className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-[#111d20] px-3 text-sm text-white outline-none transition focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10"
          />
       </label>
        <button
          type="button"
          onClick={() => savePrice(item.model, item.resolution)}
          disabled={saving === `price:${priceKey}`}
          className="mt-3 min-h-10 w-full rounded-lg bg-amber-300 text-xs font-semibold text-[#171006] transition hover:bg-amber-200 disabled:opacity-50"
        >
          {saving === `price:${priceKey}` ? '保存中…' : '保存价格'}
       </button>
     </div>
    );
  };

  const renderAdmin = () => {
    if (!admin) return null;
    return (
      <div className="space-y-5">
        <section className="rounded-2xl border border-white/10 bg-[#0d1518] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[.22em] text-amber-200/60">Pricing rules</p>
              <h3 className="mt-1 text-base font-medium text-white/90">模型价格</h3>
              <p className="mt-1 text-xs text-white/40">按 (模型, 分辨率) 设置每秒消耗的积分；1 积分 = 0.1 元，未配置的分辨率将拒绝生成。保存后立即生效</p>
           </div>
            <span className="rounded-lg bg-amber-300/10 px-3 py-2 text-[11px] text-amber-200">管理员</span>
         </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {(admin.prices || []).map(renderPriceCard)}
         </div>
       </section>

        <section className="rounded-2xl border border-white/10 bg-[#0d1518] p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[.22em] text-amber-200/60">User access</p>
            <h3 className="mt-1 text-base font-medium text-white/90">用户与积分</h3>
            <p className="mt-1 text-xs text-white/40">输入正数增加积分，输入负数扣减积分</p>
         </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">邮箱</th>
                  <th className="px-3 py-2 font-medium">角色</th>
                  <th className="px-3 py-2 font-medium">积分</th>
                  <th className="px-3 py-2 font-medium">注册时间</th>
                  <th className="px-3 py-2 font-medium">调整</th>
               </tr>
             </thead>
              <tbody className="divide-y divide-white/5">
                {(admin.users || []).map((user) => (
                  <tr key={user.id} className="text-white/75">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2 tabular-nums">{user.credits}</td>
                    <td className="px-3 py-2">{user.created_at?.slice(0, 16) || '刚刚'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={creditEdits[user.id] ?? ''}
                          onChange={(event) => setCreditEdits((current) => ({ ...current, [user.id]: event.target.value }))}
                          placeholder="±N"
                          className="min-h-9 w-24 rounded-lg border border-white/10 bg-[#111d20] px-2 text-xs text-white outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/10"
                        />
                        <button
                          type="button"
                          onClick={() => adjustCredits(user.id)}
                          disabled={saving === `credit:${user.id}`}
                          className="min-h-9 rounded-lg bg-amber-300 px-3 text-[11px] font-semibold text-[#171006] transition hover:bg-amber-200 disabled:opacity-50"
                        >
                          {saving === `credit:${user.id}` ? '保存中…' : '应用'}
                       </button>
                     </div>
                   </td>
                 </tr>
                ))}
             </tbody>
           </table>
         </div>
       </section>
     </div>
    );
  };

  return (
    <section className="mb-7 overflow-hidden rounded-3xl border border-white/10 bg-[#091113] shadow-2xl shadow-black/20">
      <header className="border-b border-white/10 bg-gradient-to-r from-[#101e20] to-[#0b1517] px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[.24em] text-cyan-200/55">Workspace console</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">账户控制台</h2>
            <p className="mt-1 text-xs text-white/40">{session.user?.email}</p>
         </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/[.07] px-4 py-2.5 text-right">
              <p className="text-[10px] uppercase tracking-wider text-cyan-100/45">可用积分</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-cyan-200">{session.user?.credits ?? 0}</p>
           </div>
            <div className="hidden rounded-xl border border-white/10 bg-white/[.03] px-4 py-2.5 text-right sm:block">
              <p className="text-[10px] uppercase tracking-wider text-white/35">已完成</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-white/80">{completedCount}</p>
           </div>
         </div>
       </div>
        <nav className="mt-6 flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1" aria-label="账户控制台导航">
          {TABS.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 flex-1 rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 ${activeTab === tab.id ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/75'} ${tab.id === 'admin' && !admin ? 'hidden' : ''}`}
            >
              <span className="mr-2 text-cyan-200/70">{tab.icon}</span>
              {tab.label}
           </button>
          ))}
       </nav>
     </header>
      <div className="p-5 sm:p-7">
        {notice && (
          <div
            role="status"
            className={`mb-5 rounded-xl border px-4 py-3 text-xs ${notice.type === 'error' ? 'border-rose-300/20 bg-rose-300/5 text-rose-200' : 'border-emerald-300/20 bg-emerald-300/5 text-emerald-200'}`}
          >
            {notice.text}
         </div>
        )}
        {loading ? (
          <div className="rounded-2xl border border-white/10 p-8 text-center text-sm text-white/40">正在同步账户数据…</div>
        ) : activeTab === 'admin' ? (
          renderAdmin()
        ) : activeTab === 'history' ? (
          renderHistory()
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className="rounded-2xl border border-white/10 bg-white/[.025] p-5 text-left transition hover:border-cyan-300/30 hover:bg-cyan-300/[.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              <p className="text-[11px] uppercase tracking-[.2em] text-white/35">Generation history</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {history.length}
                <span className="ml-2 text-sm font-normal text-white/35">条记录</span>
             </p>
              <p className="mt-3 text-xs text-white/40">查看历史提示词、状态、消耗与结果视频</p>
           </button>
            <button
              type="button"
              onClick={onCreate}
              className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.05] p-5 text-left transition hover:border-cyan-300/45 hover:bg-cyan-300/[.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
            >
              <p className="text-[11px] uppercase tracking-[.2em] text-cyan-200/55">Create new</p>
              <p className="mt-2 text-lg font-semibold text-white">
                生成新视频 <span className="text-cyan-200">→</span>
             </p>
              <p className="mt-3 text-xs text-white/40">已消耗 {totalSpent} 积分 · 当前余额 {session.user?.credits ?? 0} 积分</p>
           </button>
         </div>
        )}
     </div>
   </section>
  );
}
