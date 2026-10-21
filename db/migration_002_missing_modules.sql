-- Migration 002: Modules referenced by the sidebar/UI but missing from db/schema.sql
-- All money columns are BIGINT halalas. Idempotent (IF NOT EXISTS).

-- 0. system_state — referenced by src/server.js (/api/state) but absent from schema.sql
CREATE TABLE IF NOT EXISTS system_state (
  key VARCHAR(100) PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Vendors (الموردون) — sidebar "المشتريات > الموردون"
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_number VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendors_entity ON vendors(entity_id);

-- 2. Purchase invoices (فواتير المشتريات)
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'paid', 'cancelled')),
  subtotal_halalas BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_halalas >= 0),
  vat_halalas BIGINT NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
  total_halalas BIGINT NOT NULL DEFAULT 0 CHECK (total_halalas >= 0),
  paid_halalas BIGINT NOT NULL DEFAULT 0 CHECK (paid_halalas >= 0),
  idempotency_key VARCHAR(255),
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_pinv_idempotency UNIQUE (entity_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_entity ON purchase_invoices(entity_id);

CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  expense_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  qty NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_halalas BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_halalas >= 0),
  vat_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
  subtotal_halalas BIGINT NOT NULL DEFAULT 0,
  vat_halalas BIGINT NOT NULL DEFAULT 0,
  total_halalas BIGINT NOT NULL DEFAULT 0
);

-- 3. Payments to vendors (سندات الصرف)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE RESTRICT,
  payment_number VARCHAR(100) NOT NULL,
  amount_halalas BIGINT NOT NULL CHECK (amount_halalas > 0),
  cash_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  method VARCHAR(50) NOT NULL DEFAULT 'cash',
  notes TEXT,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Products / Inventory (المخزون)
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  sale_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  purchase_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  inventory_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  default_vat_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_product_sku UNIQUE (entity_id, sku)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(14,4) NOT NULL,
  unit_cost_halalas BIGINT NOT NULL DEFAULT 0,
  source_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  source_id UUID,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Payroll (الرواتب والموظفون)
CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  national_id VARCHAR(50),
  hire_date DATE,
  salary_halalas BIGINT NOT NULL DEFAULT 0 CHECK (salary_halalas >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  total_halalas BIGINT NOT NULL DEFAULT 0,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_payroll_period UNIQUE (entity_id, period_year, period_month)
);
