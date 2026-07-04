# Multi-Tenant Cloud-Native POS & Analytics Platform
### Lead Systems Architecture Design Document

---

## Table of Contents

1. [High-Level Architecture Overview](#1-high-level-architecture-overview)
2. [Hybrid Data Modeling — PostgreSQL + JSONB](#2-hybrid-data-modeling)
3. [High-Velocity Inventory Layer — Redis](#3-redis-inventory-layer)
4. [Real-Time Event Streaming](#4-real-time-event-streaming)
5. [Digital Transaction Lifecycle](#5-digital-transaction-lifecycle)
6. [Cloud Infrastructure — AWS + Terraform](#6-cloud-infrastructure)
7. [Security & Multi-Tenancy — Zero-Trust](#7-security--multi-tenancy)
8. [Performance Engineering](#8-performance-engineering)
9. [Failure Scenarios & Mitigations](#9-failure-scenarios--mitigations)
10. [Scalability Roadmap](#10-scalability-roadmap)

---

## 1. High-Level Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              PUBLIC INTERNET                                 │
└────────────────────────────────┬─────────────────────────────────────────────┘
                                 │  HTTPS (443)
                    ┌────────────▼─────────────┐
                    │    AWS Route 53 + ACM     │  DNS + TLS Certificates
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   Application Load       │  ALB (Multi-AZ)
                    │   Balancer (ALB)         │  ← SSL Termination
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
   ┌──────────▼──────┐  ┌────────▼──────┐  ┌───────▼────────┐
   │  Nginx Reverse  │  │  API Gateway  │  │  WebSocket /   │
   │  Proxy (Docker) │  │  (REST/gRPC)  │  │  Socket.io GW  │
   └──────────┬──────┘  └────────┬──────┘  └───────┬────────┘
              │                  │                  │
   ┌──────────▼──────────────────▼──────────────────▼────────┐
   │                    ECS / EKS Cluster                     │
   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
   │   │  POS     │  │ Inventory│  │Analytics │  │Receipt │ │
   │   │  Service │  │  Service │  │  Service │  │ Worker │ │
   │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘ │
   └────────┼─────────────┼─────────────┼─────────────┼──────┘
            │             │             │             │
   ┌────────▼─────┐  ┌────▼──────┐  ┌──▼──────┐  ┌──▼──────┐
   │  ElastiCache │  │    RDS    │  │Redshift/│  │   SQS   │
   │  (Redis)     │  │ PostgreSQL│  │ Athena  │  │  Queue  │
   │  Private SN  │  │ Private SN│  │ OLAP    │  │         │
   └──────────────┘  └───────────┘  └─────────┘  └────┬────┘
                                                       │
                                                  ┌────▼────┐
                                                  │   S3    │
                                                  │Receipts │
                                                  └─────────┘
```

### Tenant Isolation Model

```
Merchant A (Tenant 001)          Merchant B (Tenant 002)
┌─────────────────────┐          ┌─────────────────────┐
│  Outlet 1 │ Outlet 2│          │  Outlet 1 │ Outlet 2 │
│     ↓           ↓   │          │     ↓           ↓    │
│  JWT: {tenant:001}  │          │  JWT: {tenant:002}   │
└─────────────────────┘          └─────────────────────┘
          ↓                                ↓
   ┌──────────────────────────────────────────┐
   │     Shared PostgreSQL (RLS Enforced)     │
   │  SELECT * WHERE tenant_id = current_tid  │
   └──────────────────────────────────────────┘
```

---

## 2. Hybrid Data Modeling

### 2.1 Schema Design — Core Tables

```sql
-- Tenant registry
CREATE TABLE tenants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    plan        TEXT DEFAULT 'starter',
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- Outlets per merchant
CREATE TABLE outlets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id),
    name        TEXT NOT NULL,
    location    JSONB,                    -- { city, lat, lng, address }
    timezone    TEXT DEFAULT 'Asia/Kolkata'
);

-- Flexible product catalog
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    sku             TEXT NOT NULL,
    name            TEXT NOT NULL,
    category        TEXT NOT NULL,        -- pharma | fashion | grocery
    base_price      NUMERIC(12,2),
    attributes      JSONB NOT NULL DEFAULT '{}',
    -- Pharma:  { "expiry_date": "2025-12", "batch": "B12", "schedule": "H" }
    -- Fashion: { "variants": [{"color":"red","size":"M","stock":5}] }
    -- Grocery: { "weight_unit": "kg", "origin": "Punjab" }
    fts_vector      tsvector GENERATED ALWAYS AS (
                        to_tsvector('english', name || ' ' || sku)
                    ) STORED,
    UNIQUE (tenant_id, sku)
);

-- Inventory per outlet
CREATE TABLE inventory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    outlet_id   UUID NOT NULL REFERENCES outlets(id),
    product_id  UUID NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (outlet_id, product_id)
);

-- Transactions (immutable ledger)
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    outlet_id       UUID NOT NULL,
    cashier_id      UUID,
    total_amount    NUMERIC(12,2) NOT NULL,
    payment_method  TEXT,
    line_items      JSONB NOT NULL,
    -- [{ product_id, sku, name, qty, unit_price, discount }]
    receipt_s3_key  TEXT,
    idempotency_key TEXT UNIQUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);
```

### 2.2 JSONB Indexing Strategy

```sql
-- ─────────────────────────────────────────────
-- GIN: For containment queries (@>, ??, jsonb_path_ops)
-- Use when: filtering by arbitrary keys, partial JSONB matches
-- ─────────────────────────────────────────────

-- Full JSONB GIN index (catch-all for containment queries)
CREATE INDEX idx_products_attrs_gin
  ON products USING GIN (attributes jsonb_path_ops);
-- Query: WHERE attributes @> '{"schedule": "H"}'

-- ─────────────────────────────────────────────
-- BTREE on extracted scalar: For range queries on known paths
-- Use when: equality/range on a specific JSONB key
-- ─────────────────────────────────────────────

-- Pharma: expiry date range queries
CREATE INDEX idx_products_expiry
  ON products ((attributes->>'expiry_date'))
  WHERE category = 'pharma';
-- Query: WHERE category='pharma' AND attributes->>'expiry_date' < '2025-01'

-- Fashion: variant stock lookups
CREATE INDEX idx_products_variants_gin
  ON products USING GIN ((attributes->'variants'))
  WHERE category = 'fashion';

-- ─────────────────────────────────────────────
-- Partial Indexes per Tenant for hot tenants
-- Prevents index bloat on rarely-accessed tenants
-- ─────────────────────────────────────────────
CREATE INDEX idx_products_tenant_001_expiry
  ON products ((attributes->>'expiry_date'))
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
    AND category = 'pharma';

-- Full-text search on product name + SKU
CREATE INDEX idx_products_fts
  ON products USING GIN (fts_vector);
```

### 2.3 GIN vs BTREE Decision Matrix

| Query Type | Index | Rationale |
|---|---|---|
| `attributes @> '{"key":"val"}'` | **GIN** | Containment check, any depth |
| `attributes->>'expiry' < '2025'` | **BTREE** on extracted | Scalar range query, B-Tree optimal |
| `attributes ? 'batch'` | **GIN** | Key existence check |
| Full-text name search | **GIN** (tsvector) | Lexeme inversion index |
| Equality on known enum (`category`) | **BTREE** on column | Standard column index |

### 2.4 Query Bloat Prevention

```sql
-- 1. Enable autovacuum aggressively for high-write tables
ALTER TABLE transactions SET (
    autovacuum_vacuum_scale_factor = 0.01,   -- trigger at 1% dead tuples
    autovacuum_analyze_scale_factor = 0.005,
    autovacuum_vacuum_cost_delay = 2          -- ms, reduce IO impact
);

-- 2. Partition transactions by month (prevents table bloat)
CREATE TABLE transactions_2025_04
  PARTITION OF transactions
  FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');

-- 3. JSONB schema discipline — reject unexpected shapes at app layer
-- Bad:  attributes = { "EXP": "2025", "exp_date": "25/12" }
-- Good: attributes = { "expiry_date": "2025-12" }  -- enforced by mapper
```

---

## 3. Redis Inventory Layer

### 3.1 Cache-Aside Pattern — Justification

**Why Cache-Aside over Read-Through/Write-Through?**
- **Selective caching**: Only hot products get cached (Pareto — 20% SKUs = 80% scans)
- **Resilience**: Cache failure doesn't block DB reads; app handles fallback explicitly
- **Granular TTL control**: Per-SKU TTL based on demand volatility

```
Barcode Scan → App
     │
     ├─► GET inventory:{tenant}:{outlet}:{sku}  ──→  Redis HIT → Return (< 2ms)
     │                                               
     └── MISS ──→ SELECT from PostgreSQL (< 20ms)
                  ──→ SET inventory:{tenant}:{outlet}:{sku} EX 300
                  ──→ Return to POS
```

### 3.2 Redis Key Schema

```
inventory:{tenant_id}:{outlet_id}:{sku}   → integer (stock quantity)
product:{tenant_id}:{sku}                 → JSON string (product metadata)
session:{cashier_id}                      → JSON string (auth session)
lock:inventory:{tenant_id}:{outlet_id}:{sku}  → 1 (distributed lock)
```

### 3.3 Concurrent Stock Updates — Race Condition Handling

**Problem**: Two cashiers at the same outlet scan the last unit simultaneously.

**Solution: Lua Script (Atomic Compare-and-Decrement)**

```lua
-- Redis Lua script: atomic stock decrement with guard
local key = KEYS[1]           -- inventory key
local requested = tonumber(ARGV[1])   -- qty requested

local current = tonumber(redis.call('GET', key))
if current == nil then
    return -1   -- cache miss, fall back to DB
end
if current < requested then
    return -2   -- insufficient stock
end

redis.call('DECRBY', key, requested)
return current - requested   -- new stock level
```

```
App receives -1 → DB fallback + re-cache
App receives -2 → "Out of stock" error returned to POS
App receives  N → Success, async DB write queued via SQS
```

### 3.4 Cache Invalidation Strategy

```
Event                   │  Action
────────────────────────┼──────────────────────────────────────────────
Sale completed          │  DECRBY in Redis (Lua) + async DB persist
Manual stock adjustment │  DEL key → force re-read from DB on next scan
Bulk import             │  Pipeline SET with EX 60 (short TTL for fresh)
Product updated         │  DEL product:{tenant}:{sku}
Outlet transfer         │  DEL both origin + destination outlet keys
```

### 3.5 Cache Warming & Fallback

```python
# Warm cache on outlet open (start of business day)
async def warm_outlet_cache(tenant_id: str, outlet_id: str):
    inventory = await db.fetch(
        "SELECT sku, quantity FROM inventory WHERE outlet_id=$1", outlet_id
    )
    pipe = redis.pipeline()
    for row in inventory:
        key = f"inventory:{tenant_id}:{outlet_id}:{row['sku']}"
        pipe.set(key, row['quantity'], ex=3600)
    await pipe.execute()
```

**Fallback Circuit Breaker**: If Redis is unreachable for >500ms, bypass via feature flag and serve directly from PostgreSQL read replica. Alert via CloudWatch + PagerDuty.

### 3.6 Consistency Model

| Scenario | Model | Rationale |
|---|---|---|
| Stock at POS | **Strong** (Lua atomic) | Prevent overselling |
| Dashboard display | **Eventual** (5s lag OK) | UX acceptable, save DB load |
| Analytics aggregations | **Eventual** | Batch reconcile acceptable |

---

## 4. Real-Time Event Streaming

### 4.1 Technology Evaluation

| Dimension | Socket.io (WebSocket) | Apache Kafka | AWS SNS/SQS |
|---|---|---|---|
| Latency | < 10ms | 10–50ms | 50–200ms |
| Throughput | Medium | Very High | High |
| Persistence | ❌ No replay | ✅ 7–30 day replay | ✅ SQS FIFO |
| Fan-out | Per-room broadcast | Consumer groups | SNS topic → N queues |
| Ops complexity | Low | High | Low (managed) |
| Best for | Live dashboards | Event sourcing, audit | Async workflows |

**Decision**: **Hybrid approach**

```
Sale Transaction
       │
       ├──► SQS FIFO Queue     → Receipt Worker (async, guaranteed delivery)
       │
       ├──► Kafka Topic        → Analytics pipeline (replay, audit, ML features)
       │
       └──► Socket.io Room     → Merchant dashboard (live counter, real-time UI)
            (tenant:{id})
```

### 4.2 Socket.io Room Architecture

```javascript
// Server: assign every socket to tenant-scoped room
io.use(authMiddleware);  // validates JWT, extracts tenant_id

io.on('connection', (socket) => {
    const { tenant_id, outlet_id } = socket.data;
    socket.join(`tenant:${tenant_id}`);          // merchant-wide room
    socket.join(`outlet:${outlet_id}`);          // outlet-specific room
});

// Emit on sale completion
async function emitSaleEvent(sale) {
    io.to(`tenant:${sale.tenant_id}`).emit('sale:new', {
        outlet_id:    sale.outlet_id,
        amount:       sale.total_amount,
        timestamp:    sale.created_at,
        item_count:   sale.line_items.length,
    });
}
```

### 4.3 Kafka Topic Design

```
topic: pos.sales          partitions: 32,  key: tenant_id  (co-locate per tenant)
topic: pos.inventory      partitions: 16,  key: outlet_id
topic: pos.receipts       partitions: 8,   key: transaction_id

Consumer Groups:
  analytics-consumer  → pos.sales  (Redshift/Athena ingestion)
  receipt-consumer    → pos.receipts (PDF worker)
  audit-consumer      → pos.sales + pos.inventory (immutable audit log)
```

### 4.4 Fault Tolerance

```
Socket.io        → Sticky sessions via ALB, Redis adapter for multi-node pub/sub
Kafka            → Replication factor 3, min.insync.replicas=2
SQS FIFO         → Dead Letter Queue after 3 retries, alarm on DLQ depth > 0
```

---

## 5. Digital Transaction Lifecycle

### 5.1 Dynamic CSV Mapper — Smart Onboarding

```
Merchant uploads CSV/Excel
        │
        ▼
┌───────────────────────┐
│   Schema Detector     │  Reads header row, samples 50 rows
│   - Fuzzy match SKU   │  sklearn cosine similarity on column names
│     vs Item_Code      │  "sku" ↔ "SKU", "Item_Code", "ItemID", "Code"
│   - Type inference    │  numeric / date / string / boolean
└──────────┬────────────┘
           │ confidence < 0.85?
           ▼
┌───────────────────────┐
│   UI Column Mapper    │  Drag-and-drop column → field mapping
│   (React component)   │  Shows sample values per column
│   Merchant confirms   │
└──────────┬────────────┘
           │
           ▼
┌───────────────────────────────────────────────────────┐
│                  Validation Pipeline                  │
│  [ ] SKU uniqueness within tenant                     │
│  [ ] Price is numeric and > 0                         │
│  [ ] Expiry date is future (pharma)                   │
│  [ ] Category in allowed enum                         │
│  [ ] Required fields not null                         │
└──────────┬────────────────────────────────────────────┘
           │  on error: reject row, collect errors
           ▼
┌───────────────────────┐
│  Normalization Layer  │
│  - Dates → ISO 8601   │
│  - Prices → 2 decimal │
│  - Names → title case │
│  - SKUs  → UPPER()    │
└──────────┬────────────┘
           │
           ▼
   INSERT / UPSERT into products (on conflict: update)
   Error report CSV downloaded by merchant
```

**Error Handling**:

```
Strategy: Partial import — valid rows are committed, invalid rows flagged
Output: error_report_{timestamp}.csv with row number + reason
UX: Green progress bar → "847/850 imported, 3 errors — download report"
```

### 5.2 Paperless Checkout — "Green Handshake"

```
POS Transaction Completes
         │
         ▼
┌────────────────────┐
│  API: POST /sales  │  idempotency_key = UUID generated at POS terminal
│  Returns: sale_id  │  (prevents duplicate if network retry)
└────────┬───────────┘
         │
         ├──► Sync:  Return sale confirmation to POS (< 50ms target)
         │
         └──► Async: Publish to SQS FIFO queue
                          │
                          ▼
              ┌───────────────────────┐
              │    Receipt Worker     │  ECS Task (autoscaled)
              │  (Python / Node.js)   │
              │  1. Fetch sale data   │
              │  2. Render PDF        │  WeasyPrint / Puppeteer
              │  3. Upload → S3       │  receipts/{tenant}/{YYYY/MM/DD}/{id}.pdf
              │  4. Generate QR Code  │  encodes pre-signed URL + UPI intent
              │  5. Update DB         │  transactions.receipt_s3_key = key
              └───────────────────────┘
```

**URL Design** (pre-signed, 30-day expiry):

```
https://receipts.yourdomain.com/r/{receipt_token}
  → Lambda@Edge validates token → redirect to S3 pre-signed URL (15min TTL)
  → Ensures the public QR never exposes real S3 path
  → Token stored in DB, invalidated post-expiry

QR Data:
{
  "type": "receipt",
  "receipt_url": "https://receipts.yourdomain.com/r/abc123",
  "upi_intent": "upi://pay?pa=merchant@upi&pn=StoreName&am=250.00&cu=INR"
}
```

**Idempotency Guarantee**:
```sql
INSERT INTO transactions (idempotency_key, ...)
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING id;
-- If RETURNING is empty → receipt already generated, skip worker
```

**S3 Lifecycle Policy**:
```json
{
  "Rules": [{
    "Id": "delete-old-receipts",
    "Status": "Enabled",
    "Filter": { "Prefix": "receipts/" },
    "Expiration": { "Days": 30 },
    "Transitions": [{
      "Days": 7,
      "StorageClass": "STANDARD_IA"
    }]
  }]
}
```

---

## 6. Cloud Infrastructure

### 6.1 VPC Network Architecture

```
AWS Region: ap-south-1 (Mumbai)

VPC: 10.0.0.0/16
│
├── Public Subnets (10.0.1.0/24, 10.0.2.0/24)  [AZ-a, AZ-b]
│   ├── ALB (Application Load Balancer)
│   ├── NAT Gateway
│   └── Nginx containers (ECS, port 80/443)
│
├── Private App Subnets (10.0.10.0/24, 10.0.11.0/24) [AZ-a, AZ-b]
│   ├── ECS Tasks: POS, Inventory, Analytics, Receipt Worker
│   └── Internal ALB (service mesh)
│
└── Private Data Subnets (10.0.20.0/24, 10.0.21.0/24) [AZ-a, AZ-b]
    ├── RDS PostgreSQL (Multi-AZ, encrypted)
    └── ElastiCache Redis (cluster mode, encrypted in-transit)

Security Groups:
  sg-alb        → INBOUND 443 from 0.0.0.0/0
  sg-app        → INBOUND 8080 from sg-alb only
  sg-rds        → INBOUND 5432 from sg-app only
  sg-redis      → INBOUND 6379 from sg-app only
```

### 6.2 Terraform Infrastructure as Code

```hcl
# --- VPC ---
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  name    = "pos-platform-vpc"
  cidr    = "10.0.0.0/16"
  azs     = ["ap-south-1a", "ap-south-1b"]

  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.10.0/24", "10.0.11.0/24",
                     "10.0.20.0/24", "10.0.21.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false   # HA: one per AZ
  enable_dns_hostnames = true
}

# --- RDS PostgreSQL ---
resource "aws_db_instance" "postgres" {
  identifier             = "pos-db-${var.env}"
  engine                 = "postgres"
  engine_version         = "16.2"
  instance_class         = "db.r7g.large"
  allocated_storage      = 100
  storage_encrypted      = true
  kms_key_id             = aws_kms_key.rds.arn
  multi_az               = true
  backup_retention_period = 14
  deletion_protection    = true
  db_subnet_group_name   = aws_db_subnet_group.data.id
  vpc_security_group_ids = [aws_security_group.rds.id]

  parameter_group_name = aws_db_parameter_group.pos.id
}

resource "aws_db_parameter_group" "pos" {
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }
}

# --- ElastiCache Redis ---
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = "pos-redis-${var.env}"
  description                   = "POS inventory cache"
  node_type                     = "cache.r7g.medium"
  num_cache_clusters            = 2     # primary + replica
  at_rest_encryption_enabled    = true
  transit_encryption_enabled    = true
  automatic_failover_enabled    = true
  subnet_group_name             = aws_elasticache_subnet_group.data.name
  security_group_ids            = [aws_security_group.redis.id]
}

# --- S3 Receipts ---
resource "aws_s3_bucket" "receipts" {
  bucket = "pos-receipts-${var.account_id}-${var.env}"
}

resource "aws_s3_bucket_lifecycle_configuration" "receipts" {
  bucket = aws_s3_bucket.receipts.id
  rule {
    id     = "receipt-lifecycle"
    status = "Enabled"
    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }
    expiration {
      days = 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "receipts" {
  bucket = aws_s3_bucket.receipts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### 6.3 Nginx — SSL Termination & Reverse Proxy

```nginx
upstream pos_api {
    least_conn;
    server pos-service:8080;
    server pos-service:8081;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.yourpos.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    location /api/ {
        proxy_pass         http://pos_api;
        proxy_http_version 1.1;
        proxy_set_header   Connection "";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }

    location /ws/ {
        proxy_pass         http://websocket_service:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_read_timeout 3600s;    # keep WS alive
    }
}
```

---

## 7. Security & Multi-Tenancy

### 7.1 Row-Level Security (RLS) in PostgreSQL

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Application sets current tenant via session variable
-- API middleware: SET LOCAL app.current_tenant = '{tenant_id}'

-- Policy: read own data only
CREATE POLICY tenant_isolation_select ON products
    FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_insert ON products
    FOR INSERT
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_update ON products
    FOR UPDATE
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Service role bypasses RLS for migrations only
CREATE ROLE app_user NOLOGIN;
GRANT SELECT, INSERT, UPDATE ON products TO app_user;
-- Note: SUPERUSER and BYPASSRLS roles are NEVER granted to app_user

-- Each API connection uses app_user with tenant set per-request:
-- SET LOCAL app.current_tenant = $1;  -- injected by middleware
```

**Middleware enforcement**:

```python
@contextmanager
async def tenant_context(conn, tenant_id: str):
    """Injects tenant into DB session — mandatory for every query."""
    await conn.execute(
        "SET LOCAL app.current_tenant = $1", tenant_id
    )
    try:
        yield conn
    finally:
        # LOCAL is auto-reset at transaction end
        pass
```

### 7.2 Zero-Trust Architecture

```
Principle: "Never trust, always verify" — every hop is authenticated.

External Request
  → ALB (TLS termination)
  → API Gateway (JWT validation via Cognito/Auth0)
  → ECS Service (receives verified claims in header)
  → DB call (sets RLS tenant context from verified JWT)

Internal Service-to-Service:
  → mTLS between ECS tasks (AWS App Mesh / Envoy sidecar)
  → No service calls allowed without valid mTLS cert

IAM Roles (no static credentials):
  → ECS Task Role: s3:PutObject on receipts/ prefix only
  → ECS Task Role: sqs:SendMessage on pos-receipts queue only
  → RDS IAM Auth: no password, token-based rotating credentials
```

**JWT Structure**:

```json
{
  "sub": "cashier-user-id",
  "tenant_id": "uuid",
  "outlet_id": "uuid",
  "role": "cashier",
  "permissions": ["sale:create", "product:read"],
  "exp": 1714000000
}
```

**Token scoping**: Cashier tokens can only access their outlet. Manager tokens can access all outlets within the tenant. Admin tokens are time-limited (4-hour expiry), MFA required.

---

## 8. Performance Engineering

### 8.1 Sub-50ms POS Barcode Scan Path

```
Target: Barcode Scan → Product + Stock → POS Screen ≤ 50ms

Breakdown of budget:
  Network (client → ALB)         :  5ms
  Nginx proxy overhead           :  1ms
  App server (Node.js/FastAPI)   :  3ms
  Redis GET (ElastiCache, same AZ):  1–2ms
  JSON deserialize + respond     :  2ms
  Network (server → client)      :  5ms
  ───────────────────────────────────────
  Total (cache HIT)              : ~17ms  ✅

  Cache MISS path:
  + PostgreSQL (indexed PK lookup): 15–20ms
  + SET in Redis                  :  1ms
  Total (cache MISS)              : ~38ms  ✅
```

**Optimizations**:

```
1. Keep Redis in same AZ as ECS tasks (reduce RTT from 2ms → 0.5ms)
2. Use HTTP/2 persistent connections to API
3. Batch barcode pre-fetch: scan first item → prefetch next 3 from same category
4. Use MessagePack instead of JSON for Redis values (30% smaller payload)
5. Connection pooling: PgBouncer (transaction mode) for PostgreSQL
6. Node.js cluster mode or FastAPI with uvicorn workers (avoid single-thread bottleneck)
```

### 8.2 Analytics Isolation — OLAP vs OLTP

```
Problem: Heavy GROUP BY across millions of transactions kills POS latency.

Solution: Read Replica + Async Export to OLAP

OLTP (RDS Primary)          OLAP (Redshift / Athena)
─────────────────           ──────────────────────────
POS transactions    ──DMS──► transactions table (replicated)
Product lookups              → Sales by merchant, outlet, date
Inventory updates            → Top products per period
                             → Revenue trends

Read Replica (RDS):
  → Dashboard "today's sales" queries
  → Reports up to 15s delay acceptable
  → Isolated from primary write path

Athena (serverless OLAP):
  → Monthly/quarterly reports
  → Cross-merchant benchmarking (anonymized)
  → Parquet files in S3, query cost: $5/TB scanned
```

---

## 9. Failure Scenarios & Mitigations

| Failure | Impact | Detection | Mitigation |
|---|---|---|---|
| Redis crash | Slow POS (DB fallback) | CloudWatch: cache miss rate > 80% | Circuit breaker → DB fallback; auto-restore on reconnect |
| RDS primary failure | Write outage | RDS event, CloudWatch | Multi-AZ auto-failover (< 60s), retry with exponential backoff |
| Receipt worker crash | Delayed receipts | SQS queue depth > threshold | DLQ captures failed messages; worker auto-restarts via ECS |
| Network partition (outlet ↔ cloud) | No cloud sync | Heartbeat timeout | Offline mode: local SQLite on POS terminal, sync on reconnect |
| Duplicate transaction | Double charge | Idempotency key conflict | `ON CONFLICT DO NOTHING` + client-side idempotency key |
| Tenant data leak via query | Cross-tenant breach | Test suite, RLS audit | RLS enforced at DB level; no bypass possible at app layer |
| S3 pre-signed URL leak | Unauthorized receipt access | CloudTrail + GuardDuty | Lambda@Edge token validation; short-lived inner URLs (15min) |
| Kafka broker failure | Delayed analytics | Kafka broker down alert | RF=3, ISR=2; producer retries with backpressure |
| DDoS / traffic spike | POS latency spike | WAF rule triggers | AWS WAF rate limiting per tenant; autoscaling ECS tasks |

---

## 10. Scalability Roadmap

### Phase 1: 10–100 Merchants (Current)
```
Single RDS instance (Multi-AZ)
ElastiCache single-shard Redis
ECS Fargate with autoscaling
Single AWS region
Monthly cost: ~$800–2,000
```

### Phase 2: 100–1,000 Merchants
```
Add: RDS read replica per region
Add: Redis cluster mode (sharding by tenant hash)
Add: Kafka for event streaming (replace SQS for analytics)
Add: Separate analytics RDS or Redshift cluster
Add: API Gateway rate limiting per tenant tier
Monthly cost: ~$5,000–15,000
```

### Phase 3: 1,000–10,000 Merchants
```
Shard: PostgreSQL by tenant cohort (Citus extension or separate RDS)
Add: Multi-region deployment (Mumbai + Singapore)
Add: CDN (CloudFront) for static assets + receipt QR landing page
Add: Dedicated Kafka + Flink stream processing cluster
Add: ML-based demand forecasting per tenant (SageMaker)
Add: Tenant tier quotas enforced at API Gateway
Monthly cost: ~$40,000–120,000

Tenant sharding strategy:
  Shard 0: Tenants 0000–024F (hash ring)
  Shard 1: Tenants 0250–049F
  ...each shard = isolated RDS + Redis cluster
  Tenant metadata DB remains global (single PG for routing)
```

### Cost Optimization Strategies Across All Phases

```
1. Spot Instances for receipt workers (fault-tolerant, batchable)
2. S3 Intelligent-Tiering for receipts > 7 days
3. Reserved Instances for RDS and ElastiCache (1-year, 40% savings)
4. Lambda for low-frequency tasks (CSV validation, QR generation)
5. Athena vs Redshift: use Athena until query volume justifies Redshift
6. CloudFront caching for product images and static catalog data
```

---

## Summary: Key Design Decisions & Trade-offs

| Decision | Chosen Approach | Trade-off |
|---|---|---|
| Product schema | PostgreSQL + JSONB | Flexibility ↑, query complexity ↑ |
| Cache strategy | Cache-aside | Resilience ↑, staleness risk (mitigated by Lua) |
| Streaming | Socket.io + Kafka hybrid | Latency ↑ (WS), Durability ↑ (Kafka) |
| Tenant isolation | RLS in DB | Zero-leakage guarantee, slight query overhead |
| Receipt delivery | Async SQS + S3 | Decoupled POS path, receipts delayed by ~3s |
| OLAP separation | Read replica + Athena | Analytics isolated from POS, eventual consistency |
| Auth | JWT + RLS (double enforcement) | Defense-in-depth, redundant but correct |
| Multi-region | Phase 3 only | Cost deferred until scale justifies it |
