function readRequired(env, name) {
  const value = env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function getProviderSettings(env = process.env) {
  const rawBaseUrl = readRequired(env, 'AIGC_API_BASE_URL');
  const apiKey = readRequired(env, 'AIGC_API_KEY');
  const accessToken = readRequired(env, 'AIGC_STUDIO_ACCESS_TOKEN');
  const sessionSecret = readRequired(env, 'AIGC_STUDIO_SESSION_SECRET');

  if (!rawBaseUrl || !apiKey || !accessToken || !sessionSecret) {
    return null;
  }

  try {
    const url = new URL(rawBaseUrl);
    if (url.protocol !== 'https:') {
      return null;
    }

    const path = url.pathname.replace(/\/+$/, '');
    return {
      baseUrl: `${url.origin}${path}`,
      apiKey,
      accessToken,
      sessionSecret,
    };
  } catch {
    return null;
  }
}

export function isValidTaskId(taskId) {
  return typeof taskId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(taskId);
}
