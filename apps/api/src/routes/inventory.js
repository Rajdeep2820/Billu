const router = require('express').Router();
const prisma = require('../services/prisma');
const { authMiddleware, requireRole, validateOutletAccess } = require('../middleware/auth');
const {
  getInventoryCache,
  setInventoryCache,
  invalidateInventory,
  atomicDecrement,
} = require('../services/redis');

router.use(authMiddleware);

// GET /api/inventory?outletId=
router.get('/', async (req, res, next) => {
  try {
    const { outletId } = req.query;
    const { tenantId, role } = req.user;

    // Non-admin/manager can only see their own outlet's inventory
    let filterOutletId = outletId;
    if (role !== 'admin' && role !== 'manager') {
      filterOutletId = req.user.outletId;
    }

    // If an outletId is provided, validate it belongs to the tenant
    if (filterOutletId) {
      const result = await validateOutletAccess(filterOutletId, req.user);
      if (!result.valid) {
        return res.status(403).json({ error: result.error });
      }
    }

    const filter = {
      tenantId,
      ...(filterOutletId && { outletId: filterOutletId }),
    };

    const items = await prisma.inventory.findMany({
      where: filter,
      include: { product: true, outlet: { select: { id: true, name: true } } },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

// PUT /api/inventory/:outletId/:productId  — adjust stock (admin/manager)
router.put('/:outletId/:productId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { outletId, productId } = req.params;
    const { quantity, mode } = req.body; // mode: 'set' | 'add' | 'subtract'
    const { tenantId } = req.user;

    // Validate outlet belongs to tenant and is active
    const outletResult = await validateOutletAccess(outletId, req.user);
    if (!outletResult.valid) {
      return res.status(403).json({ error: outletResult.error });
    }

    // Verify product belongs to tenant
    const product = await prisma.product.findFirst({
      where: { id: productId, tenantId },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const existing = await prisma.inventory.findUnique({
      where: { outletId_productId: { outletId, productId } },
    });

    let newQty;
    if (mode === 'add') {
      newQty = (existing?.quantity || 0) + quantity;
    } else if (mode === 'subtract') {
      newQty = Math.max(0, (existing?.quantity || 0) - quantity);
    } else {
      newQty = quantity; // set
    }

    const record = await prisma.inventory.upsert({
      where: { outletId_productId: { outletId, productId } },
      create: { tenantId, outletId, productId, quantity: newQty },
      update: { quantity: newQty },
    });

    // Sync cache
    await setInventoryCache(tenantId, outletId, product.sku, newQty);

    res.json(record);
  } catch (err) {
    next(err);
  }
});

// POST /api/inventory/warm/:outletId  — warm Redis cache for an outlet
router.post('/warm/:outletId', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { outletId } = req.params;
    const { tenantId } = req.user;

    // Validate outlet access
    const outletResult = await validateOutletAccess(outletId, req.user);
    if (!outletResult.valid) {
      return res.status(403).json({ error: outletResult.error });
    }

    const items = await prisma.inventory.findMany({
      where: { outletId, tenantId },
      include: { product: { select: { sku: true } } },
    });

    await Promise.all(
      items.map((item) =>
        setInventoryCache(tenantId, outletId, item.product.sku, item.quantity, 3600)
      )
    );

    res.json({ warmed: items.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
