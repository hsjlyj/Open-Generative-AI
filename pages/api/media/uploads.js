import crypto from 'crypto';

const WORKER_URL = process.env.CLOUDFLARE_WORKER_URL || 'https://media.zdc.mom';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { filename, contentType } = req.body;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'Missing filename or contentType' });
    }

    // Generate unique file ID
    const fileId = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const uploadUrl = `${WORKER_URL}/upload/${fileId}`;

    res.status(200).json({
      uploadUrl,
      fileId,
      expiresIn: 600
    });
  } catch (error) {
    console.error('Upload capability error:', error);
    res.status(500).json({ error: 'Failed to generate upload capability' });
  }
}
