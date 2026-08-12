import { NextResponse } from 'next/server';
import { dataRequest } from '@/lib/yinhe-data';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const { prices } = await dataRequest('prices');
    return NextResponse.json({ prices });
  } catch (error) {
    return NextResponse.json({ error: error.message || '无法读取价格。' }, { status: error.status || 500 });
  }
}
