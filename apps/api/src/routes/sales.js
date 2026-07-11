const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const prisma = require('../services/prisma');
const { authMiddleware, validateOutletAccess } = require('../middleware/auth');
const { atomicDecrement, getInventoryCache, setInventoryCache } = require('../services/redis');
const receiptWorker = require('../workers/receiptWorker');

router.use(authMiddleware);

// POST /api/sales  — create a transaction (POS checkout)
router.post('/', async (req, res, next) => {
  try {
    const { lineItems, paymentMethod, idempotencyKey, origin, outletId: requestedOutletId, customerPhone } = req.body;
    const { tenantId, outletId: userOutletId, id: cashierId, role } = req.user;

    if (!lineItems || !lineItems.length) {
      return res.status(400).json({ error: 'lineItems cannot be empty' });
    }

    // ── Resolve and validate outletId ──
    let outletId = userOutletId;
    if (requestedOutletId && (role === 'admin' || role === 'manager')) {
      outletId = requestedOutletId;
    }

    // Validate outlet belongs to tenant AND is active
    const outletCheck = await validateOutletAccess(outletId, req.user);
    if (!outletCheck.valid) {
      return res.status(403).json({ error: outletCheck.error });
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

    // Look up product IDs for TransactionItem linking
    const productMap = {};
    const products = await prisma.product.findMany({
      where: { tenantId, sku: { in: lineItems.map(i => i.sku.toUpperCase()) } },
      select: { id: true, sku: true },
    });
    for (const p of products) productMap[p.sku] = p.id;

    // ── DB transaction: Transaction + TransactionItems + InventoryMovements + Inventory decrements ──
    // All writes inside one atomic transaction — no fire-and-forget
    let transaction;
    try {
      transaction = await prisma.$transaction(async (tx) => {
        // 1. Auto-upsert Customer if customerPhone provided
        let customerId = null;
        if (customerPhone) {
          const customer = await tx.customer.upsert({
            where: {
              // Use findFirst-style since no unique constraint on phone alone
              // We'll search and create manually
              id: 'PLACEHOLDER', // will fail, use below
            },
            create: { tenantId, phone: customerPhone },
            update: {},
          }).catch(async () => {
            // No unique constraint on (tenantId, phone), so do manual find-or-create
            let existing = await tx.customer.findFirst({
              where: { tenantId, phone: customerPhone },
            });
            if (!existing) {
              existing = await tx.customer.create({
                data: { tenantId, phone: customerPhone },
              });
            }
            return existing;
          });
          customerId = customer?.id || null;
        }

        // 2. Create transaction
        const txn = await tx.transaction.create({
          data: {
            tenantId,
            outletId,
            cashierId,
            customerId,
            customerPhone: customerPhone || null,
            totalAmount,
            paymentMethod: paymentMethod || 'cash',
            lineItems,
            idempotencyKey: iKey,
          },
        });

        // 3. Create normalized TransactionItem rows
        const txItemsData = lineItems.map(item => {
          const itemTotal = parseFloat(item.unitPrice) * item.qty;
          return {
            transactionId: txn.id,
            tenantId,
            outletId,
            productId: productMap[item.sku.toUpperCase()] || null,
            sku: item.sku,
            name: item.name,
            qty: item.qty,
            unitPrice: parseFloat(item.unitPrice),
            discountAmount: parseFloat(item.discountAmount || 0),
            taxAmount: parseFloat(item.taxAmount || 0),
            totalAmount: itemTotal,
          };
        });
        await tx.transactionItem.createMany({ data: txItemsData });

        // 4. Decrement DB inventory (inside transaction, not fire-and-forget)
        for (const item of lineItems) {
          await tx.inventory.updateMany({
            where: {
              tenantId,
              outletId,
              product: { sku: item.sku },
            },
            data: { quantity: { decrement: item.qty } },
          });
        }

        // 5. Create InventoryMovement records (inside transaction)
        for (const item of lineItems) {
          const productId = productMap[item.sku.toUpperCase()];
          if (productId) {
            await tx.inventoryMovement.create({
              data: {
                tenantId,
                outletId,
                productId,
                transactionId: txn.id,
                type: 'sale',
                quantity: item.qty,
              },
            });
          }
        }

        return txn;
      });
    } catch (dbError) {
      // If DB transaction fails, Redis is now out of sync because we already decremented it.
      // Invalidate the cache for these SKUs so they are re-fetched from DB on next request.
      const { invalidateInventory } = require('../services/redis');
      for (const item of lineItems) {
        await invalidateInventory(tenantId, outletId, item.sku).catch(() => {});
      }
      throw dbError; // re-throw to be caught by outer try-catch
    }

    // Queue receipt generation
    await receiptWorker.receiptQueue.add(
      'generate-receipt',
      { transactionId: transaction.id, tenantId, outletId, origin },
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
    const { tenantId, role } = req.user;
    const where = { tenantId };

    // Non-admin/manager can only see their own outlet's sales
    if (role !== 'admin' && role !== 'manager') {
      where.outletId = req.user.outletId;
    } else if (outletId) {
      // Admin/manager can filter by outlet, but validate it belongs to tenant
      const check = await validateOutletAccess(outletId, req.user);
      if (!check.valid) {
        return res.status(403).json({ error: check.error });
      }
      where.outletId = outletId;
    }

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

    // Non-admin/manager can only see their own outlet's sales
    if (req.user.role !== 'admin' && req.user.role !== 'manager' && sale.outletId !== req.user.outletId) {
      return res.status(403).json({ error: 'You do not have access to this transaction' });
    }

    res.json(sale);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
