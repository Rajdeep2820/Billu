const jwt = require('jsonwebtoken');
const prisma = require('../services/prisma');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, tenantId, outletId, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Validate that a given outletId belongs to the tenant and is active.
 * - Admin/manager can access any outlet in their tenant.
 * - Cashier can only access their own assigned outlet.
 *
 * @param {string} outletId - The outlet ID to validate
 * @param {object} user - req.user from JWT { tenantId, outletId, role }
 * @returns {{ valid: boolean, error?: string, outlet?: object }}
 */
async function validateOutletAccess(outletId, user) {
  if (!outletId) {
    return { valid: false, error: 'Outlet ID is required' };
  }

  // Non-admin/manager can only access their own assigned outlet
  if (user.role !== 'admin' && user.role !== 'manager') {
    if (outletId !== user.outletId) {
      return { valid: false, error: 'You do not have access to this outlet' };
    }
  }

  // Verify outlet belongs to tenant and is active
  const outlet = await prisma.outlet.findFirst({
    where: { id: outletId, tenantId: user.tenantId },
  });

  if (!outlet) {
    return { valid: false, error: 'Outlet not found or does not belong to your tenant' };
  }

  if (!outlet.isActive) {
    return { valid: false, error: 'This outlet is currently deactivated' };
  }

  return { valid: true, outlet };
}

/**
 * Express middleware version: extracts outletId from req.params.outletId
 * or req.body.outletId or req.query.outletId (in that priority) and validates it.
 * Sets req.validatedOutlet on success.
 */
function requireOutletAccess(source = 'params') {
  return async (req, res, next) => {
    let outletId;
    if (source === 'params') outletId = req.params.outletId;
    else if (source === 'body') outletId = req.body.outletId;
    else if (source === 'query') outletId = req.query.outletId;
    else outletId = req.params.outletId || req.body.outletId || req.query.outletId;

    // If no outletId provided, default to user's outlet (for cashier-level access)
    if (!outletId) outletId = req.user.outletId;

    const result = await validateOutletAccess(outletId, req.user);
    if (!result.valid) {
      return res.status(403).json({ error: result.error });
    }
    req.validatedOutlet = result.outlet;
    next();
  };
}

module.exports = { authMiddleware, requireRole, validateOutletAccess, requireOutletAccess };
