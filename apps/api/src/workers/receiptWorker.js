const Bull = require('bull');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const prisma = require('../services/prisma');

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

    // Ensure receipts directory exists
    const dir = path.resolve(process.env.RECEIPTS_DIR || './receipts', tenantId);
    fs.mkdirSync(dir, { recursive: true });

    const filename = `${transactionId}.pdf`;
    const filepath = path.join(dir, filename);

    // Generate QR code (points to receipt URL)
    const receiptUrl = `http://localhost:${process.env.PORT || 4000}/receipts/${tenantId}/${filename}`;
    const qrDataUrl = await QRCode.toDataURL(receiptUrl);
    const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    // Generate PDF receipt
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: [226, 600], margin: 20 }); // 80mm thermal width
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

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
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // Update transaction with receipt path
    const relativePath = `${tenantId}/${filename}`;
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { receiptPath: relativePath },
    });

    // Notify dashboard via socket
    if (io) {
      io.to(`tenant:${tenantId}`).emit('receipt:ready', {
        transactionId,
        receiptUrl,
      });
    }

    return { receiptPath: relativePath };
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
