import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAccountSession, signAccountSession } from '@/lib/yinhe-auth';
import { dataRequest } from '@/lib/yinhe-data';
import { getMediaSettings } from '@/lib/yinhe-media';
import { hashPassword, verifyPassword } from '@/lib/yinhe-password';

export const runtime = 'nodejs';
const COOKIE_NAME = 'yinhe_studio_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
function settings() { return process.env.AIGC_STUDIO_SESSION_SECRET ? { secret: process.env.AIGC_STUDIO_SESSION_SECRET } : null; }
function responseWithSession(user) { const response = NextResponse.json({ authenticated: true, user }); response.cookies.set(COOKIE_NAME, signAccountSession({ user, secret: settings().secret, ttlSeconds: SESSION_SECONDS }), { httpOnly: true, maxAge: SESSION_SECONDS, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }); return response; }
export async function GET(request) { const config = settings(); const mediaConfigured = Boolean(getMediaSettings()); const session = config && getAccountSession(request.cookies.get(COOKIE_NAME)?.value, config); if (!session) return NextResponse.json({ configured: Boolean(config), mediaConfigured, authenticated: false }); try { const { user } = await dataRequest('profile', { userId: session.id }); return NextResponse.json({ configured: true, mediaConfigured, authenticated: Boolean(user), user }); } catch { return NextResponse.json({ configured: true, mediaConfigured, authenticated: false }); } }
export async function POST(request) { if (!settings()) return NextResponse.json({ error: 'Studio configuration is unavailable.' }, { status: 503 }); try { const { mode, email, password } = await request.json(); if (mode === 'register') { const { user } = await dataRequest('register', { id: randomUUID(), email: String(email || '').trim().toLowerCase(), passwordHash: await hashPassword(password) }); return responseWithSession(user); } const { user } = await dataRequest('login', { email: String(email || '').trim().toLowerCase() }); if (!user || !await verifyPassword(password, user.password_hash)) return NextResponse.json({ error: '邮箱或密码不正确。' }, { status: 401 }); return responseWithSession(user); } catch (error) { return NextResponse.json({ error: error.message || '请求失败。' }, { status: error.status || 400 }); } }
export async function DELETE() { const response = NextResponse.json({ authenticated: false }); response.cookies.set(COOKIE_NAME, '', { httpOnly: true, maxAge: 0, path: '/', sameSite: 'lax', secure: process.env.NODE_ENV === 'production' }); return response; }
