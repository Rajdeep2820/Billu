const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Starting historical transaction normalization...');

  // 1. Fetch all transactions that don't have TransactionItems yet
  const transactions = await prisma.transaction.findMany({
    where: {
      items: {
        none: {} // only grab transactions without related items
      }
    },
    include: {
      outlet: true
    }
  });

  console.log(`Found ${transactions.length} transactions to normalize.`);

  if (transactions.length === 0) {
    console.log('Nothing to do. Exiting.');
    return;
  }

  // 2. Fetch all products to map SKUs to product IDs
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, tenantId: true }
  });

  // Create a fast lookup map: tenantId_sku -> productId
  const productMap = {};
  for (const p of products) {
    productMap[`${p.tenantId}_${p.sku.toUpperCase()}`] = p.id;
  }

  let totalItemsCreated = 0;

  // 3. Process transactions in batches
  for (let i = 0; i < transactions.length; i++) {
    const txn = transactions[i];
    
    // Safety check: skip if lineItems is missing or not an array
    if (!txn.lineItems || !Array.isArray(txn.lineItems)) {
      console.warn(`Skipping txn ${txn.id} — no lineItems found.`);
      continue;
    }

    const txItemsData = txn.lineItems.map(item => {
      // Lookup product ID if it exists
      const productId = productMap[`${txn.tenantId}_${(item.sku || '').toUpperCase()}`] || null;
      const qty = parseInt(item.qty, 10) || 1;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const discount = parseFloat(item.discountAmount) || 0;
      const tax = parseFloat(item.taxAmount) || 0;
      
      return {
        transactionId: txn.id,
        tenantId: txn.tenantId,
        outletId: txn.outletId,
        productId,
        sku: item.sku || 'UNKNOWN',
        name: item.name || 'Unknown Item',
        qty,
        unitPrice,
        discountAmount: discount,
        taxAmount: tax,
        totalAmount: (unitPrice * qty) - discount + tax,
      };
    });

    if (txItemsData.length > 0) {
      await prisma.transactionItem.createMany({
        data: txItemsData,
        skipDuplicates: true // Just in case
      });
      totalItemsCreated += txItemsData.length;
    }
    
    // Log progress every 100 txns
    if ((i + 1) % 100 === 0) {
      console.log(`Processed ${i + 1} / ${transactions.length} transactions...`);
    }
  }

  console.log(`\n✅ Normalization complete!`);
  console.log(`- Transactions processed: ${transactions.length}`);
  console.log(`- TransactionItems created: ${totalItemsCreated}`);
}

main()
  .catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
