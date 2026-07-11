const router = require('express').Router();
const prisma = require('../services/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { setProductCache, getProductCache, invalidateProduct } = require('../services/redis');

// All product routes require auth
router.use(authMiddleware);

// GET /api/products?search=&category=&page=1&limit=20
router.get('/', async (req, res, next) => {
  try {
    const { search, category, page = 1, limit = 20 } = req.query;
    const where = { tenantId: req.user.tenantId };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/products/barcode/:sku  — fast lookup (cache-aside)
router.get('/barcode/:sku', async (req, res, next) => {
  try {
    const { sku } = req.params;
    const { outletId: queryOutletId } = req.query;
    const { tenantId, outletId: userOutletId, role } = req.user;

    let targetOutletId = userOutletId;
    if ((role === 'admin' || role === 'manager') && queryOutletId) {
      targetOutletId = queryOutletId;
    }

    // 1. Check Redis cache
    // Caching stock by tenantId:sku is flawed in multi-outlet, so we skip cache for barcode scan 
    // or we'd need to cache by tenantId:outletId:sku. For now, we'll fetch from DB directly 
    // to ensure stock accuracy for the specific outlet.

    // 2. DB fetch
    const product = await prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku } },
      include: {
        inventory: {
          where: { outletId: targetOutletId },
          select: { quantity: true },
        },
      },
    });

    if (!product) return res.status(404).json({ error: 'Product not found' });

    const data = {
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      basePrice: product.basePrice,
      attributes: product.attributes,
      stock: product.inventory[0]?.quantity ?? 0,
    };

    res.json({ ...data, fromCache: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/products
router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { sku, name, category, basePrice, attributes } = req.body;
    if (!sku || !name || !basePrice) {
      return res.status(400).json({ error: 'sku, name, and basePrice are required' });
    }

    const product = await prisma.product.create({
      data: {
        tenantId: req.user.tenantId,
        sku: sku.toUpperCase(),
        name,
        category: category || 'general',
        basePrice,
        attributes: attributes || {},
      },
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'SKU already exists' });
    next(err);
  }
});

// PUT /api/products/:id
router.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, category, basePrice, attributes } = req.body;

    const existing = await prisma.product.findFirst({
      where: { id, tenantId: req.user.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const updated = await prisma.product.update({
      where: { id },
      data: { name, category, basePrice, attributes },
    });

    // Invalidate cache
    await invalidateProduct(req.user.tenantId, existing.sku);

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/products/:id
router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    // Delete child records first (FK constraints), then product
    await prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.deleteMany({ where: { productId: req.params.id } });
      // TransactionItem uses onDelete: SetNull, so no need to delete — just nullify
      await tx.transactionItem.updateMany({
        where: { productId: req.params.id },
        data: { productId: null },
      });
      await tx.inventory.deleteMany({ where: { productId: req.params.id } });
      await tx.product.delete({ where: { id: req.params.id } });
    });
    await invalidateProduct(req.user.tenantId, existing.sku);

    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
