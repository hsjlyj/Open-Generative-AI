import crypto from 'crypto';

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://media.zdc.mom';
const SIGNING_SECRET = process.env.AIGC_MEDIA_SIGNING_SECRET;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function generateMediaId() {
  return 'media_' + crypto.randomBytes(16).toString('hex');
}

function generateOwner(userId) {
  return crypto.createHash('md5').update(userId || 'anonymous').digest('hex');
}

function signCapability(method, mediaId, owner, type, size, expiresAt) {
  const payload = [method, mediaId, owner, type, String(size), String(expiresAt)].join('\n');
  const hmac = crypto.createHmac('sha256', SIGNING_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('base64url');
  return signature;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SIGNING_SECRET) {
    console.error('AIGC_MEDIA_SIGNING_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  try {
    const { contentType, size, userId } = req.body;

    if (!contentType || !size) {
      return res.status(400).json({ error: 'Missing contentType or size' });
    }

    const fileSize = Number(size);
    if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_IMAGE_BYTES) {
      return res.status(400).json({ error: 'Invalid file size' });
    }

    const mediaId = generateMediaId();
    const owner = generateOwner(userId);
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const signature = signCapability('PUT', mediaId, owner, contentType, fileSize, expiresAt);

    const params = new URLSearchParams({
      owner,
      type: contentType,
      size: String(fileSize),
      expires: String(expiresAt),
      sig: signature
    });

    const uploadUrl = `${WORKER_URL}/upload/${mediaId}?${params}`;
    const mediaUrl = `${WORKER_URL}/media/${mediaId}?${params}`;

    res.status(200).json({
      uploadUrl,
      mediaUrl,
      mediaId,
      expiresIn: 600
    });
  } catch (error) {
    console.error('Upload capability error:', error);
    res.status(500).json({ error: 'Failed to generate upload capability' });
  }
}
