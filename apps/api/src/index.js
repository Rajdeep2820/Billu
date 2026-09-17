require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { initRedis } = require('./services/redis');
const { initQueues } = require('./workers/receiptWorker');

// Routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const inventoryRoutes = require('./routes/inventory');
const salesRoutes = require('./routes/sales');
const dashboardRoutes = require('./routes/dashboard');
const importRoutes = require('./routes/import');
const payRoutes = require('./routes/pay');
const outletRoutes = require('./routes/outlets');
const analyticsRoutes = require('./routes/analytics');

const app = express();
const httpServer = http.createServer(app);

// ── CORS ───────────────────────────────────────────────────────────────────────
// Set ALLOWED_ORIGINS in your environment as a comma-separated list of URLs,
// e.g.  ALLOWED_ORIGINS=https://billu-pos.vercel.app,https://billu.yourdomain.com
//
// Localhost ports are always allowed for local development.
const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

const PROD_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = [...DEV_ORIGINS, ...PROD_ORIGINS];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow server-to-server requests (no origin header, e.g. curl / Postman)
    // and any explicitly whitelisted origin.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true,
};


// Socket.io setup
const io = new Server(httpServer, { cors: corsOptions });

// Middleware
app.use(cors(corsOptions));
app.use(express.json());


// Attach io to every request so routes can emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/import', importRoutes);
app.use('/api/outlets', outletRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/pay', payRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: new Date() }));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// Socket.io auth + room assignment
const { socketAuthMiddleware } = require('./middleware/socketAuth');
io.use(socketAuthMiddleware);
io.on('connection', (socket) => {
  const { tenantId, outletId } = socket.data;
  socket.join(`tenant:${tenantId}`);
  if (outletId) socket.join(`outlet:${outletId}`);
  console.log(`[WS] Connected: tenant=${tenantId} outlet=${outletId}`);

  socket.on('disconnect', () => {
    console.log(`[WS] Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 4000;

async function start() {
  await initRedis();
  initQueues(io);
  httpServer.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
  });
}

start();
