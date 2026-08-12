const MODELS = new Set(['cheap-seedance-2.0', 'cheap-seedance-2.0-fast', 'cheap-seedance-2.0-mini']);
const TASK_STATUSES = new Set(['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED']);

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
function uuid() { return crypto.randomUUID(); }
function taskView(task, request) {
  return { ...task, audio: Boolean(task.audio), videoUrl: task.storage_key ? `${new URL(request.url).origin}/video/${task.id}` : task.result_url };
}
async function userById(DB, id) {
  return DB.prepare('SELECT id, email, role, credits, created_at FROM users WHERE id = ?').bind(id).first();
}
async function requireAdmin(DB, userId) {
  const user = await userById(DB, userId);
  if (!user || user.role !== 'admin') throw new Error('Administrator access is required.');
  return user;
}

async function action(request, env, input) {
  const { DB } = env;
  switch (input.action) {
    case 'register': {
      const { id, email, passwordHash } = input;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') || typeof passwordHash !== 'string' || passwordHash.length < 32) throw new Error('Invalid registration details.');
      const existing = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
      if (existing) return { error: '该邮箱已注册。', status: 409 };
      const isAdmin = (env.ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).includes(email.toLowerCase());
      const credits = Number(env.DEFAULT_CREDITS || 50);
      await DB.prepare('INSERT INTO users (id, email, password_hash, role, credits) VALUES (?, ?, ?, ?, ?)').bind(id, email, passwordHash, isAdmin ? 'admin' : 'user', credits).run();
      return { user: await userById(DB, id) };
    }
    case 'login': {
      const user = await DB.prepare('SELECT id, email, password_hash, role, credits FROM users WHERE email = ?').bind(input.email || '').first();
      return { user };
    }
    case 'profile': return { user: await userById(DB, input.userId) };
    case 'prices': return { prices: (await DB.prepare('SELECT model, resolution, credits_per_second, updated_at FROM model_prices ORDER BY model, resolution').all()).results };
    case 'history': {
      const rows = await DB.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(input.userId).all();
      return { tasks: rows.results.map((task) => taskView(task, request)) };
    }
    case 'reserve': {
      const { task, userId } = input;
      if (!task || !MODELS.has(task.model) || !Number.isInteger(task.durationSeconds) || task.durationSeconds < 4 || task.durationSeconds > 15) throw new Error('Invalid generation request.');
      const price = await DB.prepare('SELECT credits_per_second FROM model_prices WHERE model = ? AND resolution = ?').bind(task.model, task.resolution).first();
      if (!price) throw new Error(`Model pricing is unavailable for ${task.model} at ${task.resolution}.`);
      const cost = price.credits_per_second * task.durationSeconds;
      const update = await DB.prepare('UPDATE users SET credits = credits - ? WHERE id = ? AND credits >= ?').bind(cost, userId, cost).run();
      if (!update.meta.changes) return { error: '额度不足，无法提交生成任务。', status: 402 };
      const id = uuid();
      await DB.batch([
        DB.prepare('INSERT INTO tasks (id, user_id, model, prompt, aspect_ratio, resolution, duration_seconds, audio, name, credits_reserved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, userId, task.model, task.input, task.aspectRatio, task.resolution, task.durationSeconds, task.audio ? 1 : 0, task.name || null, cost),
        DB.prepare('INSERT INTO credit_ledger (id, user_id, amount, reason, task_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), userId, -cost, 'generation_reservation', id),
      ]);
      return { task: await DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first(), user: await userById(DB, userId) };
    }
    case 'bindProviderTask': await DB.prepare('UPDATE tasks SET provider_task_id = ?, status = ? , updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?').bind(input.providerTaskId, input.status || 'PENDING', input.taskId, input.userId).run(); return {};
    case 'syncProviderTask': {
      const task = await DB.prepare('SELECT id FROM tasks WHERE provider_task_id = ? AND user_id = ?').bind(input.providerTaskId, input.userId).first();
      if (!task) return { error: '任务不存在。', status: 404 };
      return action(request, env, { ...input, action: 'updateTask', taskId: task.id });
    }
    case 'updateTask': {
      const task = await DB.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').bind(input.taskId, input.userId).first();
      if (!task) return { error: '任务不存在。', status: 404 };
      const status = TASK_STATUSES.has(input.status) ? input.status : task.status;
      let storageKey = task.storage_key;
      if (status === 'SUCCESS' && input.resultUrl && !storageKey) {
        const source = await fetch(input.resultUrl);
        if (!source.ok || !source.body) throw new Error('Unable to archive completed video.');
        storageKey = `videos/${task.user_id}/${task.id}.mp4`;
        await env.VIDEOS.put(storageKey, source.body, { httpMetadata: { contentType: source.headers.get('content-type') || 'video/mp4' } });
      }
      const failed = status === 'FAILED' || status === 'CANCELLED';
      if (failed && !task.credits_refunded) await DB.batch([
        DB.prepare('UPDATE users SET credits = credits + ? WHERE id = ?').bind(task.credits_reserved, task.user_id),
        DB.prepare('INSERT INTO credit_ledger (id, user_id, amount, reason, task_id) VALUES (?, ?, ?, ?, ?)').bind(uuid(), task.user_id, task.credits_reserved, 'generation_refund', task.id),
      ]);
      await DB.prepare('UPDATE tasks SET status=?, result_url=?, storage_key=?, thumbnail_url=?, fail_reason=?, credits_refunded=?, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status, input.resultUrl || task.result_url, storageKey, input.thumbnailUrl || task.thumbnail_url, input.failReason || null, failed ? 1 : task.credits_refunded, task.id).run();
      return { task: taskView(await DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(task.id).first(), request), user: await userById(DB, task.user_id) };
    }
    case 'adminUsers': { await requireAdmin(DB, input.userId); return { users: (await DB.prepare('SELECT id,email,role,credits,created_at FROM users ORDER BY created_at DESC LIMIT 200').all()).results }; }
    case 'adminAdjustCredits': { await requireAdmin(DB, input.userId); const amount = Number(input.amount); if (!Number.isInteger(amount) || !input.targetUserId) throw new Error('Invalid credit adjustment.'); await DB.batch([DB.prepare('UPDATE users SET credits = MAX(0, credits + ?) WHERE id = ?').bind(amount, input.targetUserId), DB.prepare('INSERT INTO credit_ledger (id,user_id,amount,reason) VALUES (?,?,?,?)').bind(uuid(), input.targetUserId, amount, 'admin_adjustment')]); return { user: await userById(DB, input.targetUserId) }; }
    case 'adminSetPrice': { await requireAdmin(DB, input.userId); if (!MODELS.has(input.model) || !Number.isInteger(input.creditsPerSecond) || input.creditsPerSecond < 0 || typeof input.resolution !== 'string' || !input.resolution) throw new Error('Invalid price.'); await DB.prepare('INSERT INTO model_prices (model, resolution, credits_per_second) VALUES (?, ?, ?) ON CONFLICT(model, resolution) DO UPDATE SET credits_per_second = excluded.credits_per_second, updated_at = CURRENT_TIMESTAMP').bind(input.model, input.resolution, input.creditsPerSecond).run(); return { prices: (await DB.prepare('SELECT model,resolution,credits_per_second,updated_at FROM model_prices ORDER BY model, resolution').all()).results }; }
    default: return { error: 'Unknown action.', status: 400 };
  }
}

export default { async fetch(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.startsWith('/video/')) {
    const task = await env.DB.prepare('SELECT storage_key FROM tasks WHERE id = ?').bind(url.pathname.slice(7)).first();
    if (!task?.storage_key) return new Response('Not found.', { status: 404 });
    const object = await env.VIDEOS.get(task.storage_key);
    return object ? new Response(object.body, { headers: { 'Content-Type': object.httpMetadata?.contentType || 'video/mp4', 'Cache-Control': 'private, max-age=3600' } }) : new Response('Not found.', { status: 404 });
  }
  if (request.method !== 'POST' || request.headers.get('Authorization') !== `Bearer ${env.DATA_API_SECRET}`) return json({ error: 'Unauthorized.' }, 401);
  try { const result = await action(request, env, await request.json()); return json(result, result.status || 200); } catch (error) { return json({ error: error.message || 'Internal error.' }, 500); }
} };
