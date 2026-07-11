const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../services/prisma');
const { OAuth2Client } = require('google-auth-library');

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

// POST /api/auth/google — sign in / sign up with Google
router.post('/google', async (req, res, next) => {
  try {
    const { credential, businessName } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential is required' });

    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(500).json({ error: 'Google OAuth not configured on server' });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Check if user exists
    let user = await prisma.user.findFirst({ where: { email } });

    if (user) {
      // Existing user — log in
      const token = signToken({
        id: user.id,
        tenantId: user.tenantId,
        outletId: user.outletId,
        role: user.role,
        name: user.name,
        picture,
      });
      return res.json({
        token,
        user: { id: user.id, name: user.name, role: user.role, tenantId: user.tenantId, outletId: user.outletId, picture },
        isNewUser: false,
      });
    }

    // New user — register (create tenant + outlet + user)
    const bName = businessName || name || 'My Business';
    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: bName, email, password: `google:${googleId}` },
      });
      const outlet = await tx.outlet.create({
        data: { tenantId: tenant.id, name: 'Main Outlet', city: 'Head Office' },
      });
      const newUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          outletId: outlet.id,
          name: name || bName + ' Admin',
          email,
          password: `google:${googleId}`,
          role: 'admin',
        },
      });
      return { tenant, outlet, user: newUser };
    });

    const token = signToken({
      id: result.user.id,
      tenantId: result.tenant.id,
      outletId: result.outlet.id,
      role: 'admin',
      name: result.user.name,
      picture,
    });

    res.status(201).json({
      token,
      user: { id: result.user.id, name: result.user.name, role: 'admin', tenantId: result.tenant.id, outletId: result.outlet.id, picture },
      tenant: { id: result.tenant.id, name: result.tenant.name },
      isNewUser: true,
    });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already registered' });
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Invalid Google credential' });
  }
});

// POST /api/auth/login  — works for both merchant owner and cashier/staff
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    // Try user table first (cashiers/managers), then tenant table (owner)
    let user = await prisma.user.findFirst({
      where: { email },
      include: { outlet: { select: { id: true, isActive: true } } },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Block login if the user's assigned outlet is deactivated (except admin who can access all)
    if (user.role !== 'admin' && user.outlet && !user.outlet.isActive) {
      return res.status(403).json({ error: 'Your assigned outlet is currently inactive. Contact your admin.' });
    }

    const token = signToken({
      id: user.id,
      tenantId: user.tenantId,
      outletId: user.outletId, // Always from DB, never from client
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
        outletId: user.outletId,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/staff  — admin/manager lists all staff
router.get('/staff', require('../middleware/auth').authMiddleware, require('../middleware/auth').requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user.tenantId },
      select: { id: true, name: true, email: true, role: true, createdAt: true, outlet: { select: { id: true, name: true, isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) { next(err); }
});

// POST /api/auth/staff  — admin creates a cashier/manager user
router.post('/staff', require('../middleware/auth').authMiddleware, require('../middleware/auth').requireRole('admin', 'manager'), async (req, res, next) => {
  try {
    const { name, email, password, role, outletId } = req.body;

    // Validate outletId belongs to this tenant
    const targetOutletId = outletId || req.user.outletId;
    if (targetOutletId) {
      const outlet = await prisma.outlet.findFirst({
        where: { id: targetOutletId, tenantId: req.user.tenantId },
      });
      if (!outlet) return res.status(400).json({ error: 'Outlet not found or does not belong to this tenant' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        tenantId: req.user.tenantId,
        outletId: targetOutletId,
        name,
        email,
        password: hashed,
        role: role || 'cashier',
      },
      include: { outlet: { select: { name: true } } },
    });
    res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role, outletId: user.outletId, outlet: user.outlet });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already exists in this tenant' });
    next(err);
  }
});

// PUT /api/auth/staff/:id  — admin updates a staff member's role or outlet
router.put('/staff/:id', require('../middleware/auth').authMiddleware, require('../middleware/auth').requireRole('admin'), async (req, res, next) => {
  try {
    const { role, outletId, name } = req.body;
    const targetId = req.params.id;

    // Prevent changing own role here
    if (targetId === req.user.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const existing = await prisma.user.findFirst({ where: { id: targetId, tenantId: req.user.tenantId } });
    if (!existing) return res.status(404).json({ error: 'User not found' });

    if (outletId) {
      const outlet = await prisma.outlet.findFirst({ where: { id: outletId, tenantId: req.user.tenantId } });
      if (!outlet) return res.status(400).json({ error: 'Outlet not found' });
    }

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        ...(role && { role }),
        ...(outletId && { outletId }),
        ...(name && { name }),
      },
      select: { id: true, name: true, email: true, role: true, outlet: { select: { id: true, name: true } } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// GET /api/auth/me — enriched user profile
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        tenant: { select: { id: true, name: true, email: true, plan: true, createdAt: true } },
        outlet: { select: { id: true, name: true, city: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      tenant: user.tenant,
      outlet: user.outlet,
      isGoogleUser: user.password.startsWith('google:'),
    });
  } catch (err) { next(err); }
});

// PUT /api/auth/me — update profile (name, email, store name)
router.put('/me', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const { name, storeName } = req.body;
    const updates = {};

    if (name) {
      await prisma.user.update({ where: { id: req.user.id }, data: { name } });
      updates.name = name;
    }
    if (storeName) {
      await prisma.tenant.update({ where: { id: req.user.tenantId }, data: { name: storeName } });
      updates.storeName = storeName;
    }

    res.json({ message: 'Profile updated', ...updates });
  } catch (err) { next(err); }
});

// PUT /api/auth/me/password — change password
router.put('/me/password', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // Google users don't have a real password
    if (!user.password.startsWith('google:')) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required' });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: req.user.id }, data: { password: hashed } });
    // Also update tenant password
    await prisma.tenant.update({ where: { id: req.user.tenantId }, data: { password: hashed } });

    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
});

// DELETE /api/auth/me — permanently delete account and all tenant data
router.delete('/me', require('../middleware/auth').authMiddleware, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;

    await prisma.$transaction(async (tx) => {
      // Order matters: delete child records first
      await tx.acquisitionEvent.deleteMany({ where: { tenantId } });
      await tx.inventoryMovement.deleteMany({ where: { tenantId } });
      await tx.transactionItem.deleteMany({ where: { tenantId } });
      await tx.transaction.deleteMany({ where: { tenantId } });
      await tx.inventory.deleteMany({ where: { tenantId } });
      await tx.customer.deleteMany({ where: { tenantId } });
      await tx.product.deleteMany({ where: { tenantId } });
      await tx.user.deleteMany({ where: { tenantId } });
      await tx.outlet.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) { next(err); }
});

module.exports = router;
