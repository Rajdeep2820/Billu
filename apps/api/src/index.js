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

const app = express();
const httpServer = http.createServer(app);

const corsOptions = {
  origin: function (origin, callback) { callback(null, true); },
  credentials: true
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
