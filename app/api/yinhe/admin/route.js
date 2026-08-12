import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/yinhe-account';
import { dataRequest } from '@/lib/yinhe-data';
export const runtime = 'nodejs';
export async function GET(request) {
  try { const account = requireAccount(request); const [users, prices] = await Promise.all([dataRequest('adminUsers', { userId: account.id }), dataRequest('prices')]); return NextResponse.json({ ...users, ...prices }); }
  catch (error) { return NextResponse.json({ error: error.message || '无法读取管理数据。' }, { status: /Administrator access is required/i.test(error.message || '') ? 403 : error.status || 500 }); }
}
export async function POST(request) {
  try {
    const account = requireAccount(request);
    const body = await request.json();
    const action = body.action === 'adjustCredits' ? 'adminAdjustCredits' : body.action === 'setPrice' ? 'adminSetPrice' : null;
    console.log('[yinhe/admin POST]', JSON.stringify({ caller: account.id, role: account.role, action, body }));
    if (!action) return NextResponse.json({ error: '无效管理操作。' }, { status: 400 });
    const result = await dataRequest(action, { ...body, userId: account.id });
    console.log('[yinhe/admin POST result]', JSON.stringify({ action, ok: !result.error, keys: Object.keys(result || {}) }));
    return NextResponse.json(result);
  }
  catch (error) {
    console.error('[yinhe/admin POST error]', error.message, error.status);
    return NextResponse.json({ error: error.message || '管理操作失败。' }, { status: /Administrator access is required/i.test(error.message || '') ? 403 : error.status || 500 });
  }
}
