const jwt = require('jsonwebtoken');

function socketAuthMiddleware(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.data = {
      userId: payload.id,
      tenantId: payload.tenantId,
      outletId: payload.outletId,
      role: payload.role,
    };
    next();
  } catch {
    next(new Error('Invalid token'));
  }
}

module.exports = { socketAuthMiddleware };
