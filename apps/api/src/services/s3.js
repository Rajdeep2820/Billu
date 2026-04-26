const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'billu-pos-receipts-rajdeep';

/**
 * Upload a PDF buffer to S3 and return the public URL.
 * @param {string} key - S3 object key, e.g. "receipts/tenant-id/tx-id.pdf"
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<string>} Public URL of the uploaded object
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
 * Construct the public S3 URL for a receipt.
 * @param {string} key - S3 object key
 * @returns {string} Full public URL
 */
function getReceiptUrl(key) {
  return `https://${BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;
}

module.exports = { uploadReceipt, getReceiptUrl };
