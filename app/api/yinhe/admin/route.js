import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/yinhe-account';
import { dataRequest } from '@/lib/yinhe-data';
export const runtime = 'nodejs';
export async function GET(request) {
  try { const account = requireAccount(request); const [users, prices] = await Promise.all([dataRequest('adminUsers', { userId: account.id }), dataRequest('prices')]); return NextResponse.json({ ...users, ...prices }); }
  catch (error) { return NextResponse.json({ error: error.message || '无法读取管理数据。' }, { status: /Administrator access is required/i.test(error.message || '') ? 403 : error.status || 500 }); }
}
export async function POST(request) {
  try { const account = requireAccount(request); const body = await request.json(); const action = body.action === 'adjustCredits' ? 'adminAdjustCredits' : body.action === 'setPrice' ? 'adminSetPrice' : null; if (!action) return NextResponse.json({ error: '无效管理操作。' }, { status: 400 }); return NextResponse.json(await dataRequest(action, { ...body, userId: account.id })); }
  catch (error) { return NextResponse.json({ error: error.message || '管理操作失败。' }, { status: /Administrator access is required/i.test(error.message || '') ? 403 : error.status || 500 }); }
}
