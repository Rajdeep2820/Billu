const Bull = require('bull');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const prisma = require('../services/prisma');
const { uploadReceipt } = require('../services/s3');

let receiptQueue;

function initQueues(io) {
  receiptQueue = new Bull('receipts', process.env.REDIS_URL);

  receiptQueue.process('generate-receipt', 3, async (job) => {
    const { transactionId, tenantId, outletId } = job.data;

    // Fetch full transaction
    const tx = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        outlet: true,
        tenant: { select: { name: true } },
        cashier: { select: { name: true } },
      },
    });

    if (!tx) throw new Error(`Transaction ${transactionId} not found`);
    if (tx.receiptPath) return { skipped: true }; // already generated (idempotent)

    const s3Key = `receipts/${tenantId}/${transactionId}.pdf`;

    // QR points to the smart landing page (UPI pay + receipt download)
    const apiHost = process.env.API_HOST || `http://localhost:${process.env.PORT || 4000}`;
    const landingUrl = `${apiHost}/pay/${transactionId}`;
    const s3Url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
    const qrDataUrl = await QRCode.toDataURL(landingUrl);
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    // Generate PDF receipt into an in-memory buffer
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [226, 600], margin: 20 }); // 80mm thermal width
      const chunks = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(14).font('Helvetica-Bold').text(tx.tenant.name, { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(tx.outlet.name, { align: 'center' });
      if (tx.outlet.city) doc.text(tx.outlet.city, { align: 'center' });
      doc.moveDown(0.5);

      // Receipt meta
      doc.fontSize(8).text(`Receipt #: ${tx.id.split('-')[0].toUpperCase()}`, { align: 'left' });
      doc.text(`Date: ${new Date(tx.createdAt).toLocaleString('en-IN')}`);
      doc.text(`Cashier: ${tx.cashier?.name || 'N/A'}`);
      doc.text(`Payment: ${tx.paymentMethod.toUpperCase()}`);
      doc.moveDown(0.5);

      // Divider
      doc.moveTo(20, doc.y).lineTo(206, doc.y).stroke();
      doc.moveDown(0.3);

      // Line items
      doc.fontSize(8).font('Helvetica-Bold');
      doc.text('Item', 20, doc.y, { continued: true, width: 100 });
      doc.text('Qty', 120, doc.y, { continued: true, width: 30, align: 'right' });
      doc.text('Amt', 150, doc.y, { width: 56, align: 'right' });
      doc.font('Helvetica');

      for (const item of tx.lineItems) {
        const amount = (parseFloat(item.unitPrice) * item.qty).toFixed(2);
        doc.text(item.name.substring(0, 18), 20, doc.y, { continued: true, width: 100 });
        doc.text(String(item.qty), 120, doc.y, { continued: true, width: 30, align: 'right' });
        doc.text(`₹${amount}`, 150, doc.y, { width: 56, align: 'right' });
      }

      doc.moveDown(0.3);
      doc.moveTo(20, doc.y).lineTo(206, doc.y).stroke();
      doc.moveDown(0.3);

      // Total
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text(`TOTAL`, 20, doc.y, { continued: true, width: 130 });
      doc.text(`₹${parseFloat(tx.totalAmount).toFixed(2)}`, 150, doc.y, { width: 56, align: 'right' });
      doc.moveDown(1);

      // QR Code
      doc.image(qrBuffer, { fit: [80, 80], align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(7).font('Helvetica').text('Scan to view digital receipt', { align: 'center' });
      doc.text('Thank you for shopping!', { align: 'center' });

      doc.end();
    });

    // Upload to S3
    const publicUrl = await uploadReceipt(s3Key, pdfBuffer);
    console.log(`[S3] Uploaded receipt: ${publicUrl}`);

    // Update transaction with the S3 URL as receipt path
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { receiptPath: publicUrl },
    });

    // Notify dashboard via socket — send S3 PDF URL for vendor's "View Receipt" link
    if (io) {
      io.to(`tenant:${tenantId}`).emit('receipt:ready', {
        transactionId,
        receiptUrl: publicUrl,
      });
    }

    return { receiptPath: publicUrl };
  });

  receiptQueue.on('failed', (job, err) => {
    console.error(`[Receipt] Job ${job.id} failed:`, err.message);
  });

  receiptQueue.on('completed', (job, result) => {
    if (!result?.skipped) {
      console.log(`[Receipt] Generated: ${result?.receiptPath}`);
    }
  });

  console.log('[Queue] Receipt worker initialized');
}

module.exports = { initQueues, get receiptQueue() { return receiptQueue; } };
