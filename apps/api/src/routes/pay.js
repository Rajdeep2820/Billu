const router = require('express').Router();
const prisma = require('../services/prisma');

// GET /pay/:transactionId — Smart landing page: UPI payment + receipt download
router.get('/:transactionId', async (req, res) => {
  try {
    const tx = await prisma.transaction.findUnique({
      where: { id: req.params.transactionId },
      include: {
        tenant: { select: { name: true } },
        outlet: { select: { name: true, city: true } },
      },
    });

    if (!tx) return res.status(404).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not Found</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.msg{text-align:center}.msg h1{font-size:72px;font-weight:200;letter-spacing:-2px;margin-bottom:8px}.msg p{color:#666;font-size:14px;letter-spacing:1px}</style></head>
<body><div class="msg"><h1>404</h1><p>RECEIPT NOT FOUND</p></div></body></html>`);

    const amount = parseFloat(tx.totalAmount).toFixed(2);
    const merchantUpi = process.env.MERCHANT_UPI_ID || 'merchant@upi';
    const merchantName = process.env.MERCHANT_NAME || 'Billu POS';
    const txNote = `Payment for Order ${tx.id.split('-')[0].toUpperCase()}`;
    const receiptUrl = tx.receiptPath || '#';
    const orderDate = new Date(tx.createdAt);
    const formattedDate = orderDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const formattedTime = orderDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase();

    // UPI params
    const upiParams = `pa=${encodeURIComponent(merchantUpi)}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txNote)}&cu=INR`;
    const gpayLink = `gpay://upi/pay?${upiParams}`;
    const phonepeLink = `phonepe://pay?${upiParams}`;
    const paytmLink = `paytmmp://pay?${upiParams}`;
    const mobikwikLink = `mobikwik://upi/pay?${upiParams}`;
    const genericUpi = `upi://pay?${upiParams}`;

    // Parse line items
    const lineItems = tx.lineItems || [];

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${tx.tenant.name} — Receipt</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: #000;
      color: #fff;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .receipt {
      width: 100%;
      max-width: 420px;
      min-height: 100vh;
      padding: 48px 28px 40px;
      animation: fadeIn 0.6s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ─── Header ─── */
    .header {
      text-align: center;
      margin-bottom: 40px;
    }

    .store-name {
      font-size: 38px;
      font-weight: 800;
      letter-spacing: 2px;
      color: #fff;
      margin-bottom: 6px;
    }

    .store-location {
      font-size: 11px;
      font-weight: 400;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #555;
    }

    /* ─── Divider ─── */
    .divider {
      height: 1px;
      background: #1a1a1a;
      margin: 24px 0;
    }

    .divider-dashed {
      height: 1px;
      border: none;
      border-top: 1px dashed #222;
      margin: 20px 0;
    }

    /* ─── Amount Section ─── */
    .amount-section {
      text-align: center;
      padding: 32px 0;
    }

    .amount-label {
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 12px;
    }

    .amount {
      font-size: 56px;
      font-weight: 800;
      letter-spacing: -2px;
      color: #fff;
      line-height: 1;
    }

    .amount .currency {
      font-size: 28px;
      font-weight: 300;
      vertical-align: super;
      margin-right: 2px;
      color: #888;
    }

    .order-id {
      margin-top: 16px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 2px;
      color: #444;
    }

    /* ─── Status ─── */
    .status {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 20px;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #fff;
    }

    .status-dot.paid { background: #fff; }
    .status-dot.pending {
      background: #666;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .status-text {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #888;
    }

    /* ─── Line Items ─── */
    .items-header {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #444;
      margin-bottom: 16px;
    }

    .item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 10px 0;
      border-bottom: 1px solid #111;
    }

    .item:last-child { border-bottom: none; }

    .item-name {
      font-size: 13px;
      font-weight: 400;
      color: #ccc;
      flex: 1;
    }

    .item-qty {
      font-size: 11px;
      font-weight: 500;
      color: #555;
      margin: 0 16px;
      min-width: 30px;
      text-align: center;
    }

    .item-price {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
      min-width: 70px;
      text-align: right;
    }

    /* ─── Totals ─── */
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 16px 0 0;
    }

    .total-label {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #888;
    }

    .total-value {
      font-size: 20px;
      font-weight: 800;
      color: #fff;
    }

    /* ─── Meta Row ─── */
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin: 8px 0;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .meta-item.right { text-align: right; }

    .meta-label {
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #444;
    }

    .meta-value {
      font-size: 12px;
      font-weight: 500;
      color: #999;
    }

    /* ─── UPI Payment Section ─── */
    .pay-section {
      margin-top: 8px;
    }

    .pay-title {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #444;
      margin-bottom: 16px;
      text-align: center;
    }

    .upi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      margin-bottom: 12px;
    }

    .upi-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 16px 8px;
      background: #0a0a0a;
      border: 1px solid #1a1a1a;
      border-radius: 12px;
      text-decoration: none;
      color: #999;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .upi-btn:active {
      background: #111;
      border-color: #333;
      transform: scale(0.96);
    }

    .upi-btn .upi-icon {
      height: 60px;
      max-width: 100%;
      object-fit: contain;
      margin-bottom: 4px;
      border-radius: 6px;
    }

    .upi-other {
      display: block;
      width: 100%;
      padding: 14px;
      background: transparent;
      border: 1px solid #1a1a1a;
      border-radius: 12px;
      text-decoration: none;
      color: #555;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-align: center;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .upi-other:active {
      background: #0a0a0a;
      border-color: #333;
    }

    /* ─── Receipt Button ─── */
    .btn-receipt {
      display: block;
      width: 100%;
      padding: 18px;
      background: #fff;
      border: none;
      border-radius: 14px;
      text-decoration: none;
      color: #000;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      text-align: center;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
    }

    .btn-receipt:active {
      background: #ddd;
      transform: scale(0.98);
    }

    .receipt-generating {
      text-align: center;
      padding: 18px;
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #444;
    }

    .receipt-generating .spinner {
      display: inline-block;
      width: 12px;
      height: 12px;
      border: 1.5px solid #333;
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* ─── Footer ─── */
    .footer {
      text-align: center;
      margin-top: 40px;
      padding-bottom: 20px;
    }

    .footer-text {
      font-size: 9px;
      font-weight: 500;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #333;
    }

    .footer-brand {
      margin-top: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 5px;
      text-transform: uppercase;
      color: #222;
    }
  </style>
</head>
<body>
  <div class="receipt">

    <!-- Header -->
    <div class="header">
      <div class="store-name">${tx.tenant.name}</div>
      <div class="store-location">${tx.outlet.name}${tx.outlet.city ? ' · ' + tx.outlet.city : ''}</div>
    </div>

    <div class="divider"></div>

    <!-- UPI Payment (only if pending) -->
    ${tx.paymentMethod === 'card' ? `
      <div class="pay-section">
        <div class="pay-title">Pay with UPI</div>
        <div class="upi-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr;">
          <a href="${gpayLink}" class="upi-btn">
            <img src="https://cdn-icons-png.flaticon.com/512/6124/6124998.png" class="upi-icon" alt="GPay">
            GPay
          </a>
          <a href="${phonepeLink}" class="upi-btn">
            <img src="https://images.seeklogo.com/logo-png/50/1/phonepe-logo-png_seeklogo-507202.png" class="upi-icon" alt="PhonePe">
            PhonePe
          </a>
          <a href="${paytmLink}" class="upi-btn">
            <img src="https://images.seeklogo.com/logo-png/50/1/paytm-logo-png_seeklogo-501241.png" class="upi-icon" alt="Paytm">
            Paytm
          </a>
          <a href="${mobikwikLink}" class="upi-btn">
            <img src="https://static-asset.inc42.com/logo/mobikwik.png" class="upi-icon" alt="MobiKwik">
            MobiKwik
          </a>
        </div>
        <a href="${genericUpi}" class="upi-other">Other UPI App</a>
        <div class="divider"></div>
      </div>
    ` : ''}

    <!-- Amount -->
    <div class="amount-section">
      <div class="amount-label">Total Amount</div>
      <div class="amount"><span class="currency">₹</span>${amount}</div>
      <div class="order-id">#${tx.id.split('-')[0].toUpperCase()}</div>

      <div class="status">
        <span class="status-dot ${tx.paymentMethod === 'card' ? 'pending' : 'paid'}"></span>
        <span class="status-text">${tx.paymentMethod === 'card' ? 'Awaiting Payment' : tx.paymentMethod.toUpperCase() + ' · Paid'}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Line Items -->
    <div class="items-header">Items</div>
    ${lineItems.map(item => `
      <div class="item">
        <span class="item-name">${item.name}</span>
        <span class="item-qty">×${item.qty}</span>
        <span class="item-price">₹${(parseFloat(item.unitPrice) * item.qty).toFixed(2)}</span>
      </div>
    `).join('')}

    <div class="divider-dashed"></div>

    <div class="total-row">
      <span class="total-label">Total</span>
      <span class="total-value">₹${amount}</span>
    </div>

    <div class="divider"></div>

    <!-- Meta -->
    <div class="meta-grid">
      <div class="meta-item">
        <span class="meta-label">Date</span>
        <span class="meta-value">${formattedDate}</span>
      </div>
      <div class="meta-item right">
        <span class="meta-label">Time</span>
        <span class="meta-value">${formattedTime}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Payment</span>
        <span class="meta-value">${tx.paymentMethod.toUpperCase()}</span>
      </div>
      <div class="meta-item right">
        <span class="meta-label">Order</span>
        <span class="meta-value">#${tx.id.split('-')[0].toUpperCase()}</span>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Receipt Download -->
    ${receiptUrl !== '#' ? `
      <a href="${receiptUrl}" target="_blank" class="btn-receipt">
        Download Receipt
      </a>
    ` : `
      <div class="receipt-generating">
        <span class="spinner"></span> Generating Receipt
      </div>
    `}

    <!-- Footer -->
    <div class="footer">
      <div class="footer-text">Paperless Checkout</div>
      <div class="footer-brand">Billu POS</div>
    </div>

  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[Pay Page]', err);
    res.status(500).send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Error</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif;background:#000;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center}
.msg{text-align:center}.msg h1{font-size:72px;font-weight:200;letter-spacing:-2px;margin-bottom:8px}.msg p{color:#666;font-size:14px;letter-spacing:1px}</style></head>
<body><div class="msg"><h1>500</h1><p>SOMETHING WENT WRONG</p></div></body></html>`);
  }
});

module.exports = router;
