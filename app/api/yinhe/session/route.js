import { NextResponse } from 'next/server';
import {
  signStudioSession,
  verifyStudioAccessToken,
  verifyStudioSession,
} from '@/lib/yinhe-auth';
import { getMediaSettings } from '@/lib/yinhe-media';
import { getProviderSettings } from '@/lib/yinhe-provider';

export const runtime = 'nodejs';

const COOKIE_NAME = 'yinhe_studio_session';
const SESSION_SECONDS = 60 * 60 * 12;

export async function GET(request) {
  const settings = getProviderSettings();
  const mediaSettings = getMediaSettings();
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  return NextResponse.json({
    configured: Boolean(settings),
    mediaConfigured: Boolean(mediaSettings),
    authenticated: Boolean(
      settings
      && sessionToken
      && verifyStudioSession(sessionToken, { secret: settings.sessionSecret }),
    ),
  });
}

export async function POST(request) {
  const settings = getProviderSettings();
  if (!settings) {
    return NextResponse.json({ error: 'Studio configuration is unavailable.' }, { status: 503 });
  }

  let accessToken;
  try {
    ({ accessToken } = await request.json());
  } catch {
    return NextResponse.json({ error: 'A JSON access token is required.' }, { status: 400 });
  }

  if (!verifyStudioAccessToken(accessToken, settings.accessToken)) {
    return NextResponse.json({ error: 'Invalid studio access token.' }, { status: 401 });
  }

  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(COOKIE_NAME, signStudioSession({
    secret: settings.sessionSecret,
    ttlSeconds: SESSION_SECONDS,
  }), {
    httpOnly: true,
    maxAge: SESSION_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
