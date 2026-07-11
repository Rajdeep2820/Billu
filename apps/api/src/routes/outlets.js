const router = require('express').Router();
const prisma = require('../services/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/outlets — list all outlets for the tenant
router.get('/', async (req, res, next) => {
  try {
    const { tenantId, role, outletId } = req.user;

    // Admin sees all outlets; others see only their assigned outlet
    const where = { tenantId };
    if (role !== 'admin') {
      where.id = outletId;
    }

    const outlets = await prisma.outlet.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { users: true, transactions: true, inventory: true },
        },
      },
    });

    res.json(outlets);
  } catch (err) {
    next(err);
  }
});

// POST /api/outlets — create a new outlet (admin/manager only)
router.post('/', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, address, city, state, timezone } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Outlet name is required' });
    }

    const outlet = await prisma.outlet.create({
      data: {
        tenantId: req.user.tenantId,
        name,
        address: address || null,
        city: city || null,
        state: state || null,
        timezone: timezone || 'Asia/Kolkata',
      },
    });

    res.status(201).json(outlet);
  } catch (err) {
    next(err);
  }
});

// GET /api/outlets/:id — get a single outlet
router.get('/:id', async (req, res, next) => {
  try {
    const outlet = await prisma.outlet.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        _count: {
          select: { users: true, transactions: true, inventory: true },
        },
      },
    });

    if (!outlet) return res.status(404).json({ error: 'Outlet not found' });
    res.json(outlet);
  } catch (err) {
    next(err);
  }
});

// PUT /api/outlets/:id — update outlet details (admin/manager only)
router.put('/:id', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, address, city, state, timezone } = req.body;

    // Verify outlet belongs to tenant
    const existing = await prisma.outlet.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Outlet not found' });

    const updated = await prisma.outlet.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(timezone !== undefined && { timezone }),
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/outlets/:id — deactivate/reactivate outlet (admin only)
router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive (boolean) is required' });
    }

    // Verify outlet belongs to tenant
    const existing = await prisma.outlet.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
    });
    if (!existing) return res.status(404).json({ error: 'Outlet not found' });

    // Don't allow deactivating the last active outlet
    if (!isActive) {
      const activeCount = await prisma.outlet.count({
        where: { tenantId: req.user.tenantId, isActive: true },
      });
      if (activeCount <= 1) {
        return res.status(422).json({ error: 'Cannot deactivate your last active outlet' });
      }
    }

    const updated = await prisma.outlet.update({
      where: { id: req.params.id },
      data: { isActive },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
