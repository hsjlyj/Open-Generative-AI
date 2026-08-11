import { NextResponse } from 'next/server';
import { requireAccount } from '@/lib/yinhe-account';
import { dataRequest } from '@/lib/yinhe-data';
export const runtime = 'nodejs';
export async function GET(request) {
  try { const account = requireAccount(request); return NextResponse.json(await dataRequest('history', { userId: account.id })); }
  catch (error) { return NextResponse.json({ error: error.message || '无法读取历史记录。' }, { status: error.status || 500 }); }
}
