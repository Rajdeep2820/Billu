const prisma = require('../src/services/prisma');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function main() {
  console.log('🌱 Seeding database...');

  // Tenant
  const hash = await bcrypt.hash('password123', 10);
  const tenant = await prisma.tenant.upsert({
    where: { email: 'demo@billu.com' },
    update: {},
    create: { name: 'Billu Mart', email: 'demo@billu.com', password: hash },
  });
  console.log('✅ Tenant:', tenant.name);

  // Outlet 1 (Main Store)
  const outlet = await prisma.outlet.upsert({
    where: { id: 'outlet-seed-001' },
    update: {},
    create: { id: 'outlet-seed-001', tenantId: tenant.id, name: 'Main Store', city: 'Delhi', state: 'Delhi', address: '23 Chandni Chowk' },
  }).catch(async () => {
    const existing = await prisma.outlet.findFirst({ where: { tenantId: tenant.id } });
    return existing;
  });
  console.log('✅ Outlet 1:', outlet.name);

  // Outlet 2 (South Delhi Branch) — for multi-outlet demo
  const outlet2 = await prisma.outlet.upsert({
    where: { id: 'outlet-seed-002' },
    update: {},
    create: { id: 'outlet-seed-002', tenantId: tenant.id, name: 'South Delhi Branch', city: 'New Delhi', state: 'Delhi', address: '45 Saket Mall' },
  }).catch(async () => {
    const existing = await prisma.outlet.findFirst({ where: { tenantId: tenant.id, name: 'South Delhi Branch' } });
    return existing;
  });
  console.log('✅ Outlet 2:', outlet2?.name || 'Skipped');

  // Admin user
  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: 'demo@billu.com' } },
    update: {},
    create: {
      tenantId: tenant.id,
      outletId: outlet.id,
      name: 'Admin User',
      email: 'demo@billu.com',
      password: hash,
      role: 'admin',
    },
  });
  console.log('✅ Admin user: demo@billu.com / password123');

  // Cashier user for Outlet 2
  if (outlet2) {
    const cashierHash = await bcrypt.hash('cashier123', 10);
    await prisma.user.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: 'cashier@billu.com' } },
      update: {},
      create: {
        tenantId: tenant.id,
        outletId: outlet2.id,
        name: 'Cashier Delhi',
        email: 'cashier@billu.com',
        password: cashierHash,
        role: 'cashier',
      },
    });
    console.log('✅ Cashier user: cashier@billu.com / cashier123 (assigned to South Delhi Branch)');
  }

  // Products
  const products = [
    { sku: 'COKE500', name: 'Coca Cola 500ml', category: 'beverages', basePrice: 40, attributes: {} },
    { sku: 'CHIPS100', name: 'Lays Chips 100g', category: 'snacks', basePrice: 20, attributes: {} },
    { sku: 'BREAD400', name: 'Bread 400g', category: 'bakery', basePrice: 55, attributes: {} },
    { sku: 'MILK1L', name: 'Amul Milk 1L', category: 'dairy', basePrice: 65, attributes: {} },
    { sku: 'SOAP100', name: 'Dettol Soap 100g', category: 'personal care', basePrice: 45, attributes: {} },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { tenantId_sku: { tenantId: tenant.id, sku: p.sku } },
      update: {},
      create: { tenantId: tenant.id, ...p },
    });

    // Inventory for Outlet 1
    await prisma.inventory.upsert({
      where: { outletId_productId: { outletId: outlet.id, productId: product.id } },
      update: {},
      create: { tenantId: tenant.id, outletId: outlet.id, productId: product.id, quantity: 100 },
    });

    // Inventory for Outlet 2
    if (outlet2) {
      await prisma.inventory.upsert({
        where: { outletId_productId: { outletId: outlet2.id, productId: product.id } },
        update: {},
        create: { tenantId: tenant.id, outletId: outlet2.id, productId: product.id, quantity: 75 },
      });
    }
  }
  console.log('✅ 5 sample products with inventory for both outlets');

  // Sample transactions for both outlets
  const allProducts = await prisma.product.findMany({ where: { tenantId: tenant.id } });

  const sampleTransactions = [
    { outletId: outlet.id, items: [{ sku: 'COKE500', qty: 2 }, { sku: 'CHIPS100', qty: 3 }], method: 'cash' },
    { outletId: outlet.id, items: [{ sku: 'MILK1L', qty: 1 }, { sku: 'BREAD400', qty: 2 }], method: 'card' },
    { outletId: outlet.id, items: [{ sku: 'SOAP100', qty: 4 }], method: 'cash' },
  ];

  if (outlet2) {
    sampleTransactions.push(
      { outletId: outlet2.id, items: [{ sku: 'COKE500', qty: 5 }, { sku: 'MILK1L', qty: 2 }], method: 'cash' },
      { outletId: outlet2.id, items: [{ sku: 'BREAD400', qty: 3 }, { sku: 'CHIPS100', qty: 1 }], method: 'card' },
    );
  }

  const productMap = {};
  for (const p of allProducts) productMap[p.sku] = p;

  for (const txData of sampleTransactions) {
    const lineItems = txData.items.map(item => {
      const prod = productMap[item.sku];
      return {
        sku: item.sku,
        name: prod?.name || item.sku,
        qty: item.qty,
        unitPrice: parseFloat(prod?.basePrice || 0),
      };
    });

    const totalAmount = lineItems.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const iKey = uuidv4();

    // Check if we already seeded this (idempotent by count)
    const existingCount = await prisma.transaction.count({
      where: { tenantId: tenant.id, outletId: txData.outletId },
    });
    if (existingCount >= 3) continue; // Skip if already have enough

    const txn = await prisma.transaction.create({
      data: {
        tenantId: tenant.id,
        outletId: txData.outletId,
        totalAmount,
        paymentMethod: txData.method,
        lineItems,
        idempotencyKey: iKey,
      },
    });

    // Create TransactionItem rows
    for (const item of lineItems) {
      const prod = productMap[item.sku];
      await prisma.transactionItem.create({
        data: {
          transactionId: txn.id,
          tenantId: tenant.id,
          outletId: txData.outletId,
          productId: prod?.id || null,
          sku: item.sku,
          name: item.name,
          qty: item.qty,
          unitPrice: item.unitPrice,
          totalAmount: item.unitPrice * item.qty,
        },
      });
    }

    // Create InventoryMovement rows
    for (const item of lineItems) {
      const prod = productMap[item.sku];
      if (prod) {
        await prisma.inventoryMovement.create({
          data: {
            tenantId: tenant.id,
            outletId: txData.outletId,
            productId: prod.id,
            transactionId: txn.id,
            type: 'sale',
            quantity: item.qty,
          },
        });
      }
    }
  }
  console.log('✅ Sample transactions with TransactionItems and InventoryMovements');

  console.log('\n🎉 Seed complete!');
  console.log('   Admin: demo@billu.com / password123');
  console.log('   Cashier: cashier@billu.com / cashier123');
  console.log('   Two outlets ready for Combined Analytics demo');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
