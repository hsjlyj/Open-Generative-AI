import { NextResponse } from 'next/server';
import { verifyStudioSession } from '@/lib/yinhe-auth';
import { createMediaUploadCapability, getMediaSettings } from '@/lib/yinhe-media';
import { getProviderSettings } from '@/lib/yinhe-provider';

export const runtime = 'nodejs';

const COOKIE_NAME = 'yinhe_studio_session';

export async function POST(request) {
  const providerSettings = getProviderSettings();
  const mediaSettings = getMediaSettings();
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value;

  if (
    !providerSettings
    || !sessionToken
    || !verifyStudioSession(sessionToken, { secret: providerSettings.sessionSecret })
  ) {
    return NextResponse.json({ error: 'Studio authentication is required.' }, { status: 401 });
  }
  if (!mediaSettings) {
    return NextResponse.json({ error: 'Image storage is not configured.' }, { status: 503 });
  }

  try {
    const capability = createMediaUploadCapability(await request.json(), mediaSettings);
    return NextResponse.json(capability, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Invalid image upload.' }, { status: 400 });
  }
}
