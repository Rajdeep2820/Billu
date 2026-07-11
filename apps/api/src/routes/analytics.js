const router = require('express').Router();
const prisma = require('../services/prisma');
const { Prisma } = require('@prisma/client');
const { authMiddleware, requireRole } = require('../middleware/auth');

router.use(authMiddleware);

// ─── Multi-outlet guard middleware for combined analytics ───
async function requireMultiOutlet(req, res, next) {
  const count = await prisma.outlet.count({
    where: { tenantId: req.user.tenantId, isActive: true },
  });
  if (count <= 1) {
    return res.status(403).json({
      error: 'Combined dashboard requires more than one active outlet.',
      outletCount: count,
    });
  }
  req.activeOutletCount = count;
  next();
}

// ─── Helper: parse date range from query params ───
function dateRange(query) {
  const where = {};
  if (query.startDate || query.endDate) {
    where.createdAt = {};
    if (query.startDate) where.createdAt.gte = new Date(query.startDate);
    if (query.endDate) {
      const end = new Date(query.endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  return where;
}

// ─── Helper: build SQL date filter fragments using Prisma.sql ───
function sqlDateFilters(query) {
  const fragments = [];
  if (query.startDate) {
    fragments.push(Prisma.sql`AND created_at >= ${new Date(query.startDate)}`);
  }
  if (query.endDate) {
    const end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);
    fragments.push(Prisma.sql`AND created_at <= ${end}`);
  }
  return fragments.length > 0
    ? Prisma.sql`${Prisma.join(fragments, ' ')}`
    : Prisma.empty;
}

// ─── Helper: today start ───
function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ════════════════════════════════════════════════════════
//  COMBINED ANALYTICS (require > 1 outlet)
// ════════════════════════════════════════════════════════

// GET /api/analytics/combined/summary
router.get('/combined/summary', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const dateFilter = dateRange(req.query);
    const today = todayStart();

    const [todayAgg, totalAgg, outletBreakdown, recentSales, outlets] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, createdAt: { gte: today } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { tenantId, ...dateFilter },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ['outletId'],
        where: { tenantId, ...dateFilter },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.findMany({
        where: { tenantId, ...dateFilter },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { outlet: { select: { name: true } } },
      }),
      prisma.outlet.findMany({
        where: { tenantId },
        select: { id: true, name: true, isActive: true },
      }),
    ]);

    const outletMap = Object.fromEntries(outlets.map(o => [o.id, o.name]));
    const todayRevenue = parseFloat(todayAgg._sum.totalAmount || 0);
    const totalRevenue = parseFloat(totalAgg._sum.totalAmount || 0);
    const totalTxCount = totalAgg._count;
    const avgOrderValue = totalTxCount > 0 ? totalRevenue / totalTxCount : 0;

    res.json({
      today: {
        totalRevenue: todayRevenue,
        transactionCount: todayAgg._count,
      },
      period: {
        totalRevenue,
        transactionCount: totalTxCount,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      },
      outletBreakdown: outletBreakdown.map(o => ({
        outletId: o.outletId,
        outletName: outletMap[o.outletId] || 'Unknown',
        totalAmount: parseFloat(o._sum.totalAmount || 0),
        transactionCount: o._count,
      })),
      recentSales: recentSales.map(tx => ({
        id: tx.id,
        totalAmount: parseFloat(tx.totalAmount),
        paymentMethod: tx.paymentMethod,
        outletName: tx.outlet.name,
        createdAt: tx.createdAt,
        itemCount: Array.isArray(tx.lineItems) ? tx.lineItems.length : 0,
      })),
      activeOutlets: outlets.filter(o => o.isActive).length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/combined/realtime
router.get('/combined/realtime', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const today = todayStart();

    const [todayAgg, salesByOutlet, recent] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, createdAt: { gte: today } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ['outletId'],
        where: { tenantId, createdAt: { gte: today } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.findMany({
        where: { tenantId, createdAt: { gte: today } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { outlet: { select: { name: true } } },
      }),
    ]);

    const outlets = await prisma.outlet.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const outletMap = Object.fromEntries(outlets.map(o => [o.id, o.name]));

    res.json({
      todayRevenue: parseFloat(todayAgg._sum.totalAmount || 0),
      todayTransactions: todayAgg._count,
      salesByOutlet: salesByOutlet.map(o => ({
        outletId: o.outletId,
        outletName: outletMap[o.outletId] || 'Unknown',
        revenue: parseFloat(o._sum.totalAmount || 0),
        count: o._count,
      })),
      recentTransactions: recent.map(tx => ({
        id: tx.id,
        totalAmount: parseFloat(tx.totalAmount),
        outletName: tx.outlet.name,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/combined/inventory
router.get('/combined/inventory', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const dateFilter = dateRange(req.query);

    // Top selling products (from TransactionItem) — fast movers — with date filter
    const fastMoving = await prisma.transactionItem.groupBy({
      by: ['sku', 'name'],
      where: { tenantId, ...dateFilter },
      _sum: { qty: true, totalAmount: true },
      orderBy: { _sum: { qty: 'desc' } },
      take: 10,
    });

    // Low stock items across all outlets
    const lowStock = await prisma.inventory.findMany({
      where: { tenantId, quantity: { lt: 10 } },
      include: {
        product: { select: { sku: true, name: true } },
        outlet: { select: { id: true, name: true } },
      },
      orderBy: { quantity: 'asc' },
      take: 20,
    });

    // Stock by outlet
    const stockByOutlet = await prisma.inventory.groupBy({
      by: ['outletId'],
      where: { tenantId },
      _sum: { quantity: true },
      _count: true,
    });

    const outlets = await prisma.outlet.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const outletMap = Object.fromEntries(outlets.map(o => [o.id, o.name]));

    // Slow-moving: products with inventory but very few sales in the date range
    const allProducts = await prisma.product.findMany({
      where: { tenantId },
      select: { id: true, sku: true, name: true },
    });

    const salesBySku = {};
    for (const fm of fastMoving) {
      salesBySku[fm.sku] = fm._sum.qty || 0;
    }

    const slowMoving = allProducts
      .filter(p => !salesBySku[p.sku] || salesBySku[p.sku] < 3)
      .slice(0, 10)
      .map(p => ({ sku: p.sku, name: p.name, totalSold: salesBySku[p.sku] || 0 }));

    res.json({
      fastMoving: fastMoving.map(p => ({
        sku: p.sku,
        name: p.name,
        totalQtySold: p._sum.qty || 0,
        totalRevenue: parseFloat(p._sum.totalAmount || 0),
      })),
      slowMoving,
      lowStock: lowStock.map(inv => ({
        sku: inv.product.sku,
        name: inv.product.name,
        quantity: inv.quantity,
        outletId: inv.outlet.id,
        outletName: inv.outlet.name,
      })),
      stockByOutlet: stockByOutlet.map(s => ({
        outletId: s.outletId,
        outletName: outletMap[s.outletId] || 'Unknown',
        totalStock: s._sum.quantity || 0,
        productCount: s._count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/combined/customers
router.get('/combined/customers', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const dateFilter = dateRange(req.query);

    // Average basket size (items per transaction)
    const txItems = await prisma.transactionItem.groupBy({
      by: ['transactionId'],
      where: { tenantId, ...dateFilter },
      _sum: { qty: true },
    });

    const totalBaskets = txItems.length;
    const totalItems = txItems.reduce((s, t) => s + (t._sum.qty || 0), 0);
    const avgBasketSize = totalBaskets > 0 ? Math.round((totalItems / totalBaskets) * 100) / 100 : 0;

    // Average order value
    const aovAgg = await prisma.transaction.aggregate({
      where: { tenantId, ...dateFilter },
      _avg: { totalAmount: true },
      _count: true,
    });

    // Customer-related metrics (limited if no customer data)
    const customerCount = await prisma.customer.count({ where: { tenantId } });
    const txWithCustomer = await prisma.transaction.count({
      where: { tenantId, customerId: { not: null }, ...dateFilter },
    });

    let topCustomers = [];
    let repeatCustomers = 0;

    if (customerCount > 0) {
      const topCustAgg = await prisma.transaction.groupBy({
        by: ['customerId'],
        where: { tenantId, customerId: { not: null }, ...dateFilter },
        _sum: { totalAmount: true },
        _count: true,
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 10,
      });

      const customerIds = topCustAgg.map(c => c.customerId).filter(Boolean);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds } },
        select: { id: true, name: true, phone: true },
      });
      const custMap = Object.fromEntries(customers.map(c => [c.id, c]));

      topCustomers = topCustAgg.map(c => ({
        customerId: c.customerId,
        name: custMap[c.customerId]?.name || 'Unknown',
        phone: custMap[c.customerId]?.phone || null,
        totalSpent: parseFloat(c._sum.totalAmount || 0),
        transactionCount: c._count,
      }));

      repeatCustomers = topCustAgg.filter(c => c._count > 1).length;
    }

    res.json({
      avgBasketSize,
      avgOrderValue: parseFloat(aovAgg._avg.totalAmount || 0),
      totalTransactions: aovAgg._count,
      customerDataAvailable: customerCount > 0,
      totalCustomers: customerCount,
      transactionsWithCustomer: txWithCustomer,
      repeatCustomers,
      topCustomers,
      _note: customerCount === 0
        ? 'Customer tracking is not yet active. Metrics are transaction-based only.'
        : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/combined/traffic
router.get('/combined/traffic', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const dateFilter = dateRange(req.query);

    const events = await prisma.acquisitionEvent.groupBy({
      by: ['source'],
      where: { tenantId, ...dateFilter },
      _count: true,
      orderBy: { _count: { source: 'desc' } },
    });

    const totalEvents = events.reduce((s, e) => s + e._count, 0);

    // Transaction count by hour of day (traffic pattern proxy)
    // Uses proper Prisma.sql composition
    const dateFrag = sqlDateFilters(req.query);
    let hourlyAgg = [];
    try {
      hourlyAgg = await prisma.$queryRaw`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
        FROM transactions
        WHERE tenant_id = ${tenantId}
        ${dateFrag}
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `;
    } catch {
      hourlyAgg = [];
    }

    res.json({
      acquisitionSources: events.map(e => ({
        source: e.source,
        count: e._count,
        percentage: totalEvents > 0 ? Math.round((e._count / totalEvents) * 100) : 0,
      })),
      totalAcquisitionEvents: totalEvents,
      hourlyTraffic: Array.isArray(hourlyAgg) ? hourlyAgg : [],
      _note: totalEvents === 0
        ? 'No acquisition events recorded yet. Traffic data will appear once acquisition tracking is active.'
        : undefined,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/analytics/combined/financials
router.get('/combined/financials', requireMultiOutlet, async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const dateFilter = dateRange(req.query);

    // Gross sales, discount, tax from TransactionItem
    const financialAgg = await prisma.transactionItem.aggregate({
      where: { tenantId, ...dateFilter },
      _sum: {
        totalAmount: true,
        discountAmount: true,
        taxAmount: true,
      },
    });

    const grossSales = parseFloat(financialAgg._sum.totalAmount || 0);
    const totalDiscounts = parseFloat(financialAgg._sum.discountAmount || 0);
    const totalTaxes = parseFloat(financialAgg._sum.taxAmount || 0);
    const netSales = grossSales - totalDiscounts;

    // Payment method breakdown
    const paymentBreakdown = await prisma.transaction.groupBy({
      by: ['paymentMethod'],
      where: { tenantId, ...dateFilter },
      _sum: { totalAmount: true },
      _count: true,
    });

    // Outlet-wise revenue
    const outletRevenue = await prisma.transaction.groupBy({
      by: ['outletId'],
      where: { tenantId, ...dateFilter },
      _sum: { totalAmount: true },
      _count: true,
    });

    const outlets = await prisma.outlet.findMany({
      where: { tenantId },
      select: { id: true, name: true },
    });
    const outletMap = Object.fromEntries(outlets.map(o => [o.id, o.name]));

    // Daily/weekly/monthly trend — with proper Prisma.sql for date filters
    let trend = [];
    const groupBy = req.query.groupBy || 'day';
    const dateFrag = sqlDateFilters(req.query);

    try {
      if (groupBy === 'day') {
        trend = await prisma.$queryRaw`
          SELECT DATE(created_at) AS date, SUM(total_amount)::float AS revenue, COUNT(*)::int AS transactions
          FROM transactions
          WHERE tenant_id = ${tenantId}
          ${dateFrag}
          GROUP BY DATE(created_at)
          ORDER BY date DESC
          LIMIT 30
        `;
      } else if (groupBy === 'week') {
        trend = await prisma.$queryRaw`
          SELECT DATE_TRUNC('week', created_at)::date AS date, SUM(total_amount)::float AS revenue, COUNT(*)::int AS transactions
          FROM transactions
          WHERE tenant_id = ${tenantId}
          ${dateFrag}
          GROUP BY DATE_TRUNC('week', created_at)
          ORDER BY date DESC
          LIMIT 12
        `;
      } else if (groupBy === 'month') {
        trend = await prisma.$queryRaw`
          SELECT DATE_TRUNC('month', created_at)::date AS date, SUM(total_amount)::float AS revenue, COUNT(*)::int AS transactions
          FROM transactions
          WHERE tenant_id = ${tenantId}
          ${dateFrag}
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY date DESC
          LIMIT 12
        `;
      }
    } catch (e) {
      trend = [];
    }

    res.json({
      grossSales,
      totalDiscounts,
      totalTaxes,
      netSales,
      paymentBreakdown: paymentBreakdown.map(p => ({
        method: p.paymentMethod,
        amount: parseFloat(p._sum.totalAmount || 0),
        count: p._count,
      })),
      outletRevenue: outletRevenue.map(o => ({
        outletId: o.outletId,
        outletName: outletMap[o.outletId] || 'Unknown',
        revenue: parseFloat(o._sum.totalAmount || 0),
        transactions: o._count,
      })),
      trend: Array.isArray(trend) ? trend : [],
      _notes: {
        discounts: totalDiscounts === 0 ? 'No discounts applied yet — discount tracking is on TransactionItem level' : undefined,
        taxes: totalTaxes === 0 ? 'No taxes recorded yet — tax configuration not active' : undefined,
        refunds: 'Refund tracking not yet implemented',
      },
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════
//  PER-OUTLET ANALYTICS (no multi-outlet guard)
// ════════════════════════════════════════════════════════

// GET /api/analytics/outlets/:outletId/summary
router.get('/outlets/:outletId/summary', async (req, res, next) => {
  try {
    const { tenantId } = req.user;
    const { outletId } = req.params;
    const dateFilter = dateRange(req.query);

    // Validate outlet belongs to tenant
    const outlet = await prisma.outlet.findFirst({
      where: { id: outletId, tenantId },
    });
    if (!outlet) return res.status(404).json({ error: 'Outlet not found' });

    const today = todayStart();

    const [todayAgg, periodAgg, recentSales] = await Promise.all([
      prisma.transaction.aggregate({
        where: { tenantId, outletId, createdAt: { gte: today } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.aggregate({
        where: { tenantId, outletId, ...dateFilter },
        _sum: { totalAmount: true },
        _count: true,
      }),
      prisma.transaction.findMany({
        where: { tenantId, outletId, ...dateFilter },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { outlet: { select: { name: true } } },
      }),
    ]);

    const periodRevenue = parseFloat(periodAgg._sum.totalAmount || 0);

    res.json({
      outlet: { id: outlet.id, name: outlet.name, city: outlet.city },
      today: {
        totalRevenue: parseFloat(todayAgg._sum.totalAmount || 0),
        transactionCount: todayAgg._count,
      },
      period: {
        totalRevenue: periodRevenue,
        transactionCount: periodAgg._count,
        avgOrderValue: periodAgg._count > 0 ? Math.round((periodRevenue / periodAgg._count) * 100) / 100 : 0,
      },
      recentSales: recentSales.map(tx => ({
        id: tx.id,
        totalAmount: parseFloat(tx.totalAmount),
        paymentMethod: tx.paymentMethod,
        createdAt: tx.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ════════════════════════════════════════════════════════
//  ACQUISITION EVENTS (ingestion endpoint — Fix #8)
// ════════════════════════════════════════════════════════

// POST /api/analytics/acquisition — create an acquisition event
router.post('/acquisition', async (req, res, next) => {
  try {
    const { source, campaign, outletId, customerId } = req.body;
    const { tenantId } = req.user;

    if (!source) {
      return res.status(400).json({ error: 'source is required (walk_in, referral, google, instagram, website, campaign, unknown)' });
    }

    const validSources = ['walk_in', 'referral', 'google', 'instagram', 'website', 'campaign', 'unknown'];
    if (!validSources.includes(source)) {
      return res.status(400).json({ error: `Invalid source. Must be one of: ${validSources.join(', ')}` });
    }

    // Validate outletId if provided
    if (outletId) {
      const outlet = await prisma.outlet.findFirst({
        where: { id: outletId, tenantId },
      });
      if (!outlet) return res.status(400).json({ error: 'Outlet not found' });
    }

    const event = await prisma.acquisitionEvent.create({
      data: {
        tenantId,
        outletId: outletId || null,
        source,
        campaign: campaign || null,
        customerId: customerId || null,
      },
    });

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /api/analytics/acquisition/batch — create multiple acquisition events
router.post('/acquisition/batch', requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { events } = req.body;
    const { tenantId } = req.user;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    const data = events.map(e => ({
      tenantId,
      outletId: e.outletId || null,
      source: e.source || 'unknown',
      campaign: e.campaign || null,
      customerId: e.customerId || null,
    }));

    const result = await prisma.acquisitionEvent.createMany({ data });
    res.status(201).json({ created: result.count });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
