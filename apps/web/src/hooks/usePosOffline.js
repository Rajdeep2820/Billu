import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../api/client';

const CATALOG_KEY = 'billu_pos_catalog';
const QUEUE_KEY   = 'billu_offline_queue';
const CATALOG_TTL = 15 * 60 * 1000; // 15 minutes

// ─── helpers ────────────────────────────────────────────────────────────────

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
  catch { return []; }
}

function writeQueue(q) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

function readCatalog(outletId) {
  try {
    const raw = localStorage.getItem(`${CATALOG_KEY}:${outletId}`);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > CATALOG_TTL) return null; // stale
    return data;
  } catch { return null; }
}

function writeCatalog(outletId, data) {
  localStorage.setItem(
    `${CATALOG_KEY}:${outletId}`,
    JSON.stringify({ data, savedAt: Date.now() })
  );
}

// ─── hook ───────────────────────────────────────────────────────────────────

/**
 * usePosOffline
 *
 * Manages the offline-capable product catalog and sale queue for the POS.
 *
 * @param {string} outletId     — currently selected outlet
 * @param {object} user         — the authenticated user object
 *
 * @returns {object} {
 *   products,          — array of products for the grid (online or cached)
 *   isOnline,          — current connectivity status
 *   isSyncing,         — true while syncing pending sales
 *   pendingCount,      — number of sales waiting to sync
 *   checkoutWithFallback, — call this instead of api.post('/sales') directly
 *   refreshCatalog,    — manually force a catalog re-fetch
 * }
 */
export function usePosOffline({ outletId, user }) {
  const [products, setProducts]       = useState([]);
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [isSyncing, setIsSyncing]     = useState(false);
  const [pendingCount, setPendingCount] = useState(() => readQueue().length);
  const syncLockRef = useRef(false);

  // ── 1. Track online / offline status ──────────────────────────────────────
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── 2. Fetch / cache product catalog when outlet or connectivity changes ───
  const refreshCatalog = useCallback(async (silent = false) => {
    if (!outletId && !user?.outletId) return;
    const targetOutlet = outletId || user.outletId;

    if (navigator.onLine) {
      try {
        const res = await api.get(`/inventory?outletId=${targetOutlet}`);
        const mapped = res.data.map(inv => ({
          ...inv.product,
          stock: inv.quantity,
        }));
        writeCatalog(targetOutlet, mapped);
        setProducts(mapped);
        return;
      } catch {
        // fall through to cache
      }
    }

    // Offline or fetch failed — use cache
    const cached = readCatalog(targetOutlet);
    if (cached) {
      setProducts(cached);
    } else if (!silent) {
      setProducts([]);
    }
  }, [outletId, user?.outletId]);

  useEffect(() => {
    refreshCatalog();
  }, [refreshCatalog]);

  // ── 3. Sync queue when we come back online ────────────────────────────────
  const syncQueue = useCallback(async () => {
    if (syncLockRef.current) return; // prevent concurrent sync runs
    const queue = readQueue();
    if (!queue.length) return;

    syncLockRef.current = true;
    setIsSyncing(true);

    const remaining = [...queue];
    for (let i = 0; i < remaining.length; i++) {
      const sale = remaining[i];
      try {
        await api.post('/sales', sale);
        // Remove successfully synced sale from queue
        remaining.splice(i, 1);
        i--;
        writeQueue(remaining);
        setPendingCount(remaining.length);
      } catch (err) {
        // If it's a server-side error (not a network error), remove it to
        // avoid infinite retries (e.g., product was deleted since queuing).
        if (err.response && err.response.status !== 0) {
          console.error(`[Offline Sync] Dropping failed sale ${sale.idempotencyKey}:`, err.response?.data?.error);
          remaining.splice(i, 1);
          i--;
          writeQueue(remaining);
          setPendingCount(remaining.length);
        }
        // Network error — leave in queue and stop trying for now
        break;
      }
    }

    setIsSyncing(false);
    syncLockRef.current = false;

    // After sync, refresh the catalog so stock reflects synced sales
    if (remaining.length === 0) {
      refreshCatalog(true);
    }
  }, [refreshCatalog]);

  // Trigger sync whenever we go online
  useEffect(() => {
    if (isOnline) {
      syncQueue();
    }
  }, [isOnline, syncQueue]);

  // ── 4. Checkout with offline fallback ─────────────────────────────────────
  /**
   * checkoutWithFallback(payload)
   *
   * Tries POST /api/sales. On network failure, saves to local queue.
   *
   * Returns:
   *   { ok: true, queued: false, data }     — successful online sale
   *   { ok: true, queued: true }            — sale queued for later sync
   *   { ok: false, error: string }          — server-side error (e.g. no stock)
   */
  const checkoutWithFallback = useCallback(async (payload) => {
    // Always attach an idempotency key so backend deduplicates on sync
    const salePayload = {
      ...payload,
      idempotencyKey: crypto.randomUUID(),
    };

    try {
      const res = await api.post('/sales', salePayload);
      return { ok: true, queued: false, data: res.data };
    } catch (err) {
      // Network error (no response) — queue it
      if (!err.response) {
        const queue = readQueue();
        queue.push({ ...salePayload, queuedAt: new Date().toISOString() });
        writeQueue(queue);
        setPendingCount(queue.length);
        return { ok: true, queued: true };
      }
      // Server-side error (e.g., out of stock) — surface to UI
      return {
        ok: false,
        error: err.response?.data?.error || 'Checkout failed',
      };
    }
  }, []);

  return {
    products,
    isOnline,
    isSyncing,
    pendingCount,
    checkoutWithFallback,
    refreshCatalog,
  };
}
