-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cashier',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outlets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "base_price" DECIMAL(12,2) NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "cashier_id" TEXT,
    "customer_id" TEXT,
    "customer_phone" TEXT,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'cash',
    "line_items" JSONB NOT NULL,
    "receipt_path" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_items" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "product_id" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "transaction_id" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_cost" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acquisition_events" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "outlet_id" TEXT,
    "source" TEXT NOT NULL,
    "campaign" TEXT,
    "customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acquisition_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_email_key" ON "tenants"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "outlets_tenant_id_is_active_idx" ON "outlets"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "inventory_tenant_id_outlet_id_idx" ON "inventory"("tenant_id", "outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_outlet_id_product_id_key" ON "inventory"("outlet_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_idempotency_key_key" ON "transactions"("idempotency_key");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_created_at_idx" ON "transactions"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "transactions_tenant_id_outlet_id_created_at_idx" ON "transactions"("tenant_id", "outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "transaction_items_tenant_id_outlet_id_created_at_idx" ON "transaction_items"("tenant_id", "outlet_id", "created_at");

-- CreateIndex
CREATE INDEX "transaction_items_tenant_id_product_id_idx" ON "transaction_items"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_movements_tenant_id_outlet_id_product_id_created__idx" ON "inventory_movements"("tenant_id", "outlet_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_tenant_id_phone_idx" ON "customers"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "acquisition_events_tenant_id_created_at_idx" ON "acquisition_events"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cashier_id_fkey" FOREIGN KEY ("cashier_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquisition_events" ADD CONSTRAINT "acquisition_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acquisition_events" ADD CONSTRAINT "acquisition_events_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

