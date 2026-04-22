const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const prisma = require('../services/prisma');
const { authMiddleware } = require('../middleware/auth');
const { atomicDecrement, getInventoryCache, setInventoryCache } = require('../services/redis');
const receiptWorker = require('../workers/receiptWorker');

router.use(authMiddleware);

// POST /api/sales  — create a transaction (POS checkout)
router.post('/', async (req, res, next) => {
  try {
    const { lineItems, paymentMethod, idempotencyKey } = req.body;
    const { tenantId, outletId, id: cashierId } = req.user;

    if (!lineItems || !lineItems.length) {
      return res.status(400).json({ error: 'lineItems cannot be empty' });
    }

    // Generate idempotency key if not provided by client
    const iKey = idempotencyKey || uuidv4();

    // Check for duplicate submission
    const existing = await prisma.transaction.findUnique({
      where: { idempotencyKey: iKey },
    });
    if (existing) {
      return res.status(200).json({ transaction: existing, duplicate: true });
    }

    // Decrement inventory for each line item (atomic via Lua)
    const stockResults = [];
    for (const item of lineItems) {
      const { sku, qty } = item;

      // Try Redis first
      let result = await atomicDecrement(tenantId, outletId, sku, qty);

      if (result === -1) {
        // Cache miss — load from DB and try again
        const inv = await prisma.inventory.findFirst({
          where: { tenantId, outletId, product: { sku } },
          include: { product: { select: { sku: true } } },
        });
        if (!inv) return res.status(404).json({ error: `Product not found: ${sku}` });

        await setInventoryCache(tenantId, outletId, sku, inv.quantity);
        result = await atomicDecrement(tenantId, outletId, sku, qty);
      }

      if (result === -2) {
        return res.status(422).json({ error: `Insufficient stock for SKU: ${sku}` });
      }

      stockResults.push({ sku, newStock: result });
    }

    // Calculate total
    const totalAmount = lineItems.reduce((sum, item) => {
      return sum + parseFloat(item.unitPrice) * item.qty;
    }, 0);

    // Save transaction
    const transaction = await prisma.transaction.create({
      data: {
        tenantId,
        outletId,
        cashierId,
        totalAmount,
        paymentMethod: paymentMethod || 'cash',
        lineItems,
        idempotencyKey: iKey,
      },
    });

    // Update inventory in DB asynchronously (fire and forget)
    for (const item of lineItems) {
      prisma.inventory
        .updateMany({
          where: {
            tenantId,
            outletId,
            product: { sku: item.sku },
          },
          data: { quantity: { decrement: item.qty } },
        })
        .catch((err) => console.error('[DB] Inventory sync error:', err));
    }

    // Queue receipt generation
    await receiptWorker.receiptQueue.add(
      'generate-receipt',
      { transactionId: transaction.id, tenantId, outletId },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } }
    );

    // Emit real-time sale event to tenant dashboard
    req.io.to(`tenant:${tenantId}`).emit('sale:new', {
      outletId,
      transactionId: transaction.id,
      totalAmount,
      itemCount: lineItems.length,
      timestamp: transaction.createdAt,
    });

    res.status(201).json({ transaction, stockResults });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales?outletId=&startDate=&endDate=&page=1&limit=20
router.get('/', async (req, res, next) => {
  try {
    const { outletId, startDate, endDate, page = 1, limit = 20 } = req.query;
    const where = { tenantId: req.user.tenantId };

    if (outletId) where.outletId = outletId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        include: { outlet: { select: { name: true } } },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page) });
  } catch (err) {
    next(err);
  }
});

// GET /api/sales/:id
router.get('/:id', async (req, res, next) => {
  try {
    const sale = await prisma.transaction.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { outlet: true },
    });
    if (!sale) return res.status(404).json({ error: 'Transaction not found' });
    res.json(sale);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
