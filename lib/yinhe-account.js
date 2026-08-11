import { getAccountSession } from '@/lib/yinhe-auth';

const COOKIE_NAME = 'yinhe_studio_session';

export function requireAccount(request) {
  const secret = process.env.AIGC_STUDIO_SESSION_SECRET;
  const account = secret && getAccountSession(request.cookies.get(COOKIE_NAME)?.value, { secret });
  if (!account) {
    const error = new Error('请先登录账户。');
    error.status = 401;
    throw error;
  }
  return account;
}
