const prisma = require('../src/services/prisma');
const bcrypt = require('bcryptjs');

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

  // Outlet
  const outlet = await prisma.outlet.upsert({
    where: { id: 'outlet-seed-001' },
    update: {},
    create: { id: 'outlet-seed-001', tenantId: tenant.id, name: 'Main Store', city: 'Delhi' },
  }).catch(async () => {
    const existing = await prisma.outlet.findFirst({ where: { tenantId: tenant.id } });
    return existing;
  });
  console.log('✅ Outlet:', outlet.name);

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

    await prisma.inventory.upsert({
      where: { outletId_productId: { outletId: outlet.id, productId: product.id } },
      update: {},
      create: { tenantId: tenant.id, outletId: outlet.id, productId: product.id, quantity: 100 },
    });
  }
  console.log('✅ 5 sample products with inventory');

  console.log('\n🎉 Seed complete!');
  console.log('   Login: demo@billu.com / password123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
