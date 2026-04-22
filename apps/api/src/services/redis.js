const Redis = require('ioredis');

let redis;

async function initRedis() {
  redis = new Redis(process.env.REDIS_URL);
  redis.on('connect', () => console.log('[Redis] Connected'));
  redis.on('error', (err) => console.error('[Redis] Error:', err.message));
}

function getRedis() {
  if (!redis) throw new Error('Redis not initialized');
  return redis;
}

// Inventory key helper
const invKey = (tenantId, outletId, sku) =>
  `inventory:${tenantId}:${outletId}:${sku}`;

// Product cache key helper
const prodKey = (tenantId, sku) => `product:${tenantId}:${sku}`;

// Atomic decrement — returns new quantity, -1 (miss), or -2 (insufficient)
const LUA_DECR = `
  local key = KEYS[1]
  local qty = tonumber(ARGV[1])
  local cur = tonumber(redis.call('GET', key))
  if cur == nil then return -1 end
  if cur < qty then return -2 end
  return redis.call('DECRBY', key, qty)
`;

async function atomicDecrement(tenantId, outletId, sku, qty) {
  const key = invKey(tenantId, outletId, sku);
  const result = await redis.eval(LUA_DECR, 1, key, qty);
  return result; // >=0 = new stock, -1 = miss, -2 = insufficient
}

async function setInventoryCache(tenantId, outletId, sku, qty, ttl = 3600) {
  await redis.setex(invKey(tenantId, outletId, sku), ttl, qty);
}

async function getInventoryCache(tenantId, outletId, sku) {
  const val = await redis.get(invKey(tenantId, outletId, sku));
  return val === null ? null : parseInt(val, 10);
}

async function invalidateInventory(tenantId, outletId, sku) {
  await redis.del(invKey(tenantId, outletId, sku));
}

async function setProductCache(tenantId, sku, data, ttl = 3600) {
  await redis.setex(prodKey(tenantId, sku), ttl, JSON.stringify(data));
}

async function getProductCache(tenantId, sku) {
  const val = await redis.get(prodKey(tenantId, sku));
  return val ? JSON.parse(val) : null;
}

async function invalidateProduct(tenantId, sku) {
  await redis.del(prodKey(tenantId, sku));
}

module.exports = {
  initRedis,
  getRedis,
  atomicDecrement,
  setInventoryCache,
  getInventoryCache,
  invalidateInventory,
  setProductCache,
  getProductCache,
  invalidateProduct,
};
