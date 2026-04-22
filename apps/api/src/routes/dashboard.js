const router = require('express').Router();
const prisma = require('../services/prisma');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/dashboard/summary  — today's totals + outlet breakdown
router.get('/summary', async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [todaySales, todayCount, allOutlets, recentSales] = await Promise.all([
      // Total revenue today
      prisma.transaction.aggregate({
        where: { tenantId, createdAt: { gte: todayStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Count today
      prisma.transaction.count({
        where: { tenantId, createdAt: { gte: todayStart } },
      }),
      // Per-outlet today breakdown
      prisma.transaction.groupBy({
        by: ['outletId'],
        where: { tenantId, createdAt: { gte: todayStart } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // Recent 10 sales
      prisma.transaction.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { outlet: { select: { name: true } } },
      }),
    ]);

    // Attach outlet names to groupBy result
    const outlets = await prisma.outlet.findMany({ where: { tenantId } });
    const outletMap = Object.fromEntries(outlets.map((o) => [o.id, o.name]));

    const outletBreakdown = allOutlets.map((o) => ({
      outletId: o.outletId,
      outletName: outletMap[o.outletId] || 'Unknown',
      totalAmount: o._sum.totalAmount,
      transactionCount: o._count,
    }));

    res.json({
      today: {
        totalRevenue: todaySales._sum.totalAmount || 0,
        transactionCount: todayCount,
      },
      outletBreakdown,
      recentSales,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/sales-trend?days=7
router.get('/sales-trend', async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const sales = await prisma.transaction.findMany({
      where: { tenantId, createdAt: { gte: since } },
      select: { totalAmount: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date string
    const grouped = {};
    for (const s of sales) {
      const date = s.createdAt.toISOString().split('T')[0];
      if (!grouped[date]) grouped[date] = { date, revenue: 0, count: 0 };
      grouped[date].revenue += parseFloat(s.totalAmount);
      grouped[date].count += 1;
    }

    res.json(Object.values(grouped));
  } catch (err) {
    next(err);
  }
});

// GET /api/dashboard/top-products?limit=5
router.get('/top-products', async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const limit = parseInt(req.query.limit) || 5;

    const transactions = await prisma.transaction.findMany({
      where: { tenantId },
      select: { lineItems: true },
    });

    // Aggregate across all lineItems JSON arrays
    const productSales = {};
    for (const tx of transactions) {
      for (const item of tx.lineItems) {
        const key = item.sku;
        if (!productSales[key]) {
          productSales[key] = { sku: key, name: item.name, totalQty: 0, totalRevenue: 0 };
        }
        productSales[key].totalQty += item.qty;
        productSales[key].totalRevenue += parseFloat(item.unitPrice) * item.qty;
      }
    }

    const sorted = Object.values(productSales)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, limit);

    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
