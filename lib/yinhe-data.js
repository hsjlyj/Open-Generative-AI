export async function dataRequest(action, payload = {}) {
  const baseUrl = process.env.AIGC_DATA_WORKER_URL;
  const secret = process.env.AIGC_DATA_API_SECRET;
  if (!baseUrl || !secret) throw new Error('Account service is not configured.');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const error = new Error(data.error || 'Account service request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}
