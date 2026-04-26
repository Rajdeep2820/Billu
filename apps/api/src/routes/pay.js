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

    if (!tx) return res.status(404).send('<h1>Receipt not found</h1>');

    const amount = parseFloat(tx.totalAmount).toFixed(2);
    const merchantUpi = process.env.MERCHANT_UPI_ID || 'merchant@upi';
    const merchantName = process.env.MERCHANT_NAME || 'Billu POS';
    const txNote = `Payment for Order ${tx.id.split('-')[0].toUpperCase()}`;
    const receiptUrl = tx.receiptPath || '#';

    // UPI params (shared across all apps)
    const upiParams = `pa=${encodeURIComponent(merchantUpi)}&pn=${encodeURIComponent(merchantName)}&am=${amount}&tn=${encodeURIComponent(txNote)}&cu=INR`;

    // App-specific deep links
    const gpayLink = `gpay://upi/pay?${upiParams}`;
    const phonepeLink = `phonepe://pay?${upiParams}`;
    const paytmLink = `paytmmp://pay?${upiParams}`;
    const mobikwikLink = `mobikwik://upi/pay?${upiParams}`;
    const genericUpi = `upi://pay?${upiParams}`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Billu POS — Pay & Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 380px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px rgba(0,0,0,0.4);
    }
    .logo { font-size: 24px; font-weight: 800; color: #38bdf8; margin-bottom: 4px; }
    .store-name { font-size: 13px; color: #94a3b8; margin-bottom: 24px; }
    .divider { height: 1px; background: #334155; margin: 20px 0; }
    .amount-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
    .amount {
      font-size: 42px;
      font-weight: 800;
      color: #f1f5f9;
      margin: 8px 0 4px;
    }
    .order-id { font-size: 12px; color: #64748b; margin-bottom: 8px; }
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-paid { background: rgba(34,197,94,0.15); color: #22c55e; }
    .status-pending { background: rgba(234,179,8,0.15); color: #eab308; }

    .pay-label {
      font-size: 13px;
      color: #94a3b8;
      margin-bottom: 14px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
    }
    .upi-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 8px;
    }
    .upi-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 10px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s;
      color: white;
    }
    .upi-btn:active { transform: scale(0.95); }
    .upi-btn .icon { font-size: 20px; }

    .btn-gpay {
      background: linear-gradient(135deg, #4285F4, #34A853);
      box-shadow: 0 4px 12px rgba(66,133,244,0.3);
    }
    .btn-phonepe {
      background: linear-gradient(135deg, #5f259f, #7B3FBF);
      box-shadow: 0 4px 12px rgba(95,37,159,0.3);
    }
    .btn-paytm {
      background: linear-gradient(135deg, #00BAF2, #0097CC);
      box-shadow: 0 4px 12px rgba(0,186,242,0.3);
    }
    .btn-mobikwik {
      background: linear-gradient(135deg, #E23744, #C62828);
      box-shadow: 0 4px 12px rgba(226,55,68,0.3);
    }

    .btn-other {
      display: block;
      width: 100%;
      padding: 12px;
      border: 1px solid #475569;
      border-radius: 12px;
      background: transparent;
      color: #94a3b8;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      text-align: center;
      margin-top: 10px;
      transition: background 0.15s;
    }
    .btn-other:hover { background: rgba(255,255,255,0.05); }

    .btn-receipt {
      display: block;
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      background: rgba(56,189,248,0.1);
      color: #38bdf8;
      border: 1px solid rgba(56,189,248,0.3);
      text-align: center;
      transition: background 0.15s;
    }
    .btn-receipt:hover { background: rgba(56,189,248,0.2); }

    .meta { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
    .footer { margin-top: 20px; font-size: 11px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Billu POS</div>
    <div class="store-name">${tx.tenant.name} — ${tx.outlet.name}${tx.outlet.city ? ', ' + tx.outlet.city : ''}</div>

    <div class="amount-label">Total Amount</div>
    <div class="amount">₹${amount}</div>
    <div class="order-id">Order #${tx.id.split('-')[0].toUpperCase()}</div>

    <span class="status-badge ${tx.paymentMethod === 'card' ? 'status-pending' : 'status-paid'}">
      ${tx.paymentMethod === 'card' ? '⏳ UPI Payment' : '✅ ' + tx.paymentMethod.toUpperCase()}
    </span>

    <div class="divider"></div>

    ${tx.paymentMethod === 'card' ? `
      <div class="pay-label">Choose Payment App</div>
      <div class="upi-grid">
        <a href="${gpayLink}" class="upi-btn btn-gpay">
          <span class="icon">🅖</span> GPay
        </a>
        <a href="${phonepeLink}" class="upi-btn btn-phonepe">
          <span class="icon">📱</span> PhonePe
        </a>
        <a href="${paytmLink}" class="upi-btn btn-paytm">
          <span class="icon">💰</span> Paytm
        </a>
        <a href="${mobikwikLink}" class="upi-btn btn-mobikwik">
          <span class="icon">Ⓜ</span> MobiKwik
        </a>
      </div>
      <a href="${genericUpi}" class="btn-other">Other UPI App</a>
      <div class="divider"></div>
    ` : ''}

    ${receiptUrl !== '#' ? `
      <a href="${receiptUrl}" target="_blank" class="btn-receipt">
        📄 Download Receipt PDF
      </a>
    ` : '<p style="color:#64748b;font-size:13px;">Receipt generating...</p>'}

    <div class="divider"></div>

    <div class="meta">
      <span>${new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <span>${new Date(tx.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
    </div>

    <div class="footer">Powered by Billu POS • Paperless Checkout</div>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('[Pay Page]', err);
    res.status(500).send('<h1>Something went wrong</h1>');
  }
});

module.exports = router;
