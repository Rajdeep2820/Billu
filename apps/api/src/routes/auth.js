const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../services/prisma');

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });
}

// POST /api/auth/register  — register a new merchant (tenant)
router.post('/register', async (req, res, next) => {
  try {
    const { businessName, email, password } = req.body;
    if (!businessName || !email || !password) {
      return res.status(400).json({ error: 'businessName, email and password are required' });
    }

    const hashed = await bcrypt.hash(password, 10);

    // Create tenant + default outlet + admin user in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: businessName, email, password: hashed },
      });
      const outlet = await tx.outlet.create({
        data: { tenantId: tenant.id, name: 'Main Outlet', city: 'Head Office' },
      });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          outletId: outlet.id,
          name: businessName + ' Admin',
          email,
          password: hashed,
          role: 'admin',
        },
      });
      return { tenant, outlet, user };
    });

    const token = signToken({
      id: result.user.id,
      tenantId: result.tenant.id,
      outletId: result.outlet.id,
      role: 'admin',
      name: result.user.name,
    });

    res.status(201).json({ token, tenant: { id: result.tenant.id, name: result.tenant.name } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already registered' });
    next(err);
  }
});

// POST /api/auth/login  — works for both merchant owner and cashier/staff
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, outletId } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Try user table first (cashiers/managers), then tenant table (owner)
    let user = await prisma.user.findFirst({ where: { email } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({
      id: user.id,
      tenantId: user.tenantId,
      outletId: outletId || user.outletId,
      role: user.role,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        tenantId: user.tenantId,
        outletId: outletId || user.outletId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/staff  — admin creates a cashier/manager user
router.post('/staff', require('../middleware/auth').authMiddleware, require('../middleware/auth').requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, email, password, role, outletId } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        tenantId: req.user.tenantId,
        outletId: outletId || req.user.outletId,
        name,
        email,
        password: hashed,
        role: role || 'cashier',
      },
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already exists in this tenant' });
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
  res.json(req.user);
});

module.exports = router;
