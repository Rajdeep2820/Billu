const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ─── R2-compatible S3 Client ───────────────────────────────
// Cloudflare R2 speaks the S3 protocol. We override the endpoint
// to point at R2, and set region to 'auto' (R2 is regionless).
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET || 'billu-pos-receipts';

/**
 * Upload a PDF buffer to R2 and return a signed URL.
 * @param {string} key - Object key, e.g. "receipts/tenant-id/tx-id.pdf"
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Signed URL (valid for 7 days)
 */
async function uploadReceipt(key, buffer) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf',
  });

  await s3Client.send(command);

  return getReceiptUrl(key);
}

/**
 * Generate a signed URL for a receipt (valid for 7 days).
 * R2 signed URLs are time-limited and more secure than public URLs.
 * @param {string} key - Object key
 * @returns {Promise<string>} Presigned download URL
 */
async function getReceiptUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });

  // 7 days = 604800 seconds (max allowed by R2)
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 604800 });
  return signedUrl;
}

module.exports = { uploadReceipt, getReceiptUrl };
