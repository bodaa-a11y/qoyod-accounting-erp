-- db/migration_006_accounting_controls.sql
-- Advanced Page-Level Accounting Workflow & Financial Controls
-- Party Linking, Line-Level Account Allocations, Tax Modes (Inclusive/Exclusive),
-- Product/Party Default Accounts, Cost Centers & Referential Traceability

-- 1. Tax Settings & Cost Centers Tables
CREATE TABLE IF NOT EXISTS tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  category_code VARCHAR(30) NOT NULL, -- 'standard', 'zero', 'exempt', 'out_of_scope'
  name_ar VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  rate NUMERIC(5, 2) NOT NULL DEFAULT 15.00,
  output_vat_account_code VARCHAR(50) DEFAULT '210201',
  input_vat_account_code VARCHAR(50) DEFAULT '110501',
  is_recoverable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, category_code)
);

CREATE TABLE IF NOT EXISTS cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name_ar VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, code)
);

-- 2. Enhance Journal Entries & Journal Lines with Party Linking & Dimensions
ALTER TABLE journals ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS project_ref VARCHAR(100);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS source_doc_ref VARCHAR(100);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE journals ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS party_type VARCHAR(30) CHECK (party_type IN ('customer', 'supplier', 'employee', 'other') OR party_type IS NULL);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS party_id VARCHAR(100);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS party_name VARCHAR(255);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS project_ref VARCHAR(100);
ALTER TABLE journal_lines ADD COLUMN IF NOT EXISTS source_doc_ref VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_journal_lines_party ON journal_lines(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_cost_center ON journal_lines(cost_center);

-- 3. Enhance Sales Invoices & Invoice Lines with Account Allocation & Tax Mode
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receivable_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receivable_account_code VARCHAR(50) DEFAULT '110301';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS warehouse VARCHAR(100) DEFAULT 'المستودع الرئيسي';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SAR';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(12, 6) DEFAULT 1.000000;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) NOT NULL DEFAULT 'exclusive' CHECK (tax_mode IN ('exclusive', 'inclusive'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_ref VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS internal_ref VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'credit';

ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS product_id VARCHAR(100);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'وحدة';
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS discount_halalas BIGINT NOT NULL DEFAULT 0;
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS tax_category VARCHAR(30) NOT NULL DEFAULT 'standard' CHECK (tax_category IN ('standard', 'zero', 'exempt', 'out_of_scope'));
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS revenue_account_code VARCHAR(50) DEFAULT '410101';
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE invoice_lines ADD COLUMN IF NOT EXISTS warehouse VARCHAR(100);

-- 4. Enhance Purchase Invoices & Purchase Lines with Account Allocation & Tax Mode
CREATE TABLE IF NOT EXISTS purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  supplier_id VARCHAR(100),
  supplier_name VARCHAR(255) NOT NULL,
  supplier_invoice_number VARCHAR(100),
  invoice_number VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payable_account_code VARCHAR(50) NOT NULL DEFAULT '210101',
  payment_method VARCHAR(50) NOT NULL DEFAULT 'credit',
  warehouse VARCHAR(100) DEFAULT 'المستودع الرئيسي',
  tax_mode VARCHAR(20) NOT NULL DEFAULT 'exclusive' CHECK (tax_mode IN ('exclusive', 'inclusive')),
  cost_center VARCHAR(100),
  branch VARCHAR(100),
  project_ref VARCHAR(100),
  subtotal_halalas BIGINT NOT NULL DEFAULT 0,
  discount_halalas BIGINT NOT NULL DEFAULT 0,
  vat_halalas BIGINT NOT NULL DEFAULT 0,
  total_halalas BIGINT NOT NULL DEFAULT 0,
  paid_halalas BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'posted',
  notes TEXT,
  journal_id UUID,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS supplier_invoice_number VARCHAR(100);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS payable_account_code VARCHAR(50) DEFAULT '210101';
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS warehouse VARCHAR(100) DEFAULT 'المستودع الرئيسي';
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS tax_mode VARCHAR(20) DEFAULT 'exclusive';
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS cost_center VARCHAR(100);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS branch VARCHAR(100);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS project_ref VARCHAR(100);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS discount_halalas BIGINT DEFAULT 0;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS journal_id UUID;
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

CREATE TABLE IF NOT EXISTS purchase_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_invoice_id UUID NOT NULL REFERENCES purchase_invoices(id) ON DELETE CASCADE,
  product_id VARCHAR(100),
  description TEXT NOT NULL,
  qty NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit VARCHAR(50) DEFAULT 'وحدة',
  unit_price_halalas BIGINT NOT NULL DEFAULT 0,
  discount_halalas BIGINT NOT NULL DEFAULT 0,
  tax_category VARCHAR(30) NOT NULL DEFAULT 'standard' CHECK (tax_category IN ('standard', 'zero', 'exempt', 'out_of_scope')),
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 15,
  expense_account_code VARCHAR(50) NOT NULL DEFAULT '510101',
  recoverable_vat_account_code VARCHAR(50) DEFAULT '110501',
  cost_center VARCHAR(100),
  warehouse VARCHAR(100),
  subtotal_halalas BIGINT NOT NULL DEFAULT 0,
  vat_halalas BIGINT NOT NULL DEFAULT 0,
  total_halalas BIGINT NOT NULL DEFAULT 0
);

-- 5. Enhance Customer, Supplier & Product Accounting Configurations
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ar_account_code VARCHAR(50) DEFAULT '110301';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_revenue_account_code VARCHAR(50) DEFAULT '410101';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'net_30';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit_halalas BIGINT DEFAULT 0;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT 'SAR';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS billing_address TEXT;

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_number VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  ap_account_code VARCHAR(50) NOT NULL DEFAULT '210101',
  default_expense_account_code VARCHAR(50) DEFAULT '510101',
  payment_terms VARCHAR(50) DEFAULT 'net_30',
  billing_address TEXT,
  payment_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS ap_account_code VARCHAR(50) DEFAULT '210101';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_expense_account_code VARCHAR(50) DEFAULT '510101';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(50) DEFAULT 'net_30';
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS billing_address TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS payment_info TEXT;

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sku VARCHAR(100) NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) DEFAULT 'وحدة',
  qty NUMERIC(15, 3) NOT NULL DEFAULT 0,
  cost_halalas BIGINT NOT NULL DEFAULT 0,
  price_halalas BIGINT NOT NULL DEFAULT 0,
  reorder_level NUMERIC(15, 3) DEFAULT 10,
  sales_revenue_account_code VARCHAR(50) DEFAULT '410101',
  purchase_expense_account_code VARCHAR(50) DEFAULT '510101',
  inventory_asset_account_code VARCHAR(50) DEFAULT '110401',
  cogs_account_code VARCHAR(50) DEFAULT '510101',
  vat_treatment VARCHAR(30) DEFAULT 'standard',
  default_warehouse VARCHAR(100) DEFAULT 'المستودع الرئيسي',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS sales_revenue_account_code VARCHAR(50) DEFAULT '410101';
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_expense_account_code VARCHAR(50) DEFAULT '510101';
ALTER TABLE products ADD COLUMN IF NOT EXISTS inventory_asset_account_code VARCHAR(50) DEFAULT '110401';
ALTER TABLE products ADD COLUMN IF NOT EXISTS cogs_account_code VARCHAR(50) DEFAULT '510101';
ALTER TABLE products ADD COLUMN IF NOT EXISTS vat_treatment VARCHAR(30) DEFAULT 'standard';
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_warehouse VARCHAR(100) DEFAULT 'المستودع الرئيسي';
