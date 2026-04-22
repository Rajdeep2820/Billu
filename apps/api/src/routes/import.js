const router = require('express').Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const prisma = require('../services/prisma');
const { authMiddleware, requireRole } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(authMiddleware);
router.use(requireRole('admin', 'manager'));

// Known column aliases for auto-mapping
const FIELD_ALIASES = {
  sku:       ['sku', 'item_code', 'itemcode', 'code', 'barcode', 'product_code', 'id'],
  name:      ['name', 'product_name', 'item_name', 'title', 'description', 'product'],
  basePrice: ['price', 'base_price', 'baseprice', 'mrp', 'rate', 'unit_price', 'cost'],
  category:  ['category', 'cat', 'type', 'department', 'group'],
  quantity:  ['quantity', 'qty', 'stock', 'stock_qty', 'available', 'inventory'],
};

function detectMapping(headers) {
  const mapping = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const idx = lowerHeaders.findIndex((h) => aliases.includes(h));
    if (idx !== -1) mapping[field] = headers[idx]; // use original header
  }
  return mapping;
}

function parseFile(buffer, mimetype, originalname) {
  const ext = originalname.split('.').pop().toLowerCase();
  if (ext === 'csv') {
    return parse(buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
  }
  // Excel
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

// POST /api/import/preview  — upload file, return detected mapping + sample rows
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const rows = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'File is empty' });

    const headers = Object.keys(rows[0]);
    const detectedMapping = detectMapping(headers);

    res.json({
      headers,
      detectedMapping,
      sampleRows: rows.slice(0, 5),
      totalRows: rows.length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/import/commit  — import with confirmed mapping
router.post('/commit', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // mapping passed as JSON string in form field
    const mapping = JSON.parse(req.body.mapping || '{}');
    const outletId = req.body.outletId;
    const { tenantId } = req.user;

    const rows = parseFile(req.file.buffer, req.file.mimetype, req.file.originalname);
    const errors = [];
    let imported = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header row

      const sku = String(row[mapping.sku] || '').trim().toUpperCase();
      const name = String(row[mapping.name] || '').trim();
      const basePrice = parseFloat(row[mapping.basePrice]);
      const category = String(row[mapping.category] || 'general').trim().toLowerCase();
      const quantity = parseInt(row[mapping.quantity] || 0, 10);

      // Validation
      if (!sku) { errors.push({ row: rowNum, error: 'Missing SKU' }); continue; }
      if (!name) { errors.push({ row: rowNum, error: 'Missing name' }); continue; }
      if (isNaN(basePrice) || basePrice <= 0) { errors.push({ row: rowNum, error: 'Invalid price' }); continue; }

      try {
        const product = await prisma.product.upsert({
          where: { tenantId_sku: { tenantId, sku } },
          create: { tenantId, sku, name, category, basePrice },
          update: { name, category, basePrice },
        });

        // Update inventory if outletId given
        if (outletId && !isNaN(quantity)) {
          await prisma.inventory.upsert({
            where: { outletId_productId: { outletId, productId: product.id } },
            create: { tenantId, outletId, productId: product.id, quantity },
            update: { quantity },
          });
        }

        imported++;
      } catch (e) {
        errors.push({ row: rowNum, error: e.message });
      }
    }

    res.json({ imported, errors, total: rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
